-- Stage05: the two atomic writes behind POST /v1/units/:unitId/start and /attempts.
-- Design: ../../content/storage-model.json (atomic_operations, access.atomic_submission)
-- and docs/planning/approved-decisions.json#stage05_atomic_attempt_functions.
--
-- Division of work: NestJS decides WHAT happens with the tested pure code in
-- content/src/progress.ts (correct or not, feedback, next activity). These
-- functions only make the write safe: one transaction, one learner/unit at a
-- time, retries answered from the log, stale progress refused.
--
-- Both run as the caller (SECURITY INVOKER) and only the server role may call
-- them. The server role bypasses RLS, so every read and write here is scoped to
-- p_user_id, which NestJS takes from the verified token, never from the body.

-- Starts a unit for a learner, or returns what already exists. Two taps on
-- "start" at the same moment create one row.
create function public.start_unit_progress(
  p_user_id uuid,
  p_unit_id text,
  p_revision integer,
  p_first_activity_id text,
  p_scenario_node_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing public.user_unit_progress;
begin
  if p_user_id is null or p_unit_id is null or p_revision is null or p_first_activity_id is null then
    raise exception 'start_unit_progress: missing argument';
  end if;

  -- One start at a time per learner and unit, even before any row exists to lock.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || '/' || p_unit_id, 0));

  -- An active attempt stays pinned to its revision, whatever revision was asked for.
  select * into existing from public.user_unit_progress
    where user_id = p_user_id and unit_id = p_unit_id and status = 'in_progress';
  if found then
    return jsonb_build_object('status', 'existing', 'progress', to_jsonb(existing));
  end if;

  select * into existing from public.user_unit_progress
    where user_id = p_user_id and unit_id = p_unit_id and revision = p_revision and status = 'completed';
  if found then
    return jsonb_build_object('status', 'completed', 'progress', to_jsonb(existing));
  end if;

  insert into public.user_unit_progress (user_id, unit_id, revision, current_activity_id, scenario_node_id)
    values (p_user_id, p_unit_id, p_revision, p_first_activity_id, p_scenario_node_id)
    returning * into existing;
  return jsonb_build_object('status', 'started', 'progress', to_jsonb(existing));
end;
$$;

-- Saves one attempt and the new progress together, or nothing at all.
-- Returns {status: stored | replayed | conflict | not_found, ...}.
create function public.submit_activity_attempt(
  p_user_id uuid,
  p_request_id uuid,
  p_unit_id text,
  p_revision integer,
  p_activity_id text,
  p_fingerprint text,
  p_response jsonb,
  p_expected_version integer,
  -- Computed by applyAttempt in NestJS from the progress it read at p_expected_version.
  p_result jsonb,
  p_progress jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_row public.user_unit_progress;
  previous public.activity_attempts;
  next_status text := p_progress ->> 'status';
begin
  if p_user_id is null or p_request_id is null or p_unit_id is null or p_revision is null
     or p_activity_id is null or p_fingerprint is null or p_response is null
     or p_expected_version is null or p_result is null or p_progress is null then
    raise exception 'submit_activity_attempt: missing argument';
  end if;

  -- 1. Lock this learner's progress in this revision. A second request for the same
  --    learner and unit waits here until this transaction ends.
  select * into current_row from public.user_unit_progress
    where user_id = p_user_id and unit_id = p_unit_id and revision = p_revision
    for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- 2. A retry of a stored request gets the stored answer and changes nothing.
  --    The same id with other content is a client bug, not a retry.
  select * into previous from public.activity_attempts
    where user_id = p_user_id and request_id = p_request_id;
  if found then
    if previous.request_fingerprint = p_fingerprint then
      return jsonb_build_object('status', 'replayed', 'result', previous.server_result);
    end if;
    return jsonb_build_object('status', 'conflict', 'reason', 'request_id_reused');
  end if;

  -- 3. The answer was computed from version p_expected_version of this activity.
  --    If the progress moved on since, refuse; the app reloads its progress.
  if current_row.status <> 'in_progress'
     or current_row.progress_version <> p_expected_version
     or current_row.current_activity_id is distinct from p_activity_id then
    return jsonb_build_object('status', 'conflict', 'reason', 'progress_changed',
      'progress', to_jsonb(current_row));
  end if;

  -- A malformed new state is a server bug: stop before writing anything.
  if (p_progress ->> 'progressVersion')::integer is distinct from p_expected_version + 1
     or coalesce(next_status, '') not in ('in_progress', 'completed')
     or jsonb_typeof(p_progress -> 'completed') is distinct from 'array' then
    raise exception 'submit_activity_attempt: invalid new progress';
  end if;

  -- 4. Both writes or neither (one transaction).
  insert into public.activity_attempts
    (user_id, request_id, unit_id, revision, activity_id, request_fingerprint, response, server_result)
  values
    (p_user_id, p_request_id, p_unit_id, p_revision, p_activity_id, p_fingerprint, p_response, p_result);

  update public.user_unit_progress set
    status = next_status,
    current_activity_id = p_progress ->> 'currentActivityId',
    scenario_node_id = p_progress ->> 'scenarioNodeId',
    used_help_for_current = coalesce((p_progress ->> 'usedHelpForCurrent')::boolean, false),
    completed_activity_evidence = p_progress -> 'completed',
    progress_version = p_expected_version + 1,
    updated_at = now(),
    completed_at = case when next_status = 'completed' then now() else null end
  where user_id = p_user_id and unit_id = p_unit_id and revision = p_revision;

  return jsonb_build_object('status', 'stored', 'result', p_result);
end;
$$;

-- Only the trusted server may call them. Supabase grants EXECUTE on new public
-- functions to anon and authenticated by default, so revoke it explicitly.
revoke all on function public.start_unit_progress(uuid, text, integer, text, text)
  from public, anon, authenticated;
revoke all on function public.submit_activity_attempt(uuid, uuid, text, integer, text, text, jsonb, integer, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.start_unit_progress(uuid, text, integer, text, text) to service_role;
grant execute on function public.submit_activity_attempt(uuid, uuid, text, integer, text, text, jsonb, integer, jsonb, jsonb) to service_role;

comment on function public.start_unit_progress(uuid, text, integer, text, text) is
  'Server-only. Returns the active progress, the completed progress of this revision, or a newly started row; serialized per learner and unit.';
comment on function public.submit_activity_attempt(uuid, uuid, text, integer, text, text, jsonb, integer, jsonb, jsonb) is
  'Server-only. Atomically stores an attempt and the new progress computed by NestJS. Replays a stored request, refuses a reused request id or stale progress.';

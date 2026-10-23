-- Run this WHOLE file after create_attempt_functions in the development SQL Editor.
-- It creates two synthetic users and synthetic content, then checks the start and
-- submit functions as the server role: start/resume/completed, store, replay after
-- the progress moved on, reused request id, stale version, wrong activity, invalid
-- new state, per-learner isolation and completion. It also checks that learners and
-- anon cannot call them. Everything is rolled back; no real data is touched.
-- Limit: one SQL Editor session cannot send two requests at the same moment. The
-- row lock that serializes parallel requests is checked later through the API.
begin;

-- 1. Structure and privileges.
do $checks$
declare
  fn text;
begin
  foreach fn in array array[
    'public.start_unit_progress(uuid, text, integer, text, text)',
    'public.submit_activity_attempt(uuid, uuid, text, integer, text, text, jsonb, integer, jsonb, jsonb)'
  ] loop
    if (select prosecdef from pg_proc where oid = fn::regprocedure) then
      raise exception '% must be SECURITY INVOKER', fn;
    end if;
    if not (select 'search_path=""' = any(proconfig) from pg_proc where oid = fn::regprocedure) then
      raise exception '% must set an empty search_path', fn;
    end if;
    if has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE') then
      raise exception '% must not be callable by anon or authenticated', fn;
    end if;
    if not has_function_privilege('service_role', fn, 'EXECUTE') then
      raise exception '% must be callable by service_role', fn;
    end if;
  end loop;
end;
$checks$;

-- 2. Synthetic users and content (as the SQL Editor owner role).
do $checks$
declare
  user_a uuid := gen_random_uuid();
  user_b uuid := gen_random_uuid();
  fixture_course text := '__check_course_' || gen_random_uuid()::text;
  fixture_chapter text := '__check_chapter_' || gen_random_uuid()::text;
  fixture_unit text := '__check_unit_' || gen_random_uuid()::text;
begin
  insert into auth.users (id, aud, role, email) values
    (user_a, 'authenticated', 'authenticated', user_a::text || '@check.invalid'),
    (user_b, 'authenticated', 'authenticated', user_b::text || '@check.invalid');
  insert into public.courses (id, title_he) values (fixture_course, 'קורס בדיקה זמני');
  insert into public.chapters (id, course_id, title_he, position)
    values (fixture_chapter, fixture_course, 'פרק בדיקה זמני', 1);
  insert into public.units (id, chapter_id, title_he, position)
    values (fixture_unit, fixture_chapter, 'יחידת בדיקה זמנית', 1);
  insert into public.unit_revisions
    (unit_id, revision, schema_version, authoring_payload, source_digest, status)
  values (fixture_unit, 1, 2,
    jsonb_build_object('id', fixture_unit, 'revision', 1, 'schemaVersion', 2, 'status', 'draft'),
    repeat('a', 64), 'draft');

  perform set_config('check.user_a', user_a::text, true);
  perform set_config('check.user_b', user_b::text, true);
  perform set_config('check.unit', fixture_unit, true);
end;
$checks$;

-- 3. The server role uses both functions.
set local role service_role;
do $checks$
declare
  user_a uuid := current_setting('check.user_a')::uuid;
  user_b uuid := current_setting('check.user_b')::uuid;
  fixture_unit text := current_setting('check.unit');
  r1 uuid := gen_random_uuid();
  answer jsonb := '{"kind": "choice", "choiceId": "hello"}';
  first_result jsonb := '{"outcome": "correct", "feedbackHe": "נכון!"}';
  -- The new state applyAttempt would compute after a1: on to a2, version 1.
  after_a1 jsonb := '{"status": "in_progress", "currentActivityId": "a2", "scenarioNodeId": null,
    "usedHelpForCurrent": false, "progressVersion": 1,
    "completed": [{"activityId": "a1", "evidence": "correct", "usedHelp": false, "comparisonMode": null}]}';
  outcome jsonb;
  row_now public.user_unit_progress;
begin
  -- Start, then start again: one row, the same row.
  outcome := public.start_unit_progress(user_a, fixture_unit, 1, 'a1', null);
  if outcome ->> 'status' <> 'started' or outcome -> 'progress' ->> 'current_activity_id' <> 'a1' then
    raise exception 'Expected a new start at a1, got %', outcome;
  end if;
  outcome := public.start_unit_progress(user_a, fixture_unit, 1, 'a1', null);
  if outcome ->> 'status' <> 'existing' then
    raise exception 'Expected a second start to return the existing row, got %', outcome;
  end if;
  if (select count(*) from public.user_unit_progress where user_id = user_a) <> 1 then
    raise exception 'A repeated start created a second row';
  end if;
  perform public.start_unit_progress(user_b, fixture_unit, 1, 'a1', null);

  -- Store an answer: the attempt and the new progress are written together.
  outcome := public.submit_activity_attempt(user_a, r1, fixture_unit, 1, 'a1', repeat('c', 64),
    answer, 0, first_result, after_a1);
  if outcome ->> 'status' <> 'stored' then
    raise exception 'Expected stored, got %', outcome;
  end if;
  select * into row_now from public.user_unit_progress where user_id = user_a and unit_id = fixture_unit;
  if row_now.progress_version <> 1 or row_now.current_activity_id <> 'a2'
     or jsonb_array_length(row_now.completed_activity_evidence) <> 1 then
    raise exception 'Progress was not updated with the attempt';
  end if;

  -- The disconnect case: the same request again, after the progress moved on to a2.
  -- It gets the stored answer and nothing changes.
  outcome := public.submit_activity_attempt(user_a, r1, fixture_unit, 1, 'a1', repeat('c', 64),
    answer, 0, first_result, after_a1);
  if outcome ->> 'status' <> 'replayed' or outcome -> 'result' <> first_result then
    raise exception 'Expected the stored result to be replayed, got %', outcome;
  end if;
  if (select count(*) from public.activity_attempts where user_id = user_a) <> 1
     or (select progress_version from public.user_unit_progress where user_id = user_a and unit_id = fixture_unit) <> 1 then
    raise exception 'A replay wrote something';
  end if;

  -- The same request id with other content is refused.
  outcome := public.submit_activity_attempt(user_a, r1, fixture_unit, 1, 'a1', repeat('d', 64),
    '{"kind": "choice", "choiceId": "thanks"}', 0, first_result, after_a1);
  if outcome ->> 'status' <> 'conflict' or outcome ->> 'reason' <> 'request_id_reused' then
    raise exception 'Expected request_id_reused, got %', outcome;
  end if;

  -- A new request computed from the old version 0 is refused: the progress changed.
  outcome := public.submit_activity_attempt(user_a, gen_random_uuid(), fixture_unit, 1, 'a1', repeat('e', 64),
    answer, 0, first_result, after_a1);
  if outcome ->> 'status' <> 'conflict' or outcome ->> 'reason' <> 'progress_changed' then
    raise exception 'Expected progress_changed for a stale version, got %', outcome;
  end if;

  -- The right version but not the current activity is refused too.
  outcome := public.submit_activity_attempt(user_a, gen_random_uuid(), fixture_unit, 1, 'a1', repeat('e', 64),
    answer, 1, first_result, jsonb_set(after_a1, '{progressVersion}', '2'));
  if outcome ->> 'status' <> 'conflict' then
    raise exception 'Expected a conflict for an activity that is not current, got %', outcome;
  end if;
  if (select count(*) from public.activity_attempts where user_id = user_a) <> 1 then
    raise exception 'A refused request was stored';
  end if;

  -- An impossible new version is a server bug: nothing is written.
  begin
    perform public.submit_activity_attempt(user_a, gen_random_uuid(), fixture_unit, 1, 'a2', repeat('f', 64),
      '{"kind": "continue"}', 1, '{"outcome": "viewed"}', jsonb_set(after_a1, '{progressVersion}', '5'));
    raise exception 'Expected an invalid new progress to be refused';
  exception when raise_exception then
    if sqlerrm not like 'submit_activity_attempt: invalid new progress%' then raise; end if;
  end;

  -- Learner B was never touched, and a learner without progress gets not_found.
  if (select progress_version from public.user_unit_progress where user_id = user_b and unit_id = fixture_unit) <> 0 then
    raise exception 'Learner A''s attempts changed learner B''s progress';
  end if;
  outcome := public.submit_activity_attempt(gen_random_uuid(), gen_random_uuid(), fixture_unit, 1, 'a1', repeat('c', 64),
    answer, 0, first_result, after_a1);
  if outcome ->> 'status' <> 'not_found' then
    raise exception 'Expected not_found without progress, got %', outcome;
  end if;

  -- Finishing the last activity completes the unit; a new start returns the completion.
  outcome := public.submit_activity_attempt(user_a, gen_random_uuid(), fixture_unit, 1, 'a2', repeat('9', 64),
    '{"kind": "continue"}', 1, '{"outcome": "viewed"}',
    '{"status": "completed", "currentActivityId": null, "scenarioNodeId": null, "usedHelpForCurrent": false,
      "progressVersion": 2, "completed": []}');
  if outcome ->> 'status' <> 'stored' then
    raise exception 'Expected the last activity to be stored, got %', outcome;
  end if;
  select * into row_now from public.user_unit_progress where user_id = user_a and unit_id = fixture_unit;
  if row_now.status <> 'completed' or row_now.completed_at is null or row_now.current_activity_id is not null then
    raise exception 'Expected a completed row with a completion time';
  end if;
  outcome := public.start_unit_progress(user_a, fixture_unit, 1, 'a1', null);
  if outcome ->> 'status' <> 'completed' then
    raise exception 'Expected start after completion to return the completion, got %', outcome;
  end if;
end;
$checks$;
reset role;

-- 4. A signed-in learner cannot call either function (they must not decide correctness).
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('check.user_a'), 'role', 'authenticated')::text, true);
do $checks$
begin
  begin
    perform public.start_unit_progress(current_setting('check.user_a')::uuid, current_setting('check.unit'), 1, 'a1', null);
    raise exception 'A learner unexpectedly called start_unit_progress';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.submit_activity_attempt(current_setting('check.user_a')::uuid, gen_random_uuid(),
      current_setting('check.unit'), 1, 'a1', repeat('c', 64), '{"kind": "continue"}', 0, '{}', '{}');
    raise exception 'A learner unexpectedly called submit_activity_attempt';
  exception when insufficient_privilege then null;
  end;
end;
$checks$;
reset role;

-- 5. Not signed in: no access.
set local role anon;
do $checks$
begin
  begin
    perform public.start_unit_progress(gen_random_uuid(), 'x', 1, 'a1', null);
    raise exception 'anon unexpectedly called start_unit_progress';
  exception when insufficient_privilege then null;
  end;
end;
$checks$;
reset role;

rollback;
select 'PASS: start/resume/completion, atomic store, replay after progress moved, reused id and stale progress refused, learner isolation, no learner or anon access; synthetic rows rolled back' as result;

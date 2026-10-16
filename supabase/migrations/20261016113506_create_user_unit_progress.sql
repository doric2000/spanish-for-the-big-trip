-- Stage04 checkpoint: each learner's progress, pinned to one exact unit revision.
-- Design: ../../content/storage-model.json (user_unit_progress, access.progress).
-- Learners may only READ their own rows. All writes go through the trusted
-- server, which validates every transition against the immutable revision.
create table public.user_unit_progress (
  -- Deleting the account (App Store guideline 5.1.1(v)) deletes its progress.
  user_id uuid not null references auth.users (id) on delete cascade,
  unit_id text not null,
  revision integer not null,
  status text not null default 'in_progress',
  current_activity_id text,
  scenario_node_id text,
  used_help_for_current boolean not null default false,
  completed_activity_evidence jsonb not null default '[]'::jsonb,
  progress_version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, unit_id, revision),
  -- Progress points at an exact revision, so that revision can never be removed.
  constraint user_unit_progress_revision_fkey foreign key (unit_id, revision)
    references public.unit_revisions (unit_id, revision) on delete restrict,
  constraint user_unit_progress_status_valid check (status in ('in_progress', 'completed')),
  constraint user_unit_progress_version_nonnegative check (progress_version >= 0),
  constraint user_unit_progress_evidence_is_array
    check (jsonb_typeof(completed_activity_evidence) = 'array'),
  -- In progress: there is a current activity and no completion time.
  -- Completed: there is a completion time and no current activity or scenario node.
  constraint user_unit_progress_state_consistent check (
    (status = 'in_progress' and current_activity_id is not null and completed_at is null)
    or (status = 'completed' and current_activity_id is null
        and scenario_node_id is null and completed_at is not null)
  ),
  constraint user_unit_progress_ids_not_blank check (
    (current_activity_id is null or length(btrim(current_activity_id)) > 0)
    and (scenario_node_id is null or length(btrim(scenario_node_id)) > 0)
  )
);

-- At most one active attempt per learner and unit, whatever the revision.
-- Older completed revisions stay as history next to it.
create unique index user_unit_progress_one_active
  on public.user_unit_progress (user_id, unit_id)
  where status = 'in_progress';

-- Supports the foreign key check when a revision row is touched.
-- The primary key already starts with user_id for "my progress" lookups.
create index user_unit_progress_revision_idx
  on public.user_unit_progress (unit_id, revision);

alter table public.user_unit_progress enable row level security;

revoke all privileges on table public.user_unit_progress
  from public, anon, authenticated;
grant select on table public.user_unit_progress to authenticated;
grant select, insert, update, delete on table public.user_unit_progress to service_role;

-- (select auth.uid()) is evaluated once per query instead of once per row.
create policy "Learners read their own progress"
  on public.user_unit_progress
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.user_unit_progress is
  'Per-learner progress pinned to an exact published unit revision. Learners read only their own rows; writes are server-only.';
comment on column public.user_unit_progress.progress_version is
  'Optimistic concurrency counter: a write must name the version it read, so a stale or duplicate submission is rejected.';
comment on column public.user_unit_progress.completed_activity_evidence is
  'Array of {activityId, evidence, usedHelp, comparisonMode}. self_compared is not pronunciation correctness. Never store audio or tokens here.';

-- Run this WHOLE file after create_user_unit_progress in the development SQL Editor.
-- It creates two synthetic users and synthetic content, checks constraints,
-- own-row reading, blocked learner writes and account-deletion cascade, then
-- rolls everything back. No real user or lesson data is touched.
begin;

-- 1. Structure and privileges.
do $checks$
declare
  privilege_name text;
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'user_unit_progress' and c.relrowsecurity
  ) then
    raise exception 'user_unit_progress must exist with RLS enabled';
  end if;
  foreach privilege_name in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
    if has_table_privilege('anon', 'public.user_unit_progress', privilege_name) then
      raise exception 'anon unexpectedly has % on progress', privilege_name;
    end if;
  end loop;
  if not has_table_privilege('authenticated', 'public.user_unit_progress', 'SELECT') then
    raise exception 'authenticated should be able to SELECT (filtered by RLS)';
  end if;
  foreach privilege_name in array array['INSERT', 'UPDATE', 'DELETE'] loop
    if has_table_privilege('authenticated', 'public.user_unit_progress', privilege_name) then
      raise exception 'authenticated unexpectedly has % on progress', privilege_name;
    end if;
  end loop;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_unit_progress'
      and cmd = 'SELECT' and 'authenticated' = any(roles)
  ) then
    raise exception 'Expected an own-row SELECT policy for authenticated';
  end if;
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
  payload jsonb;
begin
  insert into auth.users (id, aud, role, email) values
    (user_a, 'authenticated', 'authenticated', user_a::text || '@check.invalid'),
    (user_b, 'authenticated', 'authenticated', user_b::text || '@check.invalid');

  insert into public.courses (id, title_he) values (fixture_course, 'קורס בדיקה זמני');
  insert into public.chapters (id, course_id, title_he, position)
    values (fixture_chapter, fixture_course, 'פרק בדיקה זמני', 1);
  insert into public.units (id, chapter_id, title_he, position)
    values (fixture_unit, fixture_chapter, 'יחידת בדיקה זמנית', 1);

  payload := jsonb_build_object('id', fixture_unit, 'revision', 1,
    'schemaVersion', 2, 'status', 'published');
  insert into public.unit_revisions
    (unit_id, revision, schema_version, authoring_payload, source_digest, status)
  values
    (fixture_unit, 1, 2, payload, repeat('a', 64), 'published'),
    (fixture_unit, 2, 2, jsonb_set(payload, '{revision}', '2'::jsonb), repeat('b', 64), 'published');

  -- Later blocks run under other roles; keep the ids for this transaction only.
  perform set_config('check.user_a', user_a::text, true);
  perform set_config('check.user_b', user_b::text, true);
  perform set_config('check.unit', fixture_unit, true);
end;
$checks$;

-- 3. Server-role writes and constraints.
set local role service_role;
do $checks$
declare
  user_a uuid := current_setting('check.user_a')::uuid;
  user_b uuid := current_setting('check.user_b')::uuid;
  fixture_unit text := current_setting('check.unit');
begin
  insert into public.user_unit_progress (user_id, unit_id, revision, current_activity_id)
    values (user_a, fixture_unit, 1, '1a-entry'), (user_b, fixture_unit, 1, '1a-entry');

  begin
    insert into public.user_unit_progress (user_id, unit_id, revision, current_activity_id)
      values (user_a, fixture_unit, 2, '1a-entry');
    raise exception 'Expected a second active revision for the same user/unit to be rejected';
  exception when unique_violation then null;
  end;

  -- A completed revision may sit next to the active one as history.
  insert into public.user_unit_progress
    (user_id, unit_id, revision, status, current_activity_id, completed_at)
    values (user_a, fixture_unit, 2, 'completed', null, now());

  begin
    insert into public.user_unit_progress (user_id, unit_id, revision, status, current_activity_id)
      values (user_b, fixture_unit, 2, 'completed', null);
    raise exception 'Expected completed progress without completed_at to be rejected';
  exception when check_violation then null;
  end;

  begin
    update public.user_unit_progress set current_activity_id = null
      where user_id = user_b and unit_id = fixture_unit and revision = 1;
    raise exception 'Expected in-progress without a current activity to be rejected';
  exception when check_violation then null;
  end;

  begin
    update public.user_unit_progress set progress_version = -1
      where user_id = user_b and unit_id = fixture_unit and revision = 1;
    raise exception 'Expected a negative progress_version to be rejected';
  exception when check_violation then null;
  end;

  begin
    update public.user_unit_progress set completed_activity_evidence = '{}'::jsonb
      where user_id = user_b and unit_id = fixture_unit and revision = 1;
    raise exception 'Expected non-array evidence to be rejected';
  exception when check_violation then null;
  end;

  -- Use a completed row: learner B already has an active row, and the
  -- one-active unique index is checked before the foreign key.
  begin
    insert into public.user_unit_progress
      (user_id, unit_id, revision, status, current_activity_id, completed_at)
      values (user_b, fixture_unit, 9, 'completed', null, now());
    raise exception 'Expected progress for a missing revision to be rejected';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.user_unit_progress (user_id, unit_id, revision, current_activity_id)
      values (gen_random_uuid(), fixture_unit, 1, '1a-entry');
    raise exception 'Expected progress for a missing user to be rejected';
  exception when foreign_key_violation then null;
  end;
end;
$checks$;
reset role;

-- 4. Learner A, signed in: sees only A's two rows and cannot write.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('check.user_a'), 'role', 'authenticated')::text, true);
do $checks$
declare
  user_a uuid := current_setting('check.user_a')::uuid;
begin
  if (select count(*) from public.user_unit_progress) <> 2 then
    raise exception 'Learner A should see exactly their own 2 rows';
  end if;
  if exists (select 1 from public.user_unit_progress where user_id <> user_a) then
    raise exception 'Learner A can see another learner''s progress';
  end if;
  begin
    update public.user_unit_progress set progress_version = 99;
    raise exception 'Learner A unexpectedly updated progress directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.user_unit_progress (user_id, unit_id, revision, current_activity_id)
      values (user_a, current_setting('check.unit'), 2, '1a-entry');
    raise exception 'Learner A unexpectedly inserted progress directly';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.user_unit_progress;
    raise exception 'Learner A unexpectedly deleted progress directly';
  exception when insufficient_privilege then null;
  end;
end;
$checks$;

-- 5. Learner B: sees only B's one row.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('check.user_b'), 'role', 'authenticated')::text, true);
do $checks$
begin
  if (select count(*) from public.user_unit_progress) <> 1
     or exists (select 1 from public.user_unit_progress
                where user_id <> current_setting('check.user_b')::uuid) then
    raise exception 'Learner B should see exactly their own 1 row';
  end if;
end;
$checks$;

-- 6. Authenticated role without a user id: sees nothing.
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
do $checks$
begin
  if exists (select 1 from public.user_unit_progress) then
    raise exception 'A request without a user id unexpectedly saw progress';
  end if;
end;
$checks$;
reset role;

-- 7. Not signed in: no access at all.
set local role anon;
do $checks$
begin
  begin
    perform 1 from public.user_unit_progress;
    raise exception 'anon unexpectedly read progress';
  exception when insufficient_privilege then null;
  end;
end;
$checks$;
reset role;

-- 8. Deleting learner A's account removes only A's progress.
do $checks$
declare
  user_a uuid := current_setting('check.user_a')::uuid;
  user_b uuid := current_setting('check.user_b')::uuid;
begin
  delete from auth.users where id = user_a;
  if exists (select 1 from public.user_unit_progress where user_id = user_a) then
    raise exception 'Account deletion did not remove the learner''s progress';
  end if;
  if not exists (select 1 from public.user_unit_progress where user_id = user_b) then
    raise exception 'Account deletion removed another learner''s progress';
  end if;
end;
$checks$;

rollback;
select 'PASS: progress constraints, own-row reading, blocked learner writes and account-deletion cascade; synthetic rows rolled back' as result;

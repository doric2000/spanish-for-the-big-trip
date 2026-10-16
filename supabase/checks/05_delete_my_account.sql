-- Run this WHOLE file after create_delete_my_account in the development SQL Editor.
-- It creates two synthetic users with progress, has learner A delete their own
-- account, and checks that only A (and A's progress) disappeared, that B is
-- untouched, and that anonymous callers cannot delete anything. Everything is
-- rolled back at the end. No real user or lesson data is touched.
begin;

-- 1. Who may call it.
do $checks$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delete_my_account' and p.prosecdef
  ) then
    raise exception 'public.delete_my_account must exist as security definer';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delete_my_account'
      and p.proconfig @> array['search_path=""']
  ) then
    raise exception 'delete_my_account must pin an empty search_path';
  end if;
  if has_function_privilege('anon', 'public.delete_my_account()', 'EXECUTE') then
    raise exception 'anon must not be able to delete accounts';
  end if;
  if not has_function_privilege('authenticated', 'public.delete_my_account()', 'EXECUTE') then
    raise exception 'authenticated learners must be able to delete their own account';
  end if;
end;
$checks$;

-- 2. Synthetic users, content and progress (as the SQL Editor owner role).
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
    jsonb_build_object('id', fixture_unit, 'revision', 1, 'schemaVersion', 2, 'status', 'published'),
    repeat('a', 64), 'published');
  insert into public.user_unit_progress (user_id, unit_id, revision, current_activity_id)
    values (user_a, fixture_unit, 1, '1a-entry'), (user_b, fixture_unit, 1, '1a-entry');
  perform set_config('check.user_a', user_a::text, true);
  perform set_config('check.user_b', user_b::text, true);
end;
$checks$;

-- 3. An anonymous visitor cannot call it.
set local role anon;
do $checks$
begin
  begin
    perform public.delete_my_account();
    raise exception 'Expected anon to be refused';
  exception when insufficient_privilege then null;
  end;
end;
$checks$;
reset role;

-- 4. A signed-in role without a user id in its token is refused, not a no-op.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
do $checks$
begin
  begin
    perform public.delete_my_account();
    raise exception 'Expected a call without auth.uid() to be refused';
  exception when insufficient_privilege then null;
  end;
end;
$checks$;
reset role;

-- 5. Learner A deletes their own account.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('check.user_a'), 'role', 'authenticated')::text, true);
select public.delete_my_account();
reset role;

-- 6. Only A and A's progress are gone; B is untouched.
do $checks$
declare
  user_a uuid := current_setting('check.user_a')::uuid;
  user_b uuid := current_setting('check.user_b')::uuid;
begin
  if exists (select 1 from auth.users where id = user_a) then
    raise exception 'Learner A should have been deleted';
  end if;
  if exists (select 1 from public.user_unit_progress where user_id = user_a) then
    raise exception 'Learner A progress should have been deleted by cascade';
  end if;
  if not exists (select 1 from auth.users where id = user_b) then
    raise exception 'Learner B must not be affected';
  end if;
  if not exists (select 1 from public.user_unit_progress where user_id = user_b) then
    raise exception 'Learner B progress must not be affected';
  end if;
end;
$checks$;

select 'PASS: only the calling user and their progress are deleted; anon and token-less calls refused; synthetic rows rolled back' as result;
rollback;

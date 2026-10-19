-- Run this WHOLE file after create_activity_attempts in the development SQL Editor.
-- It creates two synthetic users and synthetic content, checks the idempotency key,
-- constraints, the append-only server grants, blocked learner access, protection of
-- referenced revisions and the account-deletion cascade, then rolls everything back.
-- No real user or lesson data is touched.
begin;

-- 1. Structure and privileges.
do $checks$
declare
  privilege_name text;
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'activity_attempts' and c.relrowsecurity
  ) then
    raise exception 'activity_attempts must exist with RLS enabled';
  end if;
  foreach privilege_name in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
    if has_table_privilege('anon', 'public.activity_attempts', privilege_name) then
      raise exception 'anon unexpectedly has % on attempts', privilege_name;
    end if;
    if has_table_privilege('authenticated', 'public.activity_attempts', privilege_name) then
      raise exception 'authenticated unexpectedly has % on attempts', privilege_name;
    end if;
  end loop;
  if not has_table_privilege('service_role', 'public.activity_attempts', 'SELECT')
     or not has_table_privilege('service_role', 'public.activity_attempts', 'INSERT') then
    raise exception 'service_role should be able to SELECT and INSERT attempts';
  end if;
  foreach privilege_name in array array['UPDATE', 'DELETE'] loop
    if has_table_privilege('service_role', 'public.activity_attempts', privilege_name) then
      raise exception 'service_role unexpectedly has % on the append-only log', privilege_name;
    end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'activity_attempts') then
    raise exception 'Expected no learner policy on attempts';
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
begin
  insert into auth.users (id, aud, role, email) values
    (user_a, 'authenticated', 'authenticated', user_a::text || '@check.invalid'),
    (user_b, 'authenticated', 'authenticated', user_b::text || '@check.invalid');

  insert into public.courses (id, title_he) values (fixture_course, 'קורס בדיקה זמני');
  insert into public.chapters (id, course_id, title_he, position)
    values (fixture_chapter, fixture_course, 'פרק בדיקה זמני', 1);
  insert into public.units (id, chapter_id, title_he, position)
    values (fixture_unit, fixture_chapter, 'יחידת בדיקה זמנית', 1);
  -- A draft revision: unlike a published one it may be deleted, so step 4 can show
  -- that attempts (not the published-revision trigger) protect it.
  insert into public.unit_revisions
    (unit_id, revision, schema_version, authoring_payload, source_digest, status)
  values (fixture_unit, 1, 2,
    jsonb_build_object('id', fixture_unit, 'revision', 1, 'schemaVersion', 2, 'status', 'draft'),
    repeat('a', 64), 'draft');

  -- Later blocks run under other roles; keep the ids for this transaction only.
  perform set_config('check.user_a', user_a::text, true);
  perform set_config('check.user_b', user_b::text, true);
  perform set_config('check.unit', fixture_unit, true);
  perform set_config('check.request', gen_random_uuid()::text, true);
end;
$checks$;

-- 3. Server-role writes, the idempotency key and constraints.
set local role service_role;
do $checks$
declare
  user_a uuid := current_setting('check.user_a')::uuid;
  user_b uuid := current_setting('check.user_b')::uuid;
  fixture_unit text := current_setting('check.unit');
  request uuid := current_setting('check.request')::uuid;
  answer jsonb := '{"kind": "choice", "choiceId": "hello"}';
  result jsonb := '{"outcome": "correct", "feedbackHe": null}';
begin
  insert into public.activity_attempts
    (user_id, request_id, unit_id, revision, activity_id, request_fingerprint, response, server_result)
  values
    (user_a, request, fixture_unit, 1, 'u1a-primer-listen', repeat('c', 64), answer, result),
    -- The same request id for another learner is a different request.
    (user_b, request, fixture_unit, 1, 'u1a-primer-listen', repeat('c', 64), answer, result);

  begin
    insert into public.activity_attempts
      (user_id, request_id, unit_id, revision, activity_id, request_fingerprint, response, server_result)
    values (user_a, request, fixture_unit, 1, 'u1a-primer-listen', repeat('d', 64), answer, result);
    raise exception 'Expected a second row for the same user and request id to be rejected';
  exception when unique_violation then null;
  end;

  begin
    insert into public.activity_attempts
      (user_id, request_id, unit_id, revision, activity_id, request_fingerprint, response, server_result)
    values (user_a, gen_random_uuid(), fixture_unit, 1, 'u1a-primer-listen', 'not-a-sha256', answer, result);
    raise exception 'Expected an invalid fingerprint to be rejected';
  exception when check_violation then null;
  end;

  begin
    insert into public.activity_attempts
      (user_id, request_id, unit_id, revision, activity_id, request_fingerprint, response, server_result)
    values (user_a, gen_random_uuid(), fixture_unit, 1, 'u1a-primer-listen', repeat('c', 64), '["hello"]', result);
    raise exception 'Expected a non-object response to be rejected';
  exception when check_violation then null;
  end;

  begin
    insert into public.activity_attempts
      (user_id, request_id, unit_id, revision, activity_id, request_fingerprint, response, server_result)
    values (user_a, gen_random_uuid(), fixture_unit, 1, '  ', repeat('c', 64), answer, result);
    raise exception 'Expected a blank activity id to be rejected';
  exception when check_violation then null;
  end;

  begin
    insert into public.activity_attempts
      (user_id, request_id, unit_id, revision, activity_id, request_fingerprint, response, server_result)
    values (user_a, gen_random_uuid(), fixture_unit, 9, 'u1a-primer-listen', repeat('c', 64), answer, result);
    raise exception 'Expected an attempt for a missing revision to be rejected';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.activity_attempts
      (user_id, request_id, unit_id, revision, activity_id, request_fingerprint, response, server_result)
    values (gen_random_uuid(), gen_random_uuid(), fixture_unit, 1, 'u1a-primer-listen', repeat('c', 64), answer, result);
    raise exception 'Expected an attempt for a missing user to be rejected';
  exception when foreign_key_violation then null;
  end;

  -- Append-only: even the server cannot change or remove a stored attempt.
  begin
    update public.activity_attempts set server_result = '{}' where user_id = user_a;
    raise exception 'The server role unexpectedly updated an attempt';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.activity_attempts where user_id = user_a;
    raise exception 'The server role unexpectedly deleted an attempt';
  exception when insufficient_privilege then null;
  end;

  if (select count(*) from public.activity_attempts where request_id = request) <> 2 then
    raise exception 'Expected exactly the two valid attempts';
  end if;
end;
$checks$;
reset role;

-- 4. A revision with attempts cannot be deleted, even as a draft.
do $checks$
begin
  begin
    delete from public.unit_revisions where unit_id = current_setting('check.unit');
    raise exception 'Expected a revision with attempts to be protected';
  exception when foreign_key_violation then null;
  end;
end;
$checks$;

-- 5. Learner A, signed in: no access to attempts at all, not even their own.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('check.user_a'), 'role', 'authenticated')::text, true);
do $checks$
begin
  begin
    perform 1 from public.activity_attempts;
    raise exception 'Learner A unexpectedly read attempts';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.activity_attempts
      (user_id, request_id, unit_id, revision, activity_id, request_fingerprint, response, server_result)
    values (current_setting('check.user_a')::uuid, gen_random_uuid(), current_setting('check.unit'), 1,
      'u1a-primer-listen', repeat('c', 64), '{"kind": "choice", "choiceId": "hello"}', '{"outcome": "correct"}');
    raise exception 'Learner A unexpectedly inserted an attempt (a learner must not decide correctness)';
  exception when insufficient_privilege then null;
  end;
end;
$checks$;
reset role;

-- 6. Not signed in: no access at all.
set local role anon;
do $checks$
begin
  begin
    perform 1 from public.activity_attempts;
    raise exception 'anon unexpectedly read attempts';
  exception when insufficient_privilege then null;
  end;
end;
$checks$;
reset role;

-- 7. Deleting learner A's account removes only A's attempts.
do $checks$
declare
  user_a uuid := current_setting('check.user_a')::uuid;
  user_b uuid := current_setting('check.user_b')::uuid;
begin
  delete from auth.users where id = user_a;
  if exists (select 1 from public.activity_attempts where user_id = user_a) then
    raise exception 'Account deletion did not remove the learner''s attempts';
  end if;
  if not exists (select 1 from public.activity_attempts where user_id = user_b) then
    raise exception 'Account deletion removed another learner''s attempts';
  end if;
end;
$checks$;

rollback;
select 'PASS: attempt idempotency key, constraints, append-only server grants, no learner access, revision protection and account-deletion cascade; synthetic rows rolled back' as result;

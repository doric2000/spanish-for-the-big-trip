-- Run this WHOLE file after create_unit_revisions in development SQL Editor.
-- Minimal synthetic JSON is intentionally NOT a valid or approved full lesson.
-- Fake digest values test SQL shape only. Everything is rolled back at the end.
begin;
set local role service_role;

do $checks$
declare
  fixture_course text := '__check_course_' || gen_random_uuid()::text;
  fixture_chapter text := '__check_chapter_' || gen_random_uuid()::text;
  fixture_unit text := '__check_unit_' || gen_random_uuid()::text;
  draft_payload jsonb;
  second_payload jsonb;
  role_name text;
  privilege_name text;
  guard_oid oid;
  guard_definer boolean;
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'unit_revisions' and c.relrowsecurity
  ) then
    raise exception 'unit_revisions must exist with RLS enabled';
  end if;

  select p.oid, p.prosecdef into guard_oid, guard_definer
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'protect_published_unit_revision'
      and p.pronargs = 0;
  if guard_oid is null or guard_definer then
    raise exception 'The private guard must exist and use SECURITY INVOKER';
  end if;
  foreach role_name in array array['anon', 'authenticated'] loop
    foreach privilege_name in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege(role_name::name, 'public.unit_revisions', privilege_name) then
        raise exception '% unexpectedly has % on raw unit revisions', role_name, privilege_name;
      end if;
    end loop;
    if has_function_privilege(role_name::name, guard_oid, 'EXECUTE') then
      raise exception '% unexpectedly has EXECUTE on the private guard', role_name;
    end if;
  end loop;

  insert into public.courses (id, title_he) values (fixture_course, 'קורס בדיקה זמני');
  insert into public.chapters (id, course_id, title_he, position)
    values (fixture_chapter, fixture_course, 'פרק בדיקה זמני', 1);
  insert into public.units (id, chapter_id, title_he, position)
    values (fixture_unit, fixture_chapter, 'יחידת בדיקה זמנית', 1);

  draft_payload := jsonb_build_object(
    'id', fixture_unit, 'revision', 1, 'schemaVersion', 2,
    'status', 'draft', 'titleHe', 'תוכן בדיקה סינתטי'
  );
  second_payload := jsonb_set(draft_payload, '{revision}', '2'::jsonb);
  insert into public.unit_revisions
    (unit_id, revision, schema_version, authoring_payload, source_digest, status)
    values (fixture_unit, 1, 2, draft_payload, repeat('a', 64), 'draft');

  -- Draft editing is allowed under the trusted server role.
  update public.unit_revisions
    set authoring_payload = jsonb_set(authoring_payload, '{titleHe}', '"טיוטה מעודכנת"'::jsonb),
      source_digest = repeat('b', 64)
    where unit_id = fixture_unit and revision = 1;
  if not exists (
    select 1 from public.unit_revisions where unit_id = fixture_unit and revision = 1
      and authoring_payload ->> 'titleHe' = 'טיוטה מעודכנת'
  ) then
    raise exception 'Expected draft editing to succeed';
  end if;

  begin
    insert into public.unit_revisions values
      (fixture_unit, 1, 2, draft_payload, repeat('a', 64), 'draft');
    raise exception 'Expected a duplicate unit/revision pair to be rejected';
  exception when unique_violation then null;
  end;

  begin
    insert into public.unit_revisions values
      (fixture_unit || '_missing', 1, 2,
        jsonb_set(draft_payload, '{id}', to_jsonb(fixture_unit || '_missing')),
        repeat('a', 64), 'draft');
    raise exception 'Expected a revision without an existing unit to be rejected';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.unit_revisions values
      (fixture_unit, 2, 2, second_payload, 'invalid-digest', 'draft');
    raise exception 'Expected an invalid digest shape to be rejected';
  exception when check_violation then null;
  end;

  begin
    insert into public.unit_revisions values
      (fixture_unit, 2, 2, jsonb_set(second_payload, '{id}', '"wrong-unit"'::jsonb),
        repeat('a', 64), 'draft');
    raise exception 'Expected mismatched payload identity to be rejected';
  exception when check_violation then null;
  end;

  begin
    insert into public.unit_revisions values
      (fixture_unit, 2, 2, second_payload - 'revision', repeat('a', 64), 'draft');
    raise exception 'Expected missing payload metadata to be rejected';
  exception when check_violation then null;
  end;

  begin
    insert into public.unit_revisions values
      (fixture_unit, 0, 2, jsonb_set(draft_payload, '{revision}', '0'::jsonb),
        repeat('a', 64), 'draft');
    raise exception 'Expected a non-positive revision to be rejected';
  exception when check_violation then null;
  end;

  -- A lifecycle transition is allowed only while the old row is a draft.
  -- This synthetic marker does NOT make a lesson available to learners.
  update public.unit_revisions
    set status = 'published',
      authoring_payload = jsonb_set(authoring_payload, '{status}', '"published"'::jsonb)
    where unit_id = fixture_unit and revision = 1;

  begin
    update public.unit_revisions set source_digest = repeat('c', 64)
      where unit_id = fixture_unit and revision = 1;
    raise exception 'Expected editing a published revision to be rejected';
  exception when check_violation then null;
  end;

  begin
    update public.unit_revisions set status = 'draft',
      authoring_payload = jsonb_set(authoring_payload, '{status}', '"draft"'::jsonb)
      where unit_id = fixture_unit and revision = 1;
    raise exception 'Expected reverting a published revision to draft to be rejected';
  exception when check_violation then null;
  end;

  begin
    delete from public.unit_revisions where unit_id = fixture_unit and revision = 1;
    raise exception 'Expected deletion of a published revision to be rejected';
  exception when check_violation then null;
  end;

  -- New revisions coexist with the old published version; drafts can be removed.
  insert into public.unit_revisions values
    (fixture_unit, 2, 2, second_payload, repeat('d', 64), 'draft');
  delete from public.unit_revisions where unit_id = fixture_unit and revision = 2;
  if exists (select 1 from public.unit_revisions where unit_id = fixture_unit and revision = 2) then
    raise exception 'Expected draft deletion to succeed';
  end if;
  insert into public.unit_revisions values
    (fixture_unit, 2, 2, second_payload, repeat('d', 64), 'draft');
  if (select count(*) from public.unit_revisions where unit_id = fixture_unit) <> 2 then
    raise exception 'Expected old published and new draft revisions to coexist';
  end if;

  begin
    delete from public.units where id = fixture_unit;
    raise exception 'Expected deletion of a unit referenced by revisions to be rejected';
  exception when foreign_key_violation then null;
  end;
end;
$checks$;
reset role;

set local role anon;
do $checks$
begin
  begin
    perform 1 from public.unit_revisions;
    raise exception 'anon unexpectedly read raw authoring data';
  exception when insufficient_privilege then null;
  end;
end;
$checks$;
reset role;

set local role authenticated;
do $checks$
begin
  begin
    perform 1 from public.unit_revisions;
    raise exception 'authenticated unexpectedly read raw authoring data';
  exception when insufficient_privilege then null;
  end;
end;
$checks$;
reset role;

rollback;
select 'PASS: revision metadata, draft lifecycle, published immutability and role access; synthetic rows rolled back' as result;

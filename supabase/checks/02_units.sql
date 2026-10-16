-- Run the WHOLE file after create_units has been applied to the development DB.
-- Test fixtures are synthetic and are removed by the final ROLLBACK.
begin;

do $checks$
declare
  fixture_course text := '__check_course_' || gen_random_uuid()::text;
  fixture_chapter text := '__check_chapter_' || gen_random_uuid()::text;
  fixture_unit text := '__check_unit_' || gen_random_uuid()::text;
  role_name text;
  privilege_name text;
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'units'
      and c.relkind = 'r' and c.relrowsecurity
  ) then
    raise exception 'units must exist with RLS enabled';
  end if;

  foreach role_name in array array['anon', 'authenticated'] loop
    foreach privilege_name in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege(role_name::name, 'public.units', privilege_name) then
        raise exception '% unexpectedly has % on units', role_name, privilege_name;
      end if;
    end loop;
  end loop;
  foreach privilege_name in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
    if not has_table_privilege('service_role', 'public.units', privilege_name) then
      raise exception 'service_role lacks % on units', privilege_name;
    end if;
  end loop;

  insert into public.courses (id, title_he) values (fixture_course, 'קורס בדיקה זמני');
  insert into public.chapters (id, course_id, title_he, position)
    values (fixture_chapter, fixture_course, 'פרק בדיקה זמני', 1);
  insert into public.units (id, chapter_id, aliases, title_he, position)
    values (fixture_unit, fixture_chapter, array['1A'], 'יחידת בדיקה זמנית', 1);
  insert into public.units (id, chapter_id, title_he, position)
    values (fixture_unit || '_second', fixture_chapter, 'יחידת בדיקה נוספת', 2);

  if (
    select count(*) from public.units u
    join public.chapters ch on ch.id = u.chapter_id
    join public.courses co on co.id = ch.course_id
    where ch.id = fixture_chapter and co.id = fixture_course
  ) <> 2 then
    raise exception 'Expected two units under one valid chapter/course';
  end if;
  if not exists (
    select 1 from public.units where id = fixture_unit || '_second'
      and aliases = array[]::text[]
  ) then
    raise exception 'An omitted aliases list must default to an empty array';
  end if;

  begin
    insert into public.units (id, chapter_id, title_he, position)
      values (fixture_unit || '_orphan', fixture_chapter || '_missing', 'בדיקה', 1);
    raise exception 'Expected a unit without an existing chapter to be rejected';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.units (id, chapter_id, title_he, position)
      values (fixture_unit, fixture_chapter, 'מזהה כפול', 3);
    raise exception 'Expected a duplicate canonical unit ID to be rejected';
  exception when unique_violation then null;
  end;

  begin
    insert into public.units (id, chapter_id, title_he, position)
      values (fixture_unit || '_duplicate_position', fixture_chapter, 'בדיקה', 1);
    raise exception 'Expected a duplicate position in one chapter to be rejected';
  exception when unique_violation then null;
  end;

  begin
    insert into public.units (id, chapter_id, title_he, position)
      values (fixture_unit || '_zero', fixture_chapter, 'בדיקה', 0);
    raise exception 'Expected a non-positive position to be rejected';
  exception when check_violation then null;
  end;

  begin
    insert into public.units (id, chapter_id, aliases, title_he, position)
      values (fixture_unit || '_null_alias', fixture_chapter, array[null]::text[], 'בדיקה', 3);
    raise exception 'Expected a null alias entry to be rejected';
  exception when check_violation then null;
  end;

  begin
    delete from public.chapters where id = fixture_chapter;
    raise exception 'Expected deletion of a chapter referenced by units to be rejected';
  exception when foreign_key_violation then null;
  end;

  -- A display rename/reorder preserves the identity and the existing alias.
  update public.units set title_he = 'שם תצוגה מעודכן', position = 3
    where id = fixture_unit;
  if not exists (
    select 1 from public.units where id = fixture_unit
      and title_he = 'שם תצוגה מעודכן' and position = 3 and aliases = array['1A']
  ) then
    raise exception 'Display edits must preserve canonical identity and alias';
  end if;
end;
$checks$;

set local role anon;
do $checks$
begin
  begin
    perform 1 from public.units;
    raise exception 'anon unexpectedly read units';
  exception when insufficient_privilege then null;
  end;
end;
$checks$;
reset role;

set local role authenticated;
do $checks$
begin
  begin
    perform 1 from public.units;
    raise exception 'authenticated unexpectedly read units';
  exception when insufficient_privilege then null;
  end;
end;
$checks$;
reset role;

rollback;
select 'PASS: unit relationships, identity, constraints and role access; synthetic rows rolled back' as result;

-- Run the WHOLE file in the development project's SQL Editor after the migration.
-- Synthetic rows live only inside this transaction and are rolled back.
begin;

do $checks$
declare
  fixture_course text := '__check_course_' || gen_random_uuid()::text;
  fixture_chapter text := '__check_chapter_' || gen_random_uuid()::text;
  relation_name text;
  role_name text;
  privilege_name text;
begin
  if (
    select count(*) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('courses', 'chapters')
      and c.relkind = 'r' and c.relrowsecurity
  ) <> 2 then
    raise exception 'Both course/chapter tables must exist with RLS enabled';
  end if;

  foreach relation_name in array array['public.courses', 'public.chapters'] loop
    foreach role_name in array array['anon', 'authenticated'] loop
      foreach privilege_name in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
        if has_table_privilege(role_name::name, relation_name, privilege_name) then
          raise exception '% unexpectedly has % on %', role_name, privilege_name, relation_name;
        end if;
      end loop;
    end loop;
    foreach privilege_name in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if not has_table_privilege('service_role', relation_name, privilege_name) then
        raise exception 'service_role lacks % on %', privilege_name, relation_name;
      end if;
    end loop;
  end loop;

  insert into public.courses (id, title_he) values (fixture_course, 'קורס בדיקה זמני');
  insert into public.chapters (id, course_id, title_he, position)
    values (fixture_chapter, fixture_course, 'פרק בדיקה זמני', 1);

  if not exists (
    select 1 from public.chapters ch
    join public.courses co on co.id = ch.course_id
    where ch.id = fixture_chapter and co.id = fixture_course
  ) then
    raise exception 'Valid course/chapter relationship did not persist inside the transaction';
  end if;

  begin
    insert into public.chapters (id, course_id, title_he, position)
      values (fixture_chapter || '_orphan', fixture_course || '_missing', 'בדיקה', 1);
    raise exception 'Expected an orphan chapter to be rejected';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.courses (id, title_he) values (fixture_course, 'מזהה כפול');
    raise exception 'Expected a duplicate stable ID to be rejected';
  exception when unique_violation then null;
  end;

  begin
    insert into public.chapters (id, course_id, title_he, position)
      values (fixture_chapter || '_duplicate_position', fixture_course, 'בדיקה', 1);
    raise exception 'Expected a duplicate chapter position to be rejected';
  exception when unique_violation then null;
  end;

  begin
    insert into public.chapters (id, course_id, title_he, position)
      values (fixture_chapter || '_zero', fixture_course, 'בדיקה', 0);
    raise exception 'Expected a non-positive position to be rejected';
  exception when check_violation then null;
  end;

  begin
    delete from public.courses where id = fixture_course;
    raise exception 'Expected deletion of a referenced course to be rejected';
  exception when foreign_key_violation then null;
  end;
end;
$checks$;

-- Exercise actual unprivileged SELECT paths, rather than using only postgres.
set local role anon;
do $checks$
begin
  begin
    perform 1 from public.courses;
    raise exception 'anon unexpectedly read courses';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.chapters;
    raise exception 'anon unexpectedly read chapters';
  exception when insufficient_privilege then null;
  end;
end;
$checks$;
reset role;

set local role authenticated;
do $checks$
begin
  begin
    perform 1 from public.courses;
    raise exception 'authenticated unexpectedly read courses';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.chapters;
    raise exception 'authenticated unexpectedly read chapters';
  exception when insufficient_privilege then null;
  end;
end;
$checks$;
reset role;

rollback;
select 'PASS: relationships, constraints and role access; synthetic rows rolled back' as result;

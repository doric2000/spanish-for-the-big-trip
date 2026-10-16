-- Stage04 checkpoint: course/chapter identities only.
-- See ../README.md and ../../DEVELOPMENT_GUIDE.md for joint execution/review.
-- Apply through the Supabase migration runner, which records this file's version.

create table public.courses (
  id text primary key,
  title_he text not null,
  constraint courses_id_not_blank check (length(btrim(id)) > 0),
  constraint courses_title_not_blank check (length(btrim(title_he)) > 0)
);

create table public.chapters (
  id text primary key,
  course_id text not null references public.courses (id) on delete restrict,
  title_he text not null,
  position integer not null,
  constraint chapters_id_not_blank check (length(btrim(id)) > 0),
  constraint chapters_title_not_blank check (length(btrim(title_he)) > 0),
  constraint chapters_position_positive check (position > 0),
  constraint chapters_course_position_unique unique (course_id, position)
);

-- The unique index above starts with course_id and also supports the foreign key.
-- Keep access explicit even if the provider's automatic-RLS trigger is enabled.
alter table public.courses enable row level security;
alter table public.chapters enable row level security;

revoke all privileges on table public.courses, public.chapters
  from public, anon, authenticated;
grant select, insert, update, delete on table public.courses, public.chapters
  to service_role;

-- No learner policies yet: the future server exposes published projections.
-- Server-role access bypasses RLS and must enforce publication/ownership itself.
comment on table public.courses is
  'Course identity and Hebrew display title; trusted server/importer access only.';
comment on table public.chapters is
  'Stable chapter identity, parent course and display order; not a published lesson.';

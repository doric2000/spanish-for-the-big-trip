-- Stage04 checkpoint: stable unit metadata from content/storage-model.json.
-- Lesson payloads/revisions and publication belong to later increments.
create table public.units (
  id text primary key,
  chapter_id text not null references public.chapters (id) on delete restrict,
  aliases text[] not null default array[]::text[],
  title_he text not null,
  position integer not null,
  constraint units_id_not_blank check (length(btrim(id)) > 0),
  constraint units_title_not_blank check (length(btrim(title_he)) > 0),
  constraint units_position_positive check (position > 0),
  constraint units_aliases_no_null_entries check (array_position(aliases, null) is null),
  constraint units_chapter_position_unique unique (chapter_id, position)
);

-- The unique index starts with chapter_id, supporting parent lookup without
-- a redundant standalone foreign-key index. No alias/JSON index is needed yet.
alter table public.units enable row level security;
revoke all privileges on table public.units from public, anon, authenticated;
grant select, insert, update, delete on table public.units to service_role;

comment on table public.units is
  'Stable unit identity and editable navigation metadata; not a runnable/published lesson.';
comment on column public.units.aliases is
  'Authoring aliases such as 1A. Canonical id remains stable; validate the source contract before import.';

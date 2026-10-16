-- Stage04 checkpoint: raw, versioned authoring data; no learner projection.
create table public.unit_revisions (
  unit_id text not null references public.units (id) on delete restrict,
  revision integer not null,
  schema_version integer not null,
  authoring_payload jsonb not null,
  source_digest text not null,
  status text not null,
  primary key (unit_id, revision),
  constraint unit_revisions_revision_positive check (revision > 0),
  constraint unit_revisions_schema_version_positive check (schema_version > 0),
  constraint unit_revisions_status_valid check (status in ('draft', 'published')),
  constraint unit_revisions_digest_shape check (source_digest ~ '^[0-9a-f]{64}$'),
  constraint unit_revisions_payload_metadata_match check (coalesce(
    jsonb_typeof(authoring_payload) = 'object'
    and authoring_payload -> 'id' = to_jsonb(unit_id)
    and authoring_payload -> 'revision' = to_jsonb(revision)
    and authoring_payload -> 'schemaVersion' = to_jsonb(schema_version)
    and authoring_payload -> 'status' = to_jsonb(status),
    false
  ))
);

-- The composite primary key also indexes the unit_id foreign key.
alter table public.unit_revisions enable row level security;
revoke all privileges on table public.unit_revisions from public, anon, authenticated;
grant select, insert, update, delete on table public.unit_revisions to service_role;

-- Trigger helper is kept outside exposed API schemas and uses invoker privileges.
create schema if not exists private;
revoke all privileges on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create function private.protect_published_unit_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $guard$
begin
  if old.status = 'published' then
    raise exception using
      errcode = '23514',
      message = 'Published unit revisions are immutable; create a new revision.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$guard$;

revoke all privileges on function private.protect_published_unit_revision()
  from public, anon, authenticated;
grant execute on function private.protect_published_unit_revision() to service_role;

create trigger unit_revisions_protect_published
before update or delete on public.unit_revisions
for each row execute function private.protect_published_unit_revision();

comment on table public.unit_revisions is
  'Raw authoring payload, including private answers/review data. Never learner-readable; published rows are immutable.';
comment on column public.unit_revisions.source_digest is
  'Digest from the validated content pipeline, including media bytes. SQL checks its shape, not file contents or editorial approval.';
comment on column public.unit_revisions.status is
  'Revision lifecycle only. Whole-chapter release/import validation still controls learner availability.';

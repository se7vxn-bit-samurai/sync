-- One-off cleanup. Personal saves have used the fixed department_key '__personal__' since the
-- per-department keying was retired; the app never reads any other personal row. Rows left over
-- from the old scheme are moved out of the API-exposed table into an archive only the service role
-- can read, rather than deleted outright: one of them still holds schedule rows that exist nowhere
-- else in the cloud.

create table if not exists private.workspaces_legacy_archive as
  select w.*, now() as archived_at
  from public.workspaces w
  where false;

alter table private.workspaces_legacy_archive enable row level security;
revoke all on private.workspaces_legacy_archive from public, anon, authenticated;

insert into private.workspaces_legacy_archive
  select w.*, now()
  from public.workspaces w
  where w.team_id is null
    and w.department_key <> '__personal__'
    and not exists (select 1 from private.workspaces_legacy_archive a where a.id = w.id);

delete from public.workspaces w
  using private.workspaces_legacy_archive a
  where a.id = w.id;

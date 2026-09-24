-- Cross-device sync: a server-owned revision number on every workspace row.
--
-- Clients no longer compare timestamps from two different device clocks. Each device remembers the
-- `version` it last saved or loaded, and a save is an UPDATE ... WHERE version = <that number>:
-- zero rows back means another device saved in between, and the app shows its conflict screen
-- instead of overwriting. The trigger below is the only thing that ever sets `version`.
--
-- Compatible with the client that predates this migration: its upsert still works (the trigger
-- bumps the version on the conflict-update path) and the timestamp it sends is kept as-is.
--
-- Earlier migrations for this project live only in the Supabase project's migration history.

alter table public.workspaces
  add column if not exists version bigint not null default 1;

create or replace function private.workspaces_bump_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
    -- Clients that leave updated_at alone get the server clock; one that sends its own keeps it.
    if new.updated_at is not distinct from old.updated_at then
      new.updated_at := now();
    end if;
  else
    new.version := 1;
    if new.updated_at is null then
      new.updated_at := now();
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.workspaces_bump_version() from public, anon, authenticated;

drop trigger if exists workspaces_bump_version on public.workspaces;
create trigger workspaces_bump_version
  before insert or update on public.workspaces
  for each row execute function private.workspaces_bump_version();

-- Each of these duplicated a full UNIQUE constraint on the same columns
-- (workspaces_owner_dept_unique / workspaces_team_dept_unique), which is what the upsert uses.
drop index if exists public.workspaces_personal_unique;
drop index if exists public.workspaces_team_unique;

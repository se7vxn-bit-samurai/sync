-- Baseline: the schema the live project had before any migration in this folder, written down so a
-- fresh database (the sync-dev project, CI) can be built from this folder alone.
--
-- It was originally created by hand in the dashboard. Every statement here is idempotent, so running
-- it against the live project changes nothing. Later migrations change these objects; this file
-- only describes the starting point.

create schema if not exists private;

-- Profiles: one per account, created by a trigger when someone signs up.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  full_name text,
  organization text,
  role text,
  preferred_colorway text,
  continuation_pref text default 'ask' check (continuation_pref in ('ask', 'last'))
);
alter table public.profiles enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'Users can view own profile') then
    create policy "Users can view own profile" on public.profiles for select using ((select auth.uid()) = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'Users can update own profile') then
    create policy "Users can update own profile" on public.profiles for update using ((select auth.uid()) = id);
  end if;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = 'public' as $$
begin
  insert into public.profiles (id, email, created_at)
  values (new.id, new.email, now())
  on conflict (id) do nothing;
  return new;
end;
$$;
do $$ begin
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth' and c.relname = 'users' and t.tgname = 'on_auth_user_created') then
    create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
  end if;
end $$;

-- Workspaces: each account's synced project data, one row per (owner, department_key).
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  team_id uuid,
  department_key text not null default 'default',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint workspace_owner_xor_team check ((owner_user_id is not null and team_id is null) or (owner_user_id is null and team_id is not null)),
  constraint workspaces_owner_dept_unique unique (owner_user_id, department_key),
  constraint workspaces_team_dept_unique unique (team_id, department_key)
);
alter table public.workspaces enable row level security;
grant usage on schema private to authenticated;

-- Team sharing scaffold and the workspace policies that used it. Retired by
-- 20260927091000_retire_team_sharing.sql, so it is only (re)created before the org layer exists.
do $baseline$ begin
  if to_regnamespace('core') is not null then return; end if;
  execute $sql$ create table if not exists public.teams (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    created_by uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()) $sql$;
  execute 'create index if not exists teams_created_by_idx on public.teams (created_by)';
  execute $sql$ create table if not exists public.team_members (
    team_id uuid not null references public.teams(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null default 'member' check (role in ('owner', 'member')),
    joined_at timestamptz not null default now(),
    primary key (team_id, user_id)) $sql$;
  execute 'create index if not exists team_members_user_id_idx on public.team_members (user_id)';
  if not exists (select 1 from pg_constraint where conname = 'workspaces_team_id_fkey') then
    execute 'alter table public.workspaces add constraint workspaces_team_id_fkey foreign key (team_id) references public.teams(id) on delete cascade';
  end if;
  execute 'alter table public.teams enable row level security';
  execute 'alter table public.team_members enable row level security';
  execute $sql$ create or replace function private.is_team_member(p_team_id uuid)
    returns boolean language sql stable security definer set search_path = 'public' as $f$
      select exists (select 1 from public.team_members where team_id = p_team_id and user_id = auth.uid());
    $f$ $sql$;
  execute $sql$ create or replace function private.is_team_owner(p_team_id uuid)
    returns boolean language sql stable security definer set search_path = 'public' as $f$
      select exists (select 1 from public.team_members where team_id = p_team_id and user_id = auth.uid() and role = 'owner');
    $f$ $sql$;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'teams') then
    execute 'create policy teams_select on public.teams for select using ((created_by = (select auth.uid())) or private.is_team_member(id))';
    execute 'create policy teams_insert on public.teams for insert with check (created_by = (select auth.uid()))';
    execute 'create policy teams_update on public.teams for update using (private.is_team_owner(id))';
    execute 'create policy teams_delete on public.teams for delete using (private.is_team_owner(id))';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'team_members') then
    execute 'create policy team_members_select on public.team_members for select using ((user_id = (select auth.uid())) or private.is_team_member(team_id))';
    execute $sql$ create policy team_members_insert on public.team_members for insert with check (private.is_team_owner(team_id)
      or (role = 'owner' and exists (select 1 from public.teams t where t.id = team_members.team_id and t.created_by = (select auth.uid())))) $sql$;
    execute 'create policy team_members_delete on public.team_members for delete using (private.is_team_owner(team_id) or (user_id = (select auth.uid())))';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workspaces') then
    execute 'create policy workspaces_select on public.workspaces for select using ((owner_user_id = (select auth.uid())) or private.is_team_member(team_id))';
    execute 'create policy workspaces_insert on public.workspaces for insert with check ((owner_user_id = (select auth.uid())) or private.is_team_member(team_id))';
    execute 'create policy workspaces_update on public.workspaces for update using ((owner_user_id = (select auth.uid())) or private.is_team_member(team_id))';
    execute 'create policy workspaces_delete on public.workspaces for delete using ((owner_user_id = (select auth.uid())) or private.is_team_owner(team_id))';
  end if;
end $baseline$;

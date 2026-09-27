-- Retire the unused team-sharing scaffold (decision 5 in docs/ORG-LAYER-PLAN.md).
--
-- public.teams and public.team_members were an early owner/member idea for sharing workspaces.
-- Nothing reads them (both are empty) and the shared organisation now lives in schema core.
--
-- The workspaces policies call private.is_team_member / private.is_team_owner, which read
-- team_members. Dropping the tables alone would leave those calls failing at run time on every
-- workspace read, so the policies are rewritten first: a workspace belongs to its owner only.
--
-- workspaces.team_id stays as an unused, nullable column: the app still writes team_id: null.

drop policy if exists workspaces_select on public.workspaces;
drop policy if exists workspaces_insert on public.workspaces;
drop policy if exists workspaces_update on public.workspaces;
drop policy if exists workspaces_delete on public.workspaces;

create policy workspaces_select on public.workspaces for select to authenticated
  using (owner_user_id = (select auth.uid()));
create policy workspaces_insert on public.workspaces for insert to authenticated
  with check (owner_user_id = (select auth.uid()));
create policy workspaces_update on public.workspaces for update to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));
create policy workspaces_delete on public.workspaces for delete to authenticated
  using (owner_user_id = (select auth.uid()));

alter table public.workspaces drop constraint if exists workspaces_team_id_fkey;

drop table if exists public.team_members;
drop table if exists public.teams;

drop function if exists private.is_team_member(uuid);
drop function if exists private.is_team_owner(uuid);

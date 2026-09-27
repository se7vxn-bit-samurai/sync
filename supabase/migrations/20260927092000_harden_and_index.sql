-- Follow-ups from the Supabase advisors after the org layer landed on sync-dev.

-- handle_new_user is the sign-up trigger. Supabase grants EXECUTE on everything in public to the API
-- roles, so it was also reachable as /rest/v1/rpc/handle_new_user. Triggers need no grant.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Foreign keys get covering indexes (lookups by person, and deletes cascading from people).
drop index if exists core.reporting_lines_person_idx;
drop index if exists core.reporting_lines_leader_idx;
drop index if exists core.acting_org_idx;
drop index if exists core.people_org_dept_idx;
create index if not exists reporting_lines_person_idx on core.reporting_lines (person_id, effective_from);
create index if not exists reporting_lines_leader_idx on core.reporting_lines (reports_to_id);
create index if not exists acting_person_idx on core.acting_assignments (person_id);
create index if not exists acting_for_person_idx on core.acting_assignments (for_person_id);
create index if not exists people_dept_idx on core.people (dept_id);
create index if not exists org_members_person_idx on core.org_members (person_id);
create index if not exists invites_org_idx on core.invites (org_id);
create index if not exists invites_person_idx on core.invites (person_id);

-- MirrorFlow Core: the shared organisation.
--
-- People, dated reporting lines, acting cover, departments, members (Google account <-> person,
-- with a role), invites and an audit log of every org edit. Sync is the first app on it; Messenger,
-- Coach and Insight can reuse it. Sync-only data (schedule rows, attendance, requests) will live in
-- a separate `sync` schema in later phases.
--
-- `core` is NOT exposed through the REST API. The app reaches it only through the public org_*
-- functions at the bottom of this file. Each one checks membership, role and scope itself.
-- Row-level security is also on for every table: a second line of defence, and what realtime
-- subscriptions will rely on later.
--
-- Scope (who can see whom) is decided in one place: core.visible_people / core.readable_people.
-- See docs/ORG-LAYER-PLAN.md sections 3 and 4.

create schema if not exists core;
revoke all on schema core from public;
grant usage on schema core to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- Tables
-- ════════════════════════════════════════════════════════════════════════════

create table core.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  default_tz text not null default 'Europe/London',
  created_by uuid,
  created_at timestamptz not null default now()
);

-- settings: department-level preferences set once by Ops (BCEA limits, EOD cut-off, minimum
-- staffing, leave caps). Keys match the app's preference registry.
create table core.departments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references core.orgs(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  settings jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (org_id, name)
);

create table core.people (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references core.orgs(id) on delete cascade,
  dept_id uuid references core.departments(id) on delete set null,
  full_name text not null check (length(btrim(full_name)) between 1 and 160),
  email text check (email is null or email = lower(btrim(email))),
  employee_no text,
  role_title text,
  team_name text,
  status text not null default 'Active' check (status in ('Active', 'Leaver', 'Inactive')),
  labels text[] not null default '{}',
  start_date date,
  end_date date,
  -- The Sync project's own person id this record was created from, so the app can map both ways.
  source_ref text,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create unique index people_org_email_key on core.people (org_id, email) where email is not null;
create unique index people_org_source_key on core.people (org_id, source_ref) where source_ref is not null;
create index people_org_dept_idx on core.people (org_id, dept_id);

-- Who reports to whom, and from when. A null reports_to_id is never stored: "no leader" is the
-- absence of a line on that date. Primary lines for one person never overlap (trigger below).
create table core.reporting_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references core.orgs(id) on delete cascade,
  person_id uuid not null references core.people(id) on delete cascade,
  reports_to_id uuid not null references core.people(id) on delete cascade,
  kind text not null default 'primary' check (kind in ('primary', 'co_leader')),
  effective_from date not null,
  effective_to date,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (effective_to is null or effective_to >= effective_from),
  check (reports_to_id <> person_id)
);
create index reporting_lines_person_idx on core.reporting_lines (org_id, person_id, effective_from);
create index reporting_lines_leader_idx on core.reporting_lines (org_id, reports_to_id);

-- Dated acting cover. for_person_id null = covering a vacancy.
create table core.acting_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references core.orgs(id) on delete cascade,
  person_id uuid not null references core.people(id) on delete cascade,
  for_person_id uuid references core.people(id) on delete cascade,
  acting_role text not null default 'Acting Team Lead',
  label text,
  starts date not null,
  ends date,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (ends is null or ends >= starts),
  check (for_person_id is null or for_person_id <> person_id)
);
create index acting_org_idx on core.acting_assignments (org_id, person_id);

-- A signed-in account in an org: which person it is, and its role.
create table core.org_members (
  id uuid not null default gen_random_uuid() unique,
  org_id uuid not null references core.orgs(id) on delete cascade,
  user_id uuid not null,
  person_id uuid references core.people(id) on delete set null,
  app_role text not null check (app_role in ('agent', 'tl', 'manager', 'ops', 'hr', 'admin')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create unique index org_members_person_key on core.org_members (org_id, person_id) where person_id is not null;
create index org_members_user_idx on core.org_members (user_id);

-- Invites: matched by email on sign-in, or redeemed with a single-use code (only its hash is kept).
create table core.invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references core.orgs(id) on delete cascade,
  person_id uuid references core.people(id) on delete cascade,
  email text check (email is null or email = lower(btrim(email))),
  code_hash text unique,
  app_role text not null check (app_role in ('agent', 'tl', 'manager', 'ops', 'hr', 'admin')),
  invited_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_by uuid,
  accepted_at timestamptz,
  check (email is not null or code_hash is not null)
);
create index invites_email_idx on core.invites (email) where accepted_at is null;

-- Every org edit, with the row before and after. Rows written by one action share a batch_id,
-- which is what Undo reverts.
create table core.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  table_name text not null,
  row_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  before jsonb,
  after jsonb,
  actor_user_id uuid,
  actor_person_id uuid,
  batch_id uuid not null,
  summary text,
  reverted_by_batch uuid,
  at timestamptz not null default now()
);
create index audit_org_idx on core.audit_log (org_id, id desc);
create index audit_batch_idx on core.audit_log (batch_id);
create index audit_row_idx on core.audit_log (table_name, row_id, id);

-- ════════════════════════════════════════════════════════════════════════════
-- Helpers: roles and scope. SECURITY DEFINER so row-level security policies can call them without
-- recursing into their own table's policy.
-- ════════════════════════════════════════════════════════════════════════════

-- agent < tl < manager = ops = hr < admin
create function core.role_rank(p_role text) returns int
language sql immutable set search_path = '' as $$
  select case p_role when 'agent' then 1 when 'tl' then 2 when 'manager' then 3 when 'ops' then 3
    when 'hr' then 3 when 'admin' then 4 else 0 end
$$;

create function core.my_role(p_user uuid, p_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.app_role from core.org_members m
  where m.user_id = p_user and m.org_id = p_org and m.status = 'active'
$$;

create function core.my_orgs(p_user uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.org_id from core.org_members m where m.user_id = p_user and m.status = 'active'
$$;

create function core.my_admin_orgs(p_user uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.org_id from core.org_members m
  where m.user_id = p_user and m.status = 'active' and m.app_role in ('admin', 'ops', 'hr')
$$;

-- The data scope: the user's own person, everyone below them on the date, everyone below the
-- people they are acting for on the date, and the whole org for ops, HR and admin.
-- Schedules, attendance and requests (later phases) are read through this.
create function core.visible_people(p_user uuid, p_org uuid, p_date date) returns setof uuid
language sql stable security definer set search_path = '' as $$
  with recursive me as (
    select m.person_id, m.app_role from core.org_members m
    where m.user_id = p_user and m.org_id = p_org and m.status = 'active'
  ), roots as (
    select me.person_id from me where me.person_id is not null
    union
    select a.for_person_id from core.acting_assignments a join me on a.person_id = me.person_id
    where a.org_id = p_org and a.status = 'active' and a.for_person_id is not null
      and a.starts <= p_date and (a.ends is null or a.ends >= p_date)
  ), tree(person_id) as (
    select roots.person_id from roots
    union
    select l.person_id from core.reporting_lines l join tree t on l.reports_to_id = t.person_id
    where l.org_id = p_org and l.effective_from <= p_date and (l.effective_to is null or l.effective_to >= p_date)
  )
  select tree.person_id from tree
  union
  select p.id from core.people p
  where p.org_id = p_org and exists (select 1 from me where me.app_role in ('ops', 'hr', 'admin'))
$$;

-- Upward from the user's own person: their leaders on the date, and anyone acting for them.
-- An agent sees who they report to (and who is covering), never their teammates.
create function core.leader_chain(p_user uuid, p_org uuid, p_date date) returns setof uuid
language sql stable security definer set search_path = '' as $$
  with recursive up(person_id) as (
    select m.person_id from core.org_members m
    where m.user_id = p_user and m.org_id = p_org and m.status = 'active' and m.person_id is not null
    union
    select l.reports_to_id from core.reporting_lines l join up on l.person_id = up.person_id
    where l.org_id = p_org and l.kind = 'primary'
      and l.effective_from <= p_date and (l.effective_to is null or l.effective_to >= p_date)
  )
  select up.person_id from up
  union
  select a.person_id from core.acting_assignments a
  where a.org_id = p_org and a.status = 'active' and a.for_person_id in (select up.person_id from up)
    and a.starts <= p_date and (a.ends is null or a.ends >= p_date)
$$;

-- The org directory: what the user may read about people (names, roles, lines, acting cover).
-- Data scope and leader chain today, plus, for TLs and managers, their whole department: anyone
-- from TL up edits the department's org chart (decision 2), so they must see it.
create function core.readable_people(p_user uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select v from core.org_members m, lateral core.visible_people(p_user, m.org_id, current_date) v
  where m.user_id = p_user and m.status = 'active'
  union
  select c from core.org_members m, lateral core.leader_chain(p_user, m.org_id, current_date) c
  where m.user_id = p_user and m.status = 'active'
  union
  select p.id from core.org_members m
  left join core.people mine on mine.id = m.person_id
  join core.people p on p.org_id = m.org_id
  where m.user_id = p_user and m.status = 'active' and m.app_role in ('tl', 'manager')
    and p.dept_id is not distinct from mine.dept_id
$$;

-- May this user change this person's org record, reporting line or acting cover?
create function core.can_edit_person(p_user uuid, p_org uuid, p_person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from core.org_members m
    left join core.people mine on mine.id = m.person_id
    join core.people p on p.id = p_person and p.org_id = m.org_id
    where m.user_id = p_user and m.org_id = p_org and m.status = 'active' and (
      m.app_role in ('admin', 'ops', 'hr')
      or (m.app_role in ('tl', 'manager') and (
        p.dept_id is not distinct from mine.dept_id
        or p.id in (select core.visible_people(p_user, p_org, current_date))
      ))
    )
  )
$$;

-- Is p_candidate p_root or anywhere below p_root on the date? Used to refuse moves that loop.
create function core.is_under(p_org uuid, p_candidate uuid, p_root uuid, p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  with recursive t(pid) as (
    select p_root
    union
    select l.person_id from core.reporting_lines l join t on l.reports_to_id = t.pid
    where l.org_id = p_org and l.kind = 'primary'
      and l.effective_from <= p_date and (l.effective_to is null or l.effective_to >= p_date)
  )
  select exists (select 1 from t where t.pid = p_candidate)
$$;

-- Raises unless the signed-in user is an active member with at least this role rank.
create function core.require_role(p_org uuid, p_min_rank int) returns text
language plpgsql stable security definer set search_path = '' as $$
declare v_role text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  v_role := core.my_role(auth.uid(), p_org);
  if v_role is null then raise exception 'not_member'; end if;
  if core.role_rank(v_role) < p_min_rank then raise exception 'forbidden'; end if;
  return v_role;
end $$;

-- Every action that writes org rows starts a batch: the audit trigger stamps it on each row.
create function core.begin_batch(p_note text) returns uuid
language plpgsql volatile set search_path = '' as $$
declare v_batch uuid := gen_random_uuid();
begin
  perform set_config('core.batch_id', v_batch::text, true);
  perform set_config('core.batch_note', coalesce(p_note, ''), true);
  return v_batch;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Triggers: versions, audit, no overlapping lines
-- ════════════════════════════════════════════════════════════════════════════

create function core.touch_row() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create function core.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_before jsonb; v_after jsonb; v_org uuid; v_row uuid; v_person uuid;
  v_skip text[] := array['version', 'updated_at', 'updated_by'];
begin
  if tg_op in ('UPDATE', 'DELETE') then v_before := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_after := to_jsonb(new); end if;
  -- A write that changed nothing but the bookkeeping columns is not an edit.
  if tg_op = 'UPDATE' and (v_before - v_skip) = (v_after - v_skip) then return null; end if;
  v_org := coalesce(v_after ->> 'org_id', v_before ->> 'org_id')::uuid;
  v_row := coalesce(v_after ->> 'id', v_before ->> 'id')::uuid;
  select m.person_id into v_person from core.org_members m where m.user_id = auth.uid() and m.org_id = v_org;
  insert into core.audit_log (org_id, table_name, row_id, action, before, after, actor_user_id, actor_person_id, batch_id, summary)
  values (v_org, tg_table_name, v_row, lower(tg_op), v_before, v_after, auth.uid(), v_person,
    coalesce(nullif(current_setting('core.batch_id', true), '')::uuid, gen_random_uuid()),
    nullif(current_setting('core.batch_note', true), ''));
  return null;
end $$;

create function core.check_line_overlap() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind = 'primary' and exists (
    select 1 from core.reporting_lines l
    where l.person_id = new.person_id and l.kind = 'primary' and l.id <> new.id
      and l.effective_from <= coalesce(new.effective_to, 'infinity'::date)
      and coalesce(l.effective_to, 'infinity'::date) >= new.effective_from
  ) then
    raise exception 'line_overlap';
  end if;
  return new;
end $$;

create trigger touch before update on core.departments for each row execute function core.touch_row();
create trigger touch before update on core.people for each row execute function core.touch_row();
create trigger touch before update on core.reporting_lines for each row execute function core.touch_row();
create trigger touch before update on core.acting_assignments for each row execute function core.touch_row();
create trigger touch_insert before insert on core.people for each row execute function core.touch_row();
create trigger touch_insert before insert on core.reporting_lines for each row execute function core.touch_row();
create trigger touch_insert before insert on core.acting_assignments for each row execute function core.touch_row();
create trigger touch_insert before insert on core.departments for each row execute function core.touch_row();

create trigger no_overlap before insert or update on core.reporting_lines for each row execute function core.check_line_overlap();

create trigger audit after insert or update or delete on core.departments for each row execute function core.audit_row();
create trigger audit after insert or update or delete on core.people for each row execute function core.audit_row();
create trigger audit after insert or update or delete on core.reporting_lines for each row execute function core.audit_row();
create trigger audit after insert or update or delete on core.acting_assignments for each row execute function core.audit_row();
create trigger audit after insert or update or delete on core.org_members for each row execute function core.audit_row();

-- ════════════════════════════════════════════════════════════════════════════
-- Row-level security. Reads only: nothing is granted for direct writes, which go through the
-- org_* functions below.
-- ════════════════════════════════════════════════════════════════════════════

alter table core.orgs enable row level security;
alter table core.departments enable row level security;
alter table core.people enable row level security;
alter table core.reporting_lines enable row level security;
alter table core.acting_assignments enable row level security;
alter table core.org_members enable row level security;
alter table core.invites enable row level security;
alter table core.audit_log enable row level security;

grant select on core.orgs, core.departments, core.people, core.reporting_lines, core.acting_assignments,
  core.org_members, core.invites, core.audit_log to authenticated;

create policy orgs_read on core.orgs for select to authenticated
  using (id in (select core.my_orgs((select auth.uid()))));
create policy departments_read on core.departments for select to authenticated
  using (org_id in (select core.my_orgs((select auth.uid()))));
create policy people_read on core.people for select to authenticated
  using (id in (select core.readable_people((select auth.uid()))));
create policy lines_read on core.reporting_lines for select to authenticated
  using (person_id in (select core.readable_people((select auth.uid()))));
create policy acting_read on core.acting_assignments for select to authenticated
  using (person_id in (select core.readable_people((select auth.uid())))
    or for_person_id in (select core.readable_people((select auth.uid()))));
create policy members_read on core.org_members for select to authenticated
  using (user_id = (select auth.uid()) or org_id in (select core.my_admin_orgs((select auth.uid()))));
create policy invites_read on core.invites for select to authenticated
  using (invited_by = (select auth.uid()) or org_id in (select core.my_admin_orgs((select auth.uid()))));
create policy audit_read on core.audit_log for select to authenticated
  using (org_id in (select core.my_admin_orgs((select auth.uid()))));

-- ════════════════════════════════════════════════════════════════════════════
-- The API: public.org_* functions. Errors are raised with stable message keys the app maps to
-- words: not_signed_in, not_member, forbidden, not_found, version_conflict, newer_change,
-- already_reverted, invalid_code, already_member, email_taken, name_taken, last_admin, line_overlap.
-- ════════════════════════════════════════════════════════════════════════════

-- Orgs the signed-in account belongs to, with its role and person.
create function public.org_me() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'org_id', o.id, 'org_name', o.name, 'app_role', m.app_role,
      'person_id', m.person_id, 'person_name', p.full_name, 'dept_id', p.dept_id) order by o.name)
    from core.org_members m
    join core.orgs o on o.id = m.org_id
    left join core.people p on p.id = m.person_id
    where m.user_id = auth.uid() and m.status = 'active'
  ), '[]'::jsonb);
end $$;

-- Run on sign-in. Links the account to people by its verified email: pending invites first (with
-- their role), then any active person record carrying the email (as an agent). Nothing is linked
-- for an unverified email, and a person already linked to another account is left alone.
create function public.org_claim() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_email text; r record;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select lower(btrim(u.email)) into v_email from auth.users u
  where u.id = v_uid and u.email_confirmed_at is not null;
  if v_email is not null and v_email <> '' then
    for r in
      select i.* from core.invites i
      where i.email = v_email and i.accepted_at is null and i.expires_at > now()
      order by core.role_rank(i.app_role) desc, i.created_at
    loop
      if not exists (select 1 from core.org_members m where m.org_id = r.org_id and m.user_id = v_uid)
        and not exists (select 1 from core.org_members m where m.org_id = r.org_id and m.person_id = r.person_id) then
        insert into core.org_members (org_id, user_id, person_id, app_role) values (r.org_id, v_uid, r.person_id, r.app_role);
        update core.invites set accepted_by = v_uid, accepted_at = now() where id = r.id;
      end if;
    end loop;
    for r in
      select p.* from core.people p
      where p.email = v_email and p.status = 'Active'
        and not exists (select 1 from core.org_members m where m.org_id = p.org_id and (m.user_id = v_uid or m.person_id = p.id))
    loop
      insert into core.org_members (org_id, user_id, person_id, app_role) values (r.org_id, v_uid, r.id, 'agent');
    end loop;
  end if;
  return public.org_me();
end $$;

-- Redeems a single-use invite code (for people without a known email).
create function public.org_redeem_code(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); r core.invites;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select * into r from core.invites i
  where i.code_hash = encode(sha256(convert_to(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8')), 'hex')
    and i.accepted_at is null and i.expires_at > now();
  if not found then raise exception 'invalid_code'; end if;
  if exists (select 1 from core.org_members m where m.org_id = r.org_id and m.user_id = v_uid) then raise exception 'already_member'; end if;
  if r.person_id is not null and exists (select 1 from core.org_members m where m.org_id = r.org_id and m.person_id = r.person_id) then
    raise exception 'already_member';
  end if;
  insert into core.org_members (org_id, user_id, person_id, app_role) values (r.org_id, v_uid, r.person_id, r.app_role);
  update core.invites set accepted_by = v_uid, accepted_at = now() where id = r.id;
  return public.org_me();
end $$;

-- Creates an org from a Sync project in one audited batch. The caller becomes its admin, linked to
-- the person they chose (me_ref).
-- payload: { org_name, dept_name, me_ref,
--   people: [{ ref, full_name, email, role_title, team_name, status, labels[], start_date, end_date }],
--   lines:  [{ person_ref, leader_ref, from, to }],
--   acting: [{ person_ref, for_ref, starts, ends, role, label, status }] }
create function public.org_create_from_project(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_org uuid; v_dept uuid; v_batch uuid; v_map jsonb := '{}'::jsonb;
  r jsonb; v_id uuid; v_email text; v_person uuid; v_leader uuid; v_for uuid; v_from date; v_to date;
  n_people int := 0; n_lines int := 0; n_acting int := 0; n_skipped int := 0;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if coalesce(btrim(p_payload ->> 'org_name'), '') = '' then raise exception 'org_name_required'; end if;
  if jsonb_array_length(coalesce(p_payload -> 'people', '[]'::jsonb)) > 5000 then raise exception 'too_many_people'; end if;
  v_batch := core.begin_batch('Organisation created from ' || coalesce(nullif(btrim(p_payload ->> 'dept_name'), ''), 'a project'));

  insert into core.orgs (name, created_by) values (btrim(p_payload ->> 'org_name'), v_uid) returning id into v_org;
  insert into core.departments (org_id, name)
  values (v_org, coalesce(nullif(btrim(p_payload ->> 'dept_name'), ''), 'Main')) returning id into v_dept;

  for r in select * from jsonb_array_elements(coalesce(p_payload -> 'people', '[]'::jsonb)) loop
    if coalesce(btrim(r ->> 'full_name'), '') = '' then continue; end if;
    v_email := nullif(lower(btrim(r ->> 'email')), '');
    if v_email is not null and exists (select 1 from core.people p where p.org_id = v_org and p.email = v_email) then v_email := null; end if;
    insert into core.people (org_id, dept_id, full_name, email, role_title, team_name, status, labels, start_date, end_date, source_ref)
    values (v_org, v_dept, btrim(r ->> 'full_name'), v_email, nullif(btrim(r ->> 'role_title'), ''), nullif(btrim(r ->> 'team_name'), ''),
      case when r ->> 'status' in ('Active', 'Leaver', 'Inactive') then r ->> 'status' else 'Active' end,
      coalesce(array(select btrim(t.v) from jsonb_array_elements_text(coalesce(r -> 'labels', '[]'::jsonb)) as t(v) where btrim(t.v) <> ''), '{}'),
      nullif(r ->> 'start_date', '')::date, nullif(r ->> 'end_date', '')::date,
      case when coalesce(r ->> 'ref', '') <> '' and not (v_map ? (r ->> 'ref')) then r ->> 'ref' end)
    returning id into v_id;
    if coalesce(r ->> 'ref', '') <> '' and not (v_map ? (r ->> 'ref')) then v_map := v_map || jsonb_build_object(r ->> 'ref', v_id); end if;
    n_people := n_people + 1;
  end loop;

  for r in
    select t.e from jsonb_array_elements(coalesce(p_payload -> 'lines', '[]'::jsonb)) as t(e)
    order by t.e ->> 'person_ref', coalesce(t.e ->> 'from', '')
  loop
    v_person := (v_map ->> (r ->> 'person_ref'))::uuid;
    v_leader := (v_map ->> (r ->> 'leader_ref'))::uuid;
    v_from := coalesce(nullif(r ->> 'from', '')::date, current_date);
    v_to := nullif(r ->> 'to', '')::date;
    if v_person is null or v_leader is null or v_person = v_leader or (v_to is not null and v_to < v_from)
      or exists (select 1 from core.reporting_lines l where l.person_id = v_person and l.kind = 'primary'
        and l.effective_from <= coalesce(v_to, 'infinity'::date) and coalesce(l.effective_to, 'infinity'::date) >= v_from) then
      n_skipped := n_skipped + 1; continue;
    end if;
    insert into core.reporting_lines (org_id, person_id, reports_to_id, effective_from, effective_to)
    values (v_org, v_person, v_leader, v_from, v_to);
    n_lines := n_lines + 1;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p_payload -> 'acting', '[]'::jsonb)) loop
    v_person := (v_map ->> (r ->> 'person_ref'))::uuid;
    v_for := (v_map ->> (r ->> 'for_ref'))::uuid;
    v_from := nullif(r ->> 'starts', '')::date;
    v_to := nullif(r ->> 'ends', '')::date;
    if v_person is null or v_from is null or v_person = v_for or (v_to is not null and v_to < v_from) then
      n_skipped := n_skipped + 1; continue;
    end if;
    insert into core.acting_assignments (org_id, person_id, for_person_id, acting_role, label, starts, ends, status)
    values (v_org, v_person, v_for, coalesce(nullif(btrim(r ->> 'role'), ''), 'Acting Team Lead'), nullif(btrim(r ->> 'label'), ''),
      v_from, v_to, case when r ->> 'status' = 'cancelled' then 'cancelled' else 'active' end);
    n_acting := n_acting + 1;
  end loop;

  insert into core.org_members (org_id, user_id, person_id, app_role)
  values (v_org, v_uid, (v_map ->> (p_payload ->> 'me_ref'))::uuid, 'admin');

  return jsonb_build_object('org_id', v_org, 'dept_id', v_dept, 'batch_id', v_batch, 'people', n_people,
    'lines', n_lines, 'acting', n_acting, 'skipped', n_skipped, 'map', v_map);
end $$;

-- Everything the signed-in user may read about one org. SECURITY INVOKER: row-level security
-- decides what comes back, so this can never show more than the policies allow.
create function public.org_snapshot(p_org uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_role text; v_person uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  v_role := core.my_role(auth.uid(), p_org);
  if v_role is null then raise exception 'not_member'; end if;
  select m.person_id into v_person from core.org_members m where m.org_id = p_org and m.user_id = auth.uid();
  return jsonb_build_object(
    'org', (select to_jsonb(o) from core.orgs o where o.id = p_org),
    'me', jsonb_build_object('app_role', v_role, 'person_id', v_person,
      'visible', coalesce((select jsonb_agg(v) from core.visible_people(auth.uid(), p_org, current_date) v), '[]'::jsonb)),
    'departments', coalesce((select jsonb_agg(to_jsonb(d) order by d.name) from core.departments d where d.org_id = p_org), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(to_jsonb(p) order by p.full_name) from core.people p where p.org_id = p_org), '[]'::jsonb),
    'lines', coalesce((select jsonb_agg(to_jsonb(l) order by l.person_id, l.effective_from) from core.reporting_lines l where l.org_id = p_org), '[]'::jsonb),
    'acting', coalesce((select jsonb_agg(to_jsonb(a) order by a.starts) from core.acting_assignments a where a.org_id = p_org), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'person_id', m.person_id, 'app_role', m.app_role, 'status', m.status))
      from core.org_members m where m.org_id = p_org), '[]'::jsonb)
  );
end $$;

-- Moves people to a new leader (or to no leader) from an effective date. History is kept: the line
-- in force on that date ends the day before, and the new one runs to where the old one would have.
-- A move that would put someone under themselves is skipped and reported.
create function public.org_move(p_org uuid, p_people uuid[], p_leader uuid, p_effective date, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_batch uuid; v_p uuid; cur core.reporting_lines; v_next date;
  n_moved int := 0; n_same int := 0; v_skipped jsonb := '[]'::jsonb; v_leader_name text;
begin
  perform core.require_role(p_org, 2);
  if p_effective is null then raise exception 'effective_date_required'; end if;
  if p_leader is not null then
    select full_name into v_leader_name from core.people where id = p_leader and org_id = p_org;
    if v_leader_name is null then raise exception 'not_found'; end if;
  end if;
  v_batch := core.begin_batch(coalesce(nullif(btrim(p_note), ''),
    'Moved ' || coalesce(array_length(p_people, 1), 0) || ' to ' || coalesce(v_leader_name, 'no leader')));
  foreach v_p in array coalesce(p_people, '{}') loop
    if not core.can_edit_person(v_uid, p_org, v_p) then raise exception 'forbidden'; end if;
    if p_leader is not null and core.is_under(p_org, p_leader, v_p, p_effective) then
      v_skipped := v_skipped || to_jsonb(v_p); continue;
    end if;
    select * into cur from core.reporting_lines l
    where l.org_id = p_org and l.person_id = v_p and l.kind = 'primary'
      and l.effective_from <= p_effective and (l.effective_to is null or l.effective_to >= p_effective)
    for update;
    if found then
      if cur.reports_to_id is not distinct from p_leader then n_same := n_same + 1; continue; end if;
      if cur.effective_from = p_effective then
        if p_leader is null then delete from core.reporting_lines where id = cur.id;
        else update core.reporting_lines set reports_to_id = p_leader where id = cur.id; end if;
      else
        update core.reporting_lines set effective_to = p_effective - 1 where id = cur.id;
        if p_leader is not null then
          insert into core.reporting_lines (org_id, person_id, reports_to_id, effective_from, effective_to)
          values (p_org, v_p, p_leader, p_effective, cur.effective_to);
        end if;
      end if;
    else
      if p_leader is null then n_same := n_same + 1; continue; end if;
      select min(l.effective_from) into v_next from core.reporting_lines l
      where l.org_id = p_org and l.person_id = v_p and l.kind = 'primary' and l.effective_from > p_effective;
      insert into core.reporting_lines (org_id, person_id, reports_to_id, effective_from, effective_to)
      values (p_org, v_p, p_leader, p_effective, v_next - 1);
    end if;
    n_moved := n_moved + 1;
  end loop;
  return jsonb_build_object('batch_id', case when n_moved > 0 then v_batch end, 'moved', n_moved,
    'unchanged', n_same, 'skipped', v_skipped);
end $$;

-- Adds a person (p_person null) or changes one. Changes need the version the caller last saw;
-- if someone else saved in between, nothing is written and version_conflict is raised.
-- p_patch keys: full_name, email, role_title, team_name, status, labels, dept_id, start_date,
-- end_date, employee_no, source_ref (add only).
create function public.org_save_person(p_org uuid, p_person uuid, p_patch jsonb, p_version bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_row core.people; v_dept uuid;
begin
  perform core.require_role(p_org, 2);
  if p_patch ? 'dept_id' and nullif(p_patch ->> 'dept_id', '') is not null
    and not exists (select 1 from core.departments d where d.id = (p_patch ->> 'dept_id')::uuid and d.org_id = p_org) then
    raise exception 'not_found';
  end if;
  if p_person is null then
    if coalesce(btrim(p_patch ->> 'full_name'), '') = '' then raise exception 'full_name_required'; end if;
    select mine.dept_id into v_dept from core.org_members m join core.people mine on mine.id = m.person_id
    where m.org_id = p_org and m.user_id = v_uid;
    perform core.begin_batch('Added ' || btrim(p_patch ->> 'full_name'));
    insert into core.people (org_id, dept_id, full_name, email, role_title, team_name, status, labels, start_date, end_date, employee_no, source_ref)
    values (p_org, coalesce(nullif(p_patch ->> 'dept_id', '')::uuid, v_dept), btrim(p_patch ->> 'full_name'),
      nullif(lower(btrim(p_patch ->> 'email')), ''), nullif(btrim(p_patch ->> 'role_title'), ''), nullif(btrim(p_patch ->> 'team_name'), ''),
      coalesce(nullif(p_patch ->> 'status', ''), 'Active'),
      coalesce(array(select btrim(t.v) from jsonb_array_elements_text(coalesce(p_patch -> 'labels', '[]'::jsonb)) as t(v) where btrim(t.v) <> ''), '{}'),
      nullif(p_patch ->> 'start_date', '')::date, nullif(p_patch ->> 'end_date', '')::date,
      nullif(btrim(p_patch ->> 'employee_no'), ''), nullif(p_patch ->> 'source_ref', ''))
    returning * into v_row;
    return to_jsonb(v_row);
  end if;
  if not core.can_edit_person(v_uid, p_org, p_person) then raise exception 'forbidden'; end if;
  perform core.begin_batch(coalesce(p_patch ->> '_note', 'Edited a person'));
  update core.people p set
    full_name = case when p_patch ? 'full_name' and btrim(p_patch ->> 'full_name') <> '' then btrim(p_patch ->> 'full_name') else p.full_name end,
    email = case when p_patch ? 'email' then nullif(lower(btrim(p_patch ->> 'email')), '') else p.email end,
    role_title = case when p_patch ? 'role_title' then nullif(btrim(p_patch ->> 'role_title'), '') else p.role_title end,
    team_name = case when p_patch ? 'team_name' then nullif(btrim(p_patch ->> 'team_name'), '') else p.team_name end,
    status = case when p_patch ? 'status' then p_patch ->> 'status' else p.status end,
    labels = case when p_patch ? 'labels' then coalesce(array(select btrim(t.v) from jsonb_array_elements_text(p_patch -> 'labels') as t(v) where btrim(t.v) <> ''), '{}') else p.labels end,
    dept_id = case when p_patch ? 'dept_id' then nullif(p_patch ->> 'dept_id', '')::uuid else p.dept_id end,
    start_date = case when p_patch ? 'start_date' then nullif(p_patch ->> 'start_date', '')::date else p.start_date end,
    end_date = case when p_patch ? 'end_date' then nullif(p_patch ->> 'end_date', '')::date else p.end_date end,
    employee_no = case when p_patch ? 'employee_no' then nullif(btrim(p_patch ->> 'employee_no'), '') else p.employee_no end
  where p.id = p_person and p.org_id = p_org and (p_version is null or p.version = p_version)
  returning * into v_row;
  if v_row.id is null then
    if exists (select 1 from core.people p where p.id = p_person and p.org_id = p_org) then raise exception 'version_conflict'; end if;
    raise exception 'not_found';
  end if;
  return to_jsonb(v_row);
exception when unique_violation then
  raise exception 'email_taken';
end $$;

-- Adds (p_id null) or renames a department, or changes its settings (department-level
-- preferences). Ops, HR and admin only; changes need the version last seen.
create function public.org_save_department(p_org uuid, p_id uuid, p_name text, p_settings jsonb default null, p_version bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row core.departments;
begin
  perform core.require_role(p_org, 3);
  if core.my_role(auth.uid(), p_org) = 'manager' then raise exception 'forbidden'; end if;
  if p_id is null then
    if coalesce(btrim(p_name), '') = '' then raise exception 'name_required'; end if;
    perform core.begin_batch('Added department ' || btrim(p_name));
    insert into core.departments (org_id, name, settings) values (p_org, btrim(p_name), coalesce(p_settings, '{}'::jsonb))
    returning * into v_row;
    return to_jsonb(v_row);
  end if;
  perform core.begin_batch('Changed department ' || coalesce(btrim(p_name), ''));
  update core.departments d set name = coalesce(nullif(btrim(p_name), ''), d.name), settings = coalesce(p_settings, d.settings)
  where d.id = p_id and d.org_id = p_org and (p_version is null or d.version = p_version)
  returning * into v_row;
  if v_row.id is null then
    if exists (select 1 from core.departments d where d.id = p_id and d.org_id = p_org) then raise exception 'version_conflict'; end if;
    raise exception 'not_found';
  end if;
  return to_jsonb(v_row);
exception when unique_violation then
  raise exception 'name_taken';
end $$;

-- Books (p_id null) or changes acting cover. To cancel, pass p_status 'cancelled'.
create function public.org_save_acting(p_org uuid, p_id uuid, p_person uuid, p_for uuid, p_starts date, p_ends date,
  p_role text default null, p_label text default null, p_status text default 'active', p_version bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_row core.acting_assignments; v_name text;
begin
  perform core.require_role(p_org, 2);
  if not core.can_edit_person(v_uid, p_org, p_person) or (p_for is not null and not core.can_edit_person(v_uid, p_org, p_for)) then
    raise exception 'forbidden';
  end if;
  select full_name into v_name from core.people where id = p_person;
  if p_id is null then
    perform core.begin_batch(v_name || ' acting ' || coalesce((select 'for ' || full_name from core.people where id = p_for), 'in a vacancy'));
    insert into core.acting_assignments (org_id, person_id, for_person_id, acting_role, label, starts, ends, status)
    values (p_org, p_person, p_for, coalesce(nullif(btrim(p_role), ''), 'Acting Team Lead'), nullif(btrim(p_label), ''),
      p_starts, p_ends, coalesce(p_status, 'active'))
    returning * into v_row;
    return to_jsonb(v_row);
  end if;
  perform core.begin_batch(case when p_status = 'cancelled' then 'Cancelled acting cover for ' else 'Changed acting cover for ' end || v_name);
  update core.acting_assignments a set person_id = p_person, for_person_id = p_for,
    acting_role = coalesce(nullif(btrim(p_role), ''), a.acting_role), label = nullif(btrim(p_label), ''),
    starts = p_starts, ends = p_ends, status = coalesce(p_status, a.status)
  where a.id = p_id and a.org_id = p_org and (p_version is null or a.version = p_version)
  returning * into v_row;
  if v_row.id is null then
    if exists (select 1 from core.acting_assignments a where a.id = p_id and a.org_id = p_org) then raise exception 'version_conflict'; end if;
    raise exception 'not_found';
  end if;
  return to_jsonb(v_row);
end $$;

-- Invites someone: by email (linked when they sign in with it) and always with a single-use code
-- for people whose email is unknown. The code is returned once; only its hash is stored. Nobody can
-- invite with a role above their own.
create function public.org_invite(p_org uuid, p_person uuid, p_email text, p_role text default 'agent')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_role text; v_code text; v_id uuid; v_email text := nullif(lower(btrim(p_email)), '');
begin
  v_role := core.require_role(p_org, 2);
  if core.role_rank(p_role) = 0 then raise exception 'invalid_role'; end if;
  if core.role_rank(p_role) > core.role_rank(v_role) then raise exception 'forbidden'; end if;
  if p_person is not null and not core.can_edit_person(v_uid, p_org, p_person) then raise exception 'forbidden'; end if;
  if p_person is not null and exists (select 1 from core.org_members m where m.org_id = p_org and m.person_id = p_person) then
    raise exception 'already_member';
  end if;
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  insert into core.invites (org_id, person_id, email, code_hash, app_role, invited_by)
  values (p_org, p_person, v_email, encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), p_role, v_uid)
  returning id into v_id;
  -- The email goes on the person record too, if it has none, so the directory shows who can sign in.
  if p_person is not null and v_email is not null then
    perform core.begin_batch('Email added with an invite');
    update core.people set email = v_email
    where id = p_person and email is null and not exists (select 1 from core.people q where q.org_id = p_org and q.email = v_email);
  end if;
  return jsonb_build_object('invite_id', v_id, 'code', substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4) || '-' || substr(v_code, 9, 4),
    'expires_at', now() + interval '14 days');
end $$;

-- Changes a member's role or suspends them. Admin only. The last active admin cannot be demoted.
create function public.org_set_member(p_org uuid, p_user uuid, p_role text, p_status text default 'active')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row core.org_members;
begin
  perform core.require_role(p_org, 4);
  if core.role_rank(p_role) = 0 or p_status not in ('active', 'suspended') then raise exception 'invalid_role'; end if;
  if (p_role <> 'admin' or p_status <> 'active')
    and exists (select 1 from core.org_members m where m.org_id = p_org and m.user_id = p_user and m.app_role = 'admin' and m.status = 'active')
    and (select count(*) from core.org_members m where m.org_id = p_org and m.app_role = 'admin' and m.status = 'active') <= 1 then
    raise exception 'last_admin';
  end if;
  perform core.begin_batch('Member role changed to ' || p_role);
  update core.org_members set app_role = p_role, status = p_status where org_id = p_org and user_id = p_user returning * into v_row;
  if v_row.user_id is null then raise exception 'not_found'; end if;
  return to_jsonb(v_row);
end $$;

-- Recent org changes the user may see, one entry per batch, newest first.
create function public.org_audit(p_org uuid, p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_role text;
begin
  v_role := core.require_role(p_org, 2);
  return coalesce((
    with rows as (
      select a.*, coalesce(a.after ->> 'person_id', a.before ->> 'person_id',
        case when a.table_name = 'people' then a.row_id::text end)::uuid as subject
      from core.audit_log a where a.org_id = p_org
    ), visible as (
      select r.* from rows r
      where core.role_rank(v_role) >= 3 or r.subject in (select core.readable_people(v_uid))
    ), batches as (
      select v.batch_id, min(v.id) as seq, min(v.at) as at, max(v.summary) as summary, bool_or(v.reverted_by_batch is not null) as reverted,
        max(ap.full_name) as actor, count(*) as n,
        jsonb_agg(jsonb_build_object('table', v.table_name, 'action', v.action, 'row_id', v.row_id,
          'person', sp.full_name, 'before', v.before, 'after', v.after) order by v.id) as items
      from visible v
      left join core.people ap on ap.id = v.actor_person_id
      left join core.people sp on sp.id = v.subject
      group by v.batch_id
      order by min(v.id) desc
      limit greatest(1, least(coalesce(p_limit, 50), 500))
    )
    select jsonb_agg(to_jsonb(b) - 'seq' order by b.seq desc) from batches b
  ), '[]'::jsonb);
end $$;

-- Undoes one batch by writing the old values back, as a new audited batch. Refused when a later
-- change touched the same rows (undo that first), or the batch was already undone.
create function public.org_revert(p_batch uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_org uuid; v_new uuid; r core.audit_log; v_set text; v_subject uuid; n int := 0;
begin
  select a.org_id into v_org from core.audit_log a where a.batch_id = p_batch limit 1;
  if v_org is null then raise exception 'not_found'; end if;
  perform core.require_role(v_org, 2);
  if exists (select 1 from core.audit_log a where a.batch_id = p_batch and a.reverted_by_batch is not null) then
    raise exception 'already_reverted';
  end if;
  if exists (select 1 from core.audit_log a where a.batch_id = p_batch and a.table_name not in ('people', 'reporting_lines', 'acting_assignments', 'departments')) then
    raise exception 'forbidden';
  end if;
  -- A later change and its own undo cancel out: neither blocks. Anything else later on the same
  -- rows has to be undone first.
  if exists (
    select 1 from core.audit_log a join core.audit_log b
      on b.table_name = a.table_name and b.row_id = a.row_id and b.id > a.id and b.batch_id <> p_batch
    where a.batch_id = p_batch
      and b.reverted_by_batch is null
      and not exists (select 1 from core.audit_log c where c.reverted_by_batch = b.batch_id and c.id > a.id)
  ) then
    raise exception 'newer_change';
  end if;
  for r in select * from core.audit_log a where a.batch_id = p_batch loop
    v_subject := coalesce(r.after ->> 'person_id', r.before ->> 'person_id', case when r.table_name = 'people' then r.row_id::text end)::uuid;
    if v_subject is not null and not core.can_edit_person(v_uid, v_org, v_subject) then raise exception 'forbidden'; end if;
  end loop;
  v_new := core.begin_batch('Undo: ' || coalesce((select max(a.summary) from core.audit_log a where a.batch_id = p_batch), 'change'));
  for r in select * from core.audit_log a where a.batch_id = p_batch order by a.id desc loop
    if r.action = 'insert' then
      execute format('delete from core.%I where id = $1', r.table_name) using r.row_id;
    elsif r.action = 'delete' then
      execute format('insert into core.%I select * from jsonb_populate_record(null::core.%I, $1)', r.table_name, r.table_name)
        using r.before;
    else
      select string_agg(format('%I = x.%I', t.k, t.k), ', ') into v_set
      from jsonb_object_keys(r.before) as t(k) where t.k not in ('id', 'version', 'updated_at', 'updated_by');
      execute format('update core.%I t set %s from jsonb_populate_record(null::core.%I, $1) x where t.id = $2',
        r.table_name, v_set, r.table_name) using r.before, r.row_id;
    end if;
    n := n + 1;
  end loop;
  update core.audit_log set reverted_by_batch = v_new where batch_id = p_batch;
  return jsonb_build_object('batch_id', v_new, 'reverted', n);
end $$;

-- Only signed-in users may call the API. PUBLIC gets EXECUTE on new functions by default.
revoke all on function public.org_me() from public, anon;
revoke all on function public.org_claim() from public, anon;
revoke all on function public.org_redeem_code(text) from public, anon;
revoke all on function public.org_create_from_project(jsonb) from public, anon;
revoke all on function public.org_snapshot(uuid) from public, anon;
revoke all on function public.org_move(uuid, uuid[], uuid, date, text) from public, anon;
revoke all on function public.org_save_person(uuid, uuid, jsonb, bigint) from public, anon;
revoke all on function public.org_save_department(uuid, uuid, text, jsonb, bigint) from public, anon;
revoke all on function public.org_save_acting(uuid, uuid, uuid, uuid, date, date, text, text, text, bigint) from public, anon;
revoke all on function public.org_invite(uuid, uuid, text, text) from public, anon;
revoke all on function public.org_set_member(uuid, uuid, text, text) from public, anon;
revoke all on function public.org_audit(uuid, int) from public, anon;
revoke all on function public.org_revert(uuid) from public, anon;
grant execute on function public.org_me(), public.org_claim(), public.org_redeem_code(text),
  public.org_create_from_project(jsonb), public.org_snapshot(uuid), public.org_move(uuid, uuid[], uuid, date, text),
  public.org_save_person(uuid, uuid, jsonb, bigint), public.org_save_department(uuid, uuid, text, jsonb, bigint),
  public.org_save_acting(uuid, uuid, uuid, uuid, date, date, text, text, text, bigint),
  public.org_invite(uuid, uuid, text, text), public.org_set_member(uuid, uuid, text, text),
  public.org_audit(uuid, int), public.org_revert(uuid) to authenticated;

-- Helpers are internal. Policies and the API call them as their owner.
revoke all on all functions in schema core from public, anon;
grant execute on function core.my_orgs(uuid), core.my_admin_orgs(uuid), core.readable_people(uuid),
  core.my_role(uuid, uuid), core.visible_people(uuid, uuid, date) to authenticated;

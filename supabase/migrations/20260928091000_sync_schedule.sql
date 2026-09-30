-- ════════════════════════════════════════════════════════════════════════════
-- Phase 2: published schedules (docs/ORG-LAYER-PLAN.md sections 2, 8, 10, 12)
--
-- A TL, manager or ops publishes a period of their project's rota to the org. Agents then read
-- their own published rows (Sync Me) and managers read everyone in their tree (Bridge). Drafts
-- never reach the server: they stay in the Sync project until published.
--
-- Sync-only tables live in schema `sync` (decision 7); who can see whom comes from `core`. Like
-- `core`, the schema is not exposed over REST: the app calls public.sync_* functions.
--
-- Times: the roster's clock (UK) is stored as start_local/end_local with tz 'Europe/London';
-- start_utc/end_utc are calculated on write. SA time is never stored (section 7).
-- POPIA: a row carries a status and, for leave, a type. Never a reason.
-- ════════════════════════════════════════════════════════════════════════════

create schema if not exists sync;
revoke all on schema sync from public;

-- One press of Publish: which period, how much changed, who, when.
create table sync.publishes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references core.orgs(id) on delete cascade,
  dept_id uuid references core.departments(id) on delete set null,
  period_from date not null,
  period_to date not null,
  people int not null,
  added int not null,
  removed int not null,
  changed int not null,
  unchanged int not null,
  note text check (note is null or length(note) <= 300),
  published_by uuid,
  published_by_person uuid references core.people(id) on delete set null,
  published_at timestamptz not null default now(),
  check (period_to >= period_from and period_to - period_from <= 62)
);
create index publishes_org_idx on sync.publishes (org_id, published_at desc);
create index publishes_dept_idx on sync.publishes (dept_id);
create index publishes_person_idx on sync.publishes (published_by_person);

-- A person's published day. One row per person and date; a date with no row has no published plan.
create table sync.schedule_rows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references core.orgs(id) on delete cascade,
  person_id uuid not null references core.people(id) on delete cascade,
  date date not null,
  status text not null check (status in ('shift', 'off', 'leave', 'training', 'holiday', 'other')),
  start_local time,
  end_local time,
  tz text not null default 'Europe/London',
  start_utc timestamptz,
  end_utc timestamptz,
  code text check (code is null or length(code) <= 40),
  leave_type text check (leave_type is null or leave_type in ('annual', 'sick', 'family', 'parental', 'unpaid', 'study', 'other')),
  -- Where the row came from in the Sync project: its own roster row, a blueprint, or the leader's
  -- rota it follows.
  source text not null default 'roster' check (source in ('roster', 'blueprint', 'leader', 'manual')),
  -- The publish that last changed this row (unchanged rows keep the older one).
  publish_id uuid references sync.publishes(id) on delete set null,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (person_id, date),
  check ((status = 'shift') = (start_local is not null)),
  check (end_local is null or start_local is not null)
);
create index schedule_rows_org_date_idx on sync.schedule_rows (org_id, date);
create index schedule_rows_publish_idx on sync.schedule_rows (publish_id);

-- Versions and UTC times. A shift that ends at or before its start runs into the next date.
create function sync.schedule_row_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.start_local is null then
    new.start_utc := null; new.end_utc := null;
  else
    new.start_utc := (new.date + new.start_local) at time zone new.tz;
    new.end_utc := case when new.end_local is null then null
      else ((new.date + (new.end_local <= new.start_local)::int) + new.end_local) at time zone new.tz end;
  end if;
  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger write before insert or update on sync.schedule_rows for each row execute function sync.schedule_row_write();

-- Only the functions below touch these tables.
alter table sync.publishes enable row level security;
alter table sync.schedule_rows enable row level security;

-- The rows a publish sends, parsed and normalised: anything but a shift carries no times.
create function sync.parse_rows(p_rows jsonb)
returns table (person_id uuid, date date, status text, start_local time, end_local time, code text, leave_type text, source text)
language sql immutable set search_path = '' as $$
  select r.person_id, r.date, r.status,
    case when r.status = 'shift' then nullif(r.start_local, '')::time end,
    case when r.status = 'shift' then nullif(r.end_local, '')::time end,
    nullif(btrim(r.code), ''),
    case when r.status = 'leave' then coalesce(nullif(r.leave_type, ''), 'annual') end,
    coalesce(nullif(r.source, ''), 'roster')
  from jsonb_to_recordset(case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end)
    as r(person_id uuid, date date, status text, start_local text, end_local text, code text, leave_type text, source text)
$$;

-- Who may publish or read schedules for whom: the user's data scope today, or on a given date
-- (the first day of the period being published). Agents' scope is themselves.
create function sync.scope(p_user uuid, p_org uuid, p_date date) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select core.visible_people(p_user, p_org, current_date)
  union
  select core.visible_people(p_user, p_org, p_date)
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- The API
-- Errors: not_signed_in, not_member, forbidden, bad_period, nothing_to_publish, forbidden_person,
-- bad_rows.
-- ════════════════════════════════════════════════════════════════════════════

-- Publishes a period for a set of people: afterwards their published rows in the period are
-- exactly p_rows. A person in p_people with no rows has their period cleared. With p_dry_run
-- (the default) nothing is written and the change preview comes back instead.
-- p_rows: [{ person_id, date, status, start_local 'HH:MM', end_local, code, leave_type, source }]
create function public.sync_publish_schedule(p_org uuid, p_from date, p_to date, p_people uuid[], p_rows jsonb,
  p_note text default null, p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_me uuid; v_pub uuid; v_summary jsonb; v_changes jsonb;
begin
  perform core.require_role(p_org, 2);
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then raise exception 'bad_period'; end if;
  if p_people is null or cardinality(p_people) = 0 then raise exception 'nothing_to_publish'; end if;
  if exists (select 1 from unnest(p_people) x where x not in (select sync.scope(v_uid, p_org, p_from))) then
    raise exception 'forbidden_person';
  end if;
  if exists (
    select 1 from sync.parse_rows(p_rows) i
    where i.person_id is null or i.date is null or not (i.person_id = any(p_people)) or i.date not between p_from and p_to
      or i.status is null or i.status not in ('shift', 'off', 'leave', 'training', 'holiday', 'other')
      or (i.status = 'shift' and i.start_local is null)
  ) or (select count(*) from sync.parse_rows(p_rows)) <> (select count(distinct (i.person_id, i.date)) from sync.parse_rows(p_rows) i) then
    raise exception 'bad_rows';
  end if;

  with cur as (
    select s.* from sync.schedule_rows s
    where s.org_id = p_org and s.person_id = any(p_people) and s.date between p_from and p_to
  ), inc as (
    select * from sync.parse_rows(p_rows)
  ), diff as (
    select coalesce(i.person_id, c.person_id) as person_id, coalesce(i.date, c.date) as date,
      case when c.id is null then 'added' when i.person_id is null then 'removed'
        when (i.status, i.start_local, i.end_local, i.code, i.leave_type, i.source)
          is distinct from (c.status, c.start_local, c.end_local, c.code, c.leave_type, c.source) then 'changed'
        else 'unchanged' end as kind,
      case when c.id is not null then jsonb_build_object('status', c.status, 'start', to_char(c.start_local, 'HH24:MI'),
        'end', to_char(c.end_local, 'HH24:MI'), 'code', c.code, 'leave_type', c.leave_type) end as before,
      case when i.person_id is not null then jsonb_build_object('status', i.status, 'start', to_char(i.start_local, 'HH24:MI'),
        'end', to_char(i.end_local, 'HH24:MI'), 'code', i.code, 'leave_type', i.leave_type) end as after
    from inc i full join cur c on c.person_id = i.person_id and c.date = i.date
  )
  select jsonb_build_object(
      'period_from', p_from, 'period_to', p_to, 'people', cardinality(p_people),
      'people_changed', (select count(distinct d.person_id) from diff d where d.kind <> 'unchanged'),
      'added', count(*) filter (where kind = 'added'), 'removed', count(*) filter (where kind = 'removed'),
      'changed', count(*) filter (where kind = 'changed'), 'unchanged', count(*) filter (where kind = 'unchanged')),
    coalesce(jsonb_agg(jsonb_build_object('person_id', person_id, 'date', date, 'kind', kind, 'before', before, 'after', after)
      order by person_id, date) filter (where kind <> 'unchanged'), '[]'::jsonb)
  into v_summary, v_changes
  from diff;

  if p_dry_run then
    return v_summary || jsonb_build_object('dry_run', true, 'changes', v_changes);
  end if;

  select m.person_id into v_me from core.org_members m where m.org_id = p_org and m.user_id = v_uid;
  insert into sync.publishes (org_id, dept_id, period_from, period_to, people, added, removed, changed, unchanged, note,
    published_by, published_by_person)
  values (p_org, (select p.dept_id from core.people p where p.id = v_me), p_from, p_to, cardinality(p_people),
    (v_summary ->> 'added')::int, (v_summary ->> 'removed')::int, (v_summary ->> 'changed')::int, (v_summary ->> 'unchanged')::int,
    nullif(btrim(p_note), ''), v_uid, v_me)
  returning id into v_pub;

  delete from sync.schedule_rows s
  where s.org_id = p_org and s.person_id = any(p_people) and s.date between p_from and p_to
    and not exists (select 1 from sync.parse_rows(p_rows) i where i.person_id = s.person_id and i.date = s.date);
  insert into sync.schedule_rows as s (org_id, person_id, date, status, start_local, end_local, code, leave_type, source, publish_id)
  select p_org, i.person_id, i.date, i.status, i.start_local, i.end_local, i.code, i.leave_type, i.source, v_pub
  from sync.parse_rows(p_rows) i
  on conflict (person_id, date) do update
    set status = excluded.status, start_local = excluded.start_local, end_local = excluded.end_local, code = excluded.code,
      leave_type = excluded.leave_type, source = excluded.source, publish_id = excluded.publish_id
    where (s.status, s.start_local, s.end_local, s.code, s.leave_type, s.source)
      is distinct from (excluded.status, excluded.start_local, excluded.end_local, excluded.code, excluded.leave_type, excluded.source);

  return v_summary || jsonb_build_object('dry_run', false, 'publish_id', v_pub, 'changes', v_changes);
end $$;

-- One published row as the app reads it.
create function sync.row_json(s sync.schedule_rows) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('person_id', s.person_id, 'date', s.date, 'status', s.status,
    'start', to_char(s.start_local, 'HH24:MI'), 'end', to_char(s.end_local, 'HH24:MI'), 'tz', s.tz,
    'start_utc', s.start_utc, 'end_utc', s.end_utc, 'code', s.code, 'leave_type', s.leave_type,
    'source', s.source, 'publish_id', s.publish_id, 'version', s.version)
$$;

-- The publishes behind a set of rows, newest first, with who published them.
create function sync.publishes_json(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'period_from', b.period_from, 'period_to', b.period_to,
      'published_at', b.published_at, 'by', p.full_name, 'people', b.people, 'added', b.added, 'removed', b.removed,
      'changed', b.changed) order by b.published_at desc), '[]'::jsonb)
  from sync.publishes b left join core.people p on p.id = b.published_by_person
  where b.id = any(p_ids)
$$;

-- Published rows for everyone in the user's scope (an agent: themselves), between two dates.
create function public.sync_schedule(p_org uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_rows jsonb; v_pubs uuid[];
begin
  perform core.require_role(p_org, 1);
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 92 then raise exception 'bad_period'; end if;
  select coalesce(jsonb_agg(sync.row_json(s) order by s.person_id, s.date), '[]'::jsonb),
    array_remove(array_agg(distinct s.publish_id), null)
  into v_rows, v_pubs
  from sync.schedule_rows s
  where s.org_id = p_org and s.date between p_from and p_to
    and s.person_id in (select sync.scope(v_uid, p_org, p_from));
  return jsonb_build_object('rows', v_rows, 'publishes', sync.publishes_json(v_pubs),
    'latest', (select sync.publishes_json(array[b.id]) -> 0 from sync.publishes b
      where b.org_id = p_org and b.period_from <= p_to and b.period_to >= p_from
        and (core.role_rank(core.my_role(v_uid, p_org)) >= 3
          or b.published_by_person in (select sync.scope(v_uid, p_org, p_from))
          or exists (select 1 from sync.schedule_rows s where s.publish_id = b.id and s.person_id in (select sync.scope(v_uid, p_org, p_from))))
      order by b.published_at desc limit 1));
end $$;

-- Sync Me: the signed-in person's own published rows, who they report to today (acting cover
-- included) and their org. p_today is the phone's date, so "today" is the agent's today.
create function public.sync_me(p_from date, p_to date, p_today date default current_date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); m core.org_members; v_person core.people; v_leader uuid; v_acting core.acting_assignments;
  v_rows jsonb; v_pubs uuid[];
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 92 then raise exception 'bad_period'; end if;
  select * into m from core.org_members x where x.user_id = v_uid and x.status = 'active' and x.person_id is not null
  order by x.created_at limit 1;
  if not found then return jsonb_build_object('member', false); end if;
  select * into v_person from core.people p where p.id = m.person_id;
  select l.reports_to_id into v_leader from core.reporting_lines l
  where l.person_id = m.person_id and l.kind = 'primary' and l.effective_from <= p_today
    and (l.effective_to is null or l.effective_to >= p_today)
  order by l.effective_from desc limit 1;
  if v_leader is not null then
    select * into v_acting from core.acting_assignments a
    where a.for_person_id = v_leader and a.status = 'active' and a.starts <= p_today and (a.ends is null or a.ends >= p_today)
    order by a.starts desc limit 1;
  end if;
  select coalesce(jsonb_agg(sync.row_json(s) order by s.date), '[]'::jsonb), array_remove(array_agg(distinct s.publish_id), null)
  into v_rows, v_pubs
  from sync.schedule_rows s where s.person_id = m.person_id and s.date between p_from and p_to;
  return jsonb_build_object(
    'member', true,
    'org', (select jsonb_build_object('id', o.id, 'name', o.name) from core.orgs o where o.id = m.org_id),
    'me', jsonb_build_object('person_id', v_person.id, 'full_name', v_person.full_name, 'role_title', v_person.role_title,
      'team_name', v_person.team_name, 'app_role', m.app_role),
    'leader', case when v_leader is null then null else jsonb_build_object(
      'name', (select p.full_name from core.people p where p.id = coalesce(v_acting.person_id, v_leader)),
      'acting', v_acting.id is not null,
      'acting_role', v_acting.acting_role,
      'for', case when v_acting.id is not null then (select p.full_name from core.people p where p.id = v_leader) end,
      'until', v_acting.ends) end,
    'rows', v_rows,
    'publishes', sync.publishes_json(v_pubs));
end $$;

revoke all on function sync.scope(uuid, uuid, date) from public;
revoke all on function sync.publishes_json(uuid[]) from public;
revoke all on function public.sync_publish_schedule(uuid, date, date, uuid[], jsonb, text, boolean) from public, anon;
revoke all on function public.sync_schedule(uuid, date, date) from public, anon;
revoke all on function public.sync_me(date, date, date) from public, anon;
grant execute on function public.sync_publish_schedule(uuid, date, date, uuid[], jsonb, text, boolean),
  public.sync_schedule(uuid, date, date), public.sync_me(date, date, date) to authenticated;

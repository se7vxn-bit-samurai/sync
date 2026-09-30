-- Invite codes are 48-bit and single-use, but nothing limited guesses. Each signed-in account now
-- gets 10 tries per 15 minutes. A wrong code has to be *recorded*, so org_redeem_code no longer
-- raises for it (a raise would roll the record back): it returns {"error": "invalid_code"}.

create table core.code_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  at timestamptz not null default now(),
  ok boolean not null
);
create index code_attempts_user_idx on core.code_attempts (user_id, at desc);
alter table core.code_attempts enable row level security;

create or replace function public.org_redeem_code(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); r core.invites;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if (select count(*) from core.code_attempts a where a.user_id = v_uid and not a.ok and a.at > now() - interval '15 minutes') >= 10 then
    raise exception 'too_many_attempts';
  end if;
  select * into r from core.invites i
  where i.code_hash = encode(sha256(convert_to(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8')), 'hex')
    and i.accepted_at is null and i.expires_at > now();
  if not found then
    insert into core.code_attempts (user_id, ok) values (v_uid, false);
    return jsonb_build_object('error', 'invalid_code');
  end if;
  if exists (select 1 from core.org_members m where m.org_id = r.org_id and m.user_id = v_uid) then raise exception 'already_member'; end if;
  if r.person_id is not null and exists (select 1 from core.org_members m where m.org_id = r.org_id and m.person_id = r.person_id) then
    raise exception 'already_member';
  end if;
  insert into core.code_attempts (user_id, ok) values (v_uid, true);
  insert into core.org_members (org_id, user_id, person_id, app_role) values (r.org_id, v_uid, r.person_id, r.app_role);
  update core.invites set accepted_by = v_uid, accepted_at = now() where id = r.id;
  return public.org_me();
end $$;
revoke all on function public.org_redeem_code(text) from public, anon;
grant execute on function public.org_redeem_code(text) to authenticated;

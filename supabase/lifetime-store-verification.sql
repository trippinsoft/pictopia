-- Store identities are platform-scoped hashes, not Pictopia user accounts.
create table pictopia_rewards.lifetime_store_identities (
  subject text primary key check (subject ~ '^(ios|android):[a-f0-9]{64}$'),
  first_paid_at timestamptz not null,
  paid_proof_id text not null,
  awarded_at timestamptz
);
create table pictopia_rewards.lifetime_store_aliases (
  alias text primary key check (alias ~ '^(ios|android):[a-f0-9]{64}$'),
  subject text not null references pictopia_rewards.lifetime_store_identities(subject)
);
create table pictopia_rewards.lifetime_store_bindings (
  installation text primary key references pictopia_rewards.lifetime_members(installation),
  subject text not null references pictopia_rewards.lifetime_store_identities(subject)
);
create table pictopia_rewards.lifetime_release_gate (
  singleton boolean primary key default true check(singleton),
  awarding_enabled boolean not null default false
);
insert into pictopia_rewards.lifetime_release_gate values(true,false);
alter table pictopia_rewards.lifetime_store_identities enable row level security;
alter table pictopia_rewards.lifetime_store_aliases enable row level security;
alter table pictopia_rewards.lifetime_store_bindings enable row level security;
alter table pictopia_rewards.lifetime_release_gate enable row level security;
revoke all on pictopia_rewards.lifetime_store_identities,pictopia_rewards.lifetime_store_aliases,pictopia_rewards.lifetime_store_bindings,pictopia_rewards.lifetime_release_gate from public,anon,authenticated;
create index lifetime_bindings_subject on pictopia_rewards.lifetime_store_bindings(subject);
create index lifetime_aliases_subject on pictopia_rewards.lifetime_store_aliases(subject);

-- Inputs come ONLY from the Edge Function after verification with the stores.
create function public.pictopia_lifetime_bind_store_v1(p_installation text,p_subject text,p_aliases text[],p_paid_at bigint,p_proof_id text)
returns void language plpgsql security definer set search_path='' as $$
declare canonical text; existing text; earliest timestamptz; alias_key text;
begin
  if p_installation is null or p_subject is null or p_paid_at is null or p_proof_id is null or
    p_installation !~ '^[a-f0-9]{64}$' or p_subject !~ '^(ios|android):[a-f0-9]{64}$' or
    p_paid_at<=0 or to_timestamp(p_paid_at/1000.0)>now() or array_length(p_aliases,1)>8 or
    array_length(p_aliases,1) is null or not (p_subject=any(p_aliases)) or
    p_proof_id !~ '^(ios|android):[a-f0-9]{64}$' or split_part(p_proof_id,':',1)<>split_part(p_subject,':',1) then raise exception 'Invalid verified payment'; end if;
  -- Binding is rare (purchase/restore), so one lock gives simple, deterministic alias merging.
  perform pg_advisory_xact_lock(319926,1001);
  foreach alias_key in array p_aliases loop
    if alias_key is null or alias_key !~ '^(ios|android):[a-f0-9]{64}$' or split_part(alias_key,':',1)<>split_part(p_subject,':',1) then raise exception 'Cross-platform identity forbidden'; end if;
    select subject into existing from pictopia_rewards.lifetime_store_aliases where alias=alias_key;
    if existing is not null then
      if canonical is not null and canonical<>existing then raise exception 'Conflicting store identities'; end if;
      canonical:=existing;
    end if;
  end loop;
  canonical:=coalesce(canonical,p_subject);
  select subject into existing from pictopia_rewards.lifetime_store_bindings where installation=p_installation;
  if existing is not null and existing<>canonical then raise exception 'Installation already belongs to another store identity'; end if;
  earliest:=to_timestamp(p_paid_at/1000.0);
  insert into pictopia_rewards.lifetime_store_identities as i(subject,first_paid_at,paid_proof_id)
    values(canonical,earliest,p_proof_id) on conflict(subject) do update
    set first_paid_at=least(i.first_paid_at,excluded.first_paid_at);
  select first_paid_at into earliest from pictopia_rewards.lifetime_store_identities where subject=canonical;
  foreach alias_key in array p_aliases loop
    insert into pictopia_rewards.lifetime_store_aliases values(alias_key,canonical) on conflict(alias) do nothing;
  end loop;
  insert into pictopia_rewards.lifetime_members as m(installation,first_paid_at,paid_proof_id)
    values(p_installation,earliest,'binding:'||canonical||':'||p_installation)
    on conflict(installation) do update set first_paid_at=least(m.first_paid_at,excluded.first_paid_at);
  insert into pictopia_rewards.lifetime_store_bindings values(p_installation,canonical) on conflict(installation) do nothing;
end $$;
revoke all on function public.pictopia_lifetime_bind_store_v1(text,text,text[],bigint,text) from public,anon,authenticated;
grant execute on function public.pictopia_lifetime_bind_store_v1(text,text,text[],bigint,text) to service_role;

-- One verified store identity keeps its award when the subscription expires or the app is reinstalled.
create or replace function public.pictopia_lifetime_award_v1(p_installation text,p_event text)
returns boolean language plpgsql security definer set search_path='' as $$
declare paid timestamptz; store_subject text;
begin
  if not exists(select 1 from pictopia_rewards.lifetime_release_gate where singleton and awarding_enabled) then return false; end if;
  select b.subject into store_subject from pictopia_rewards.lifetime_store_bindings b where b.installation=p_installation;
  if store_subject is null then return false; end if;
  select first_paid_at into paid from pictopia_rewards.lifetime_store_identities where subject=store_subject for update;
  if paid is null then return false; end if;
  if exists(select 1 from pictopia_rewards.lifetime_store_identities where subject=store_subject and awarded_at is not null) then return true; end if;
  insert into pictopia_rewards.lifetime_awards(installation,completion_event,awarded_at)
  select c.installation,c.event_id,c.completed_at from pictopia_rewards.lifetime_completions c
  where c.installation=p_installation and c.event_id=p_event and paid<c.completed_at
    and c.distinct_photos>=10000 and c.remaining=0 and c.full_access and c.scan_complete
    and c.scan_skipped=0 and c.library_reliable and c.completed_at<=now()
  on conflict(installation) do nothing;
  update pictopia_rewards.lifetime_store_identities i set awarded_at=a.awarded_at
    from pictopia_rewards.lifetime_awards a where a.installation=p_installation and i.subject=store_subject and i.awarded_at is null;
  return exists(select 1 from pictopia_rewards.lifetime_store_identities where subject=store_subject and awarded_at is not null);
end $$;
revoke all on function public.pictopia_lifetime_award_v1(text,text) from public,anon,authenticated;
grant execute on function public.pictopia_lifetime_award_v1(text,text) to service_role;

create or replace function public.pictopia_lifetime_status_v1(p_installation text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; attempts integer;
begin
  if p_installation !~ '^[a-f0-9]{64}$' then raise exception 'Invalid installation'; end if;
  insert into pictopia_rewards.rate_limits(subject,window_start,attempts)
    values('lifetime:'||p_installation,date_trunc('hour',now()),1)
    on conflict(subject) do update set attempts=case when pictopia_rewards.rate_limits.window_start=excluded.window_start then pictopia_rewards.rate_limits.attempts+1 else 1 end,window_start=excluded.window_start
    returning rate_limits.attempts into attempts;
  if attempts>120 then return jsonb_build_object('error','rate_limit'); end if;
  select jsonb_build_object('version',1,'entitlement','lifetime_plus','installation',m.installation,
    'firstPaidAt',floor(extract(epoch from m.first_paid_at)*1000),
    'awardedAt',case when i.awarded_at is null then null else floor(extract(epoch from i.awarded_at)*1000) end,
    'issuedAt',floor(extract(epoch from now())*1000)) into result
  from pictopia_rewards.lifetime_members m join pictopia_rewards.lifetime_store_bindings b using(installation)
  join pictopia_rewards.lifetime_store_identities i on i.subject=b.subject where m.installation=p_installation;
  return result;
end $$;
revoke all on function public.pictopia_lifetime_status_v1(text) from public,anon,authenticated;
grant execute on function public.pictopia_lifetime_status_v1(text) to service_role;

create function public.pictopia_lifetime_payment_rate_v1(p_installation text)
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer; subject_key text; allowed boolean:=true;
begin
  if p_installation !~ '^[a-f0-9]{64}$' then return false; end if;
  foreach subject_key in array array['lifetime-payment:global','lifetime-payment:'||p_installation] loop
    insert into pictopia_rewards.rate_limits(subject,window_start,attempts) values(subject_key,date_trunc('hour',now()),1)
    on conflict(subject) do update set attempts=case when pictopia_rewards.rate_limits.window_start=excluded.window_start then pictopia_rewards.rate_limits.attempts+1 else 1 end,window_start=excluded.window_start
    returning rate_limits.attempts into n;
    if n>(case when subject_key='lifetime-payment:global' then 1000 else 12 end) then allowed:=false; end if;
  end loop;
  return allowed;
end $$;
revoke all on function public.pictopia_lifetime_payment_rate_v1(text) from public,anon,authenticated;
grant execute on function public.pictopia_lifetime_payment_rate_v1(text) to service_role;

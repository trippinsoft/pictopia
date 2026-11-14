-- Trusted verifier contract. Never call evidence ingestion with app-supplied proof.
create table pictopia_rewards.lifetime_members (
  installation text primary key check (installation ~ '^[a-f0-9]{64}$'),
  first_paid_at timestamptz not null check (first_paid_at > '1970-01-01'::timestamptz),
  paid_proof_id text unique not null check (length(paid_proof_id) > 0)
);
create table pictopia_rewards.lifetime_completions (
  event_id text primary key,
  installation text not null references pictopia_rewards.lifetime_members(installation),
  completed_at timestamptz not null,
  distinct_photos bigint not null check (distinct_photos >= 10000),
  remaining bigint not null check (remaining = 0),
  full_access boolean not null check (full_access),
  scan_complete boolean not null check (scan_complete),
  scan_skipped bigint not null check (scan_skipped = 0),
  library_reliable boolean not null check (library_reliable),
  verifier_version text not null check (length(verifier_version) > 0)
);
create table pictopia_rewards.lifetime_awards (
  installation text primary key references pictopia_rewards.lifetime_members(installation),
  entitlement text not null default 'lifetime_plus' check (entitlement = 'lifetime_plus'),
  completion_event text unique not null references pictopia_rewards.lifetime_completions(event_id),
  awarded_at timestamptz not null
);
alter table pictopia_rewards.lifetime_members enable row level security;
alter table pictopia_rewards.lifetime_completions enable row level security;
alter table pictopia_rewards.lifetime_awards enable row level security;
revoke all on pictopia_rewards.lifetime_members, pictopia_rewards.lifetime_completions, pictopia_rewards.lifetime_awards from public, anon, authenticated;

-- Called ONLY by a future trusted completion verifier, after persisting its proof.
-- Serializes against this member, so replay/concurrent events cannot create two awards.
create function public.pictopia_lifetime_award_v1(p_installation text, p_event text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare paid timestamptz;
begin
  select first_paid_at into paid from pictopia_rewards.lifetime_members where installation=p_installation for update;
  if paid is null then return false; end if;
  insert into pictopia_rewards.lifetime_awards(installation, completion_event, awarded_at)
  select c.installation,c.event_id,c.completed_at from pictopia_rewards.lifetime_completions c
  where c.installation=p_installation and c.event_id=p_event and paid<c.completed_at
    and c.distinct_photos>=10000 and c.remaining=0 and c.full_access and c.scan_complete
    and c.scan_skipped=0 and c.library_reliable and c.completed_at<=now()
  on conflict (installation) do nothing;
  return exists(select 1 from pictopia_rewards.lifetime_awards where installation=p_installation);
end $$;
revoke all on function public.pictopia_lifetime_award_v1(text,text) from public,anon,authenticated;
grant execute on function public.pictopia_lifetime_award_v1(text,text) to service_role;

-- Capability-authenticated Edge Function reads only; clients cannot call this RPC.
create function public.pictopia_lifetime_status_v1(p_installation text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; attempts integer;
begin
  if p_installation !~ '^[a-f0-9]{64}$' then raise exception 'Invalid installation'; end if;
  insert into pictopia_rewards.rate_limits(subject,window_start,attempts)
    values ('lifetime:'||p_installation,date_trunc('hour',now()),1)
    on conflict (subject) do update set
      attempts=case when pictopia_rewards.rate_limits.window_start=excluded.window_start then pictopia_rewards.rate_limits.attempts+1 else 1 end,
      window_start=excluded.window_start
    returning rate_limits.attempts into attempts;
  if attempts>120 then return jsonb_build_object('error','rate_limit'); end if;
  select jsonb_build_object('version',1,'entitlement','lifetime_plus','installation',m.installation,
    'firstPaidAt',floor(extract(epoch from m.first_paid_at)*1000),
    'awardedAt',case when a.awarded_at is null then null else floor(extract(epoch from a.awarded_at)*1000) end,
    'issuedAt',floor(extract(epoch from now())*1000)) into result
  from pictopia_rewards.lifetime_members m left join pictopia_rewards.lifetime_awards a using(installation)
  where m.installation=p_installation;
  return result;
end $$;
revoke all on function public.pictopia_lifetime_status_v1(text) from public,anon,authenticated;
grant execute on function public.pictopia_lifetime_status_v1(text) to service_role;
-- The future trusted verifier writes one completion proof; insertion atomically awards it.
create function pictopia_rewards.on_lifetime_completion_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform public.pictopia_lifetime_award_v1(new.installation,new.event_id);
  return new;
end $$;
revoke all on function pictopia_rewards.on_lifetime_completion_v1() from public,anon,authenticated;
create trigger lifetime_completion_award after insert on pictopia_rewards.lifetime_completions
for each row execute function pictopia_rewards.on_lifetime_completion_v1();

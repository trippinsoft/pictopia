-- Current paid periods replace historical-payment eligibility. Existing awards/identities stay intact.
alter table pictopia_rewards.lifetime_members add column paid_period_start timestamptz, add column paid_until timestamptz, add column subscription_checked_at timestamptz;

create function public.pictopia_lifetime_bind_current_v1(p_installation text,p_subject text,p_aliases text[],p_paid_at bigint,p_proof_id text,p_paid_until bigint)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_paid_until is null or p_paid_until<0 or (p_paid_until>0 and p_paid_until<=p_paid_at) then raise exception 'Invalid paid period'; end if;
  -- Keep the established same-platform restore binding; its legacy first-paid field is not eligibility.
  perform public.pictopia_lifetime_bind_store_v1(p_installation,p_subject,p_aliases,p_paid_at,p_proof_id);
  update pictopia_rewards.lifetime_members set paid_period_start=to_timestamp(p_paid_at/1000.0),
    paid_until=case when p_paid_until=0 then null else to_timestamp(p_paid_until/1000.0) end,
    subscription_checked_at=clock_timestamp() where installation=p_installation;
end $$;
create function public.pictopia_lifetime_clear_current_v1(p_installation text)
returns void language sql security definer set search_path='' as $$
  update pictopia_rewards.lifetime_members set paid_until=null, subscription_checked_at=clock_timestamp() where installation=p_installation;
$$;

create or replace function public.pictopia_lifetime_award_v1(p_installation text,p_event text)
returns boolean language plpgsql security definer set search_path='' as $$
declare member pictopia_rewards.lifetime_members%rowtype; store_subject text;
begin
  select * into member from pictopia_rewards.lifetime_members where installation=p_installation for update;
  select subject into store_subject from pictopia_rewards.lifetime_store_bindings where installation=p_installation;
  if store_subject is null then return false; end if;
  perform 1 from pictopia_rewards.lifetime_store_identities where subject=store_subject for update;
  if exists(select 1 from pictopia_rewards.lifetime_store_identities where subject=store_subject and awarded_at is not null) then return true; end if;
  if not exists(select 1 from pictopia_rewards.lifetime_release_gate where singleton and awarding_enabled) then return false; end if;
  if member.paid_until is null or member.paid_until<=clock_timestamp() or member.subscription_checked_at<clock_timestamp()-interval '5 minutes' then return false; end if;
  insert into pictopia_rewards.lifetime_awards(installation,completion_event,awarded_at)
    select c.installation,c.event_id,clock_timestamp() from pictopia_rewards.lifetime_completions c
    where c.installation=p_installation and c.event_id=p_event
      and member.paid_period_start<=c.completed_at and member.paid_until>c.completed_at
      and c.completed_at<=clock_timestamp() and c.completed_at>=clock_timestamp()-interval '5 minutes'
      and c.distinct_photos>=10000 and c.remaining=0 and c.full_access and c.scan_complete and c.scan_skipped=0 and c.library_reliable
    on conflict(installation) do nothing;
  update pictopia_rewards.lifetime_store_identities i set awarded_at=a.awarded_at
    from pictopia_rewards.lifetime_awards a where a.installation=p_installation and i.subject=store_subject and i.awarded_at is null;
  return exists(select 1 from pictopia_rewards.lifetime_store_identities where subject=store_subject and awarded_at is not null);
end $$;

-- Edge Function supplies only the passing local aggregate and re-verifies the subscription first.
create function public.pictopia_lifetime_complete_v1(p_installation text,p_checked_at bigint,p_distinct_photos bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare event_key text; checked timestamptz;
begin
  checked:=to_timestamp(p_checked_at/1000.0);
  if p_checked_at is null or p_distinct_photos is null or p_distinct_photos<10000 or checked>clock_timestamp() or checked<clock_timestamp()-interval '5 minutes' then return false; end if;
  event_key:='local-v1:'||p_installation||':'||p_checked_at;
  -- Membership row lock serializes concurrent eligibility changes and completion insertion.
  perform 1 from pictopia_rewards.lifetime_members where installation=p_installation for update;
  if not found then return false; end if;
  insert into pictopia_rewards.lifetime_completions values(event_key,p_installation,checked,p_distinct_photos,0,true,true,0,true,'local-consistency-v1') on conflict(event_id) do nothing;
  return public.pictopia_lifetime_award_v1(p_installation,event_key);
end $$;

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
    'paidUntil',case when m.paid_until>clock_timestamp() and m.subscription_checked_at>clock_timestamp()-interval '15 minutes' then floor(extract(epoch from least(m.paid_until,m.subscription_checked_at+interval '15 minutes'))*1000) else null end,
    'awardedAt',case when i.awarded_at is null then null else floor(extract(epoch from i.awarded_at)*1000) end,
    'issuedAt',floor(extract(epoch from clock_timestamp())*1000)) into result
    from pictopia_rewards.lifetime_members m join pictopia_rewards.lifetime_store_bindings b using(installation)
    join pictopia_rewards.lifetime_store_identities i on i.subject=b.subject where m.installation=p_installation;
  return result;
end $$;
revoke all on function public.pictopia_lifetime_bind_current_v1(text,text,text[],bigint,text,bigint), public.pictopia_lifetime_clear_current_v1(text), public.pictopia_lifetime_complete_v1(text,bigint,bigint) from public,anon,authenticated;
grant execute on function public.pictopia_lifetime_bind_current_v1(text,text,text[],bigint,text,bigint), public.pictopia_lifetime_clear_current_v1(text), public.pictopia_lifetime_complete_v1(text,bigint,bigint) to service_role;

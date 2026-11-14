begin;
do $$
declare owner text:=repeat('a',64); other text:=repeat('b',64); restored text:=repeat('c',64);
  subject_key text:='ios:'||repeat('a',64); other_subject text:='android:'||repeat('b',64);
  paid bigint:=floor(extract(epoch from clock_timestamp()-interval '1 hour')*1000)::bigint;
  expires bigint:=floor(extract(epoch from clock_timestamp()+interval '1 hour')*1000)::bigint;
  checked bigint:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
  status jsonb;
begin
  if has_function_privilege('anon','public.pictopia_lifetime_complete_v1(text,bigint,bigint)','execute') or
    has_function_privilege('authenticated','public.pictopia_lifetime_bind_current_v1(text,text,text[],bigint,text,bigint)','execute') or
    has_table_privilege('anon','pictopia_rewards.lifetime_release_gate','update') then raise exception 'Public lifetime access'; end if;
  if exists(select 1 from pictopia_rewards.lifetime_release_gate where awarding_enabled) then raise exception 'Live awards already enabled'; end if;
  perform public.pictopia_lifetime_bind_current_v1(owner,subject_key,array[subject_key],paid,'ios:'||repeat('1',64),expires);
  perform public.pictopia_lifetime_bind_current_v1(other,other_subject,array[other_subject],paid,'android:'||repeat('2',64),0);
  if (public.pictopia_lifetime_status_v1(other)->>'paidUntil') is not null then raise exception 'Trial/expired identity eligible'; end if;
  if not (public.pictopia_lifetime_status_v1(owner)->>'paidUntil')::bigint>checked then raise exception 'Active paid member hidden'; end if;
  if public.pictopia_lifetime_complete_v1(owner,checked,10000) then raise exception 'Disabled gate awarded'; end if;
  update pictopia_rewards.lifetime_release_gate set awarding_enabled=true;
  if public.pictopia_lifetime_complete_v1(owner,checked,9999) then raise exception 'Below threshold awarded'; end if;
  if public.pictopia_lifetime_complete_v1(owner,checked-300001,10000) then raise exception 'Stale completion awarded'; end if;
  if public.pictopia_lifetime_complete_v1(owner,checked+86400000,10000) then raise exception 'Future completion awarded'; end if;
  if public.pictopia_lifetime_complete_v1(other,checked,10000) then raise exception 'Trial/expired membership awarded'; end if;
  -- Subscription begins after this completion: must revalidate local completion later.
  update pictopia_rewards.lifetime_members set paid_until=to_timestamp(expires/1000.0),paid_period_start=clock_timestamp(),subscription_checked_at=clock_timestamp() where installation=other;
  if public.pictopia_lifetime_complete_v1(other,checked,10000) then raise exception 'Payment after completion awarded'; end if;
  -- Expiration during a completion request cannot award.
  update pictopia_rewards.lifetime_members set paid_until=clock_timestamp()-interval '1 second',paid_period_start=to_timestamp(paid/1000.0) where installation=other;
  if public.pictopia_lifetime_complete_v1(other,checked,10000) then raise exception 'Expired during verification awarded'; end if;
  -- Cancellation retains a currently paid period, so no auto-renew flag is required.
  if not public.pictopia_lifetime_complete_v1(owner,checked,10000) then raise exception 'Current paid completion did not award'; end if;
  if not public.pictopia_lifetime_complete_v1(owner,checked,10000) then raise exception 'Retry lost award'; end if;
  if (select count(*) from pictopia_rewards.lifetime_awards where installation=owner)<>1 then raise exception 'Duplicate award'; end if;
  perform public.pictopia_lifetime_clear_current_v1(owner);
  status:=public.pictopia_lifetime_status_v1(owner);
  if status->>'paidUntil' is not null or status->>'awardedAt' is null then raise exception 'Cancellation/expiration revoked award'; end if;
  -- An expired store identity may restore its already-earned award on the same platform.
  perform public.pictopia_lifetime_bind_current_v1(restored,subject_key,array[subject_key],paid,'ios:'||repeat('1',64),0);
  if public.pictopia_lifetime_status_v1(restored)->>'awardedAt' is null then raise exception 'Restore lost award'; end if;
  if exists(select 1 from pictopia_rewards.lifetime_awards where installation=restored) then raise exception 'Restore minted another award'; end if;
  if public.pictopia_lifetime_status_v1(restored)->>'paidUntil' is not null then raise exception 'Restored expired subscription eligible'; end if;
end $$;
rollback;
select not exists(select 1 from pictopia_rewards.lifetime_release_gate where awarding_enabled) as awards_still_disabled,
  (select count(*) from pictopia_rewards.lifetime_awards) as live_awards,
  not exists(select 1 from pictopia_rewards.lifetime_completions where event_id like 'local-v1:'||repeat('a',64)||':%') as test_data_rolled_back;

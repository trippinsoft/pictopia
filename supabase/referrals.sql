-- Applied to the existing Pictopia project with apply_migration. No Auth users or media.
create schema if not exists pictopia_rewards;
revoke all on schema pictopia_rewards from public, anon, authenticated;
grant usage on schema pictopia_rewards to service_role;
create table pictopia_rewards.installations (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  code text not null unique check (code ~ '^[A-F0-9]{7}$'),
  earned bigint not null default 0 check (earned >= 0),
  redeemed_code text,
  created_at timestamptz not null default now()
);
create table pictopia_rewards.rate_limits (
  subject text primary key,
  window_start timestamptz not null,
  attempts integer not null
);
alter table pictopia_rewards.installations enable row level security;
alter table pictopia_rewards.rate_limits enable row level security;
revoke all on all tables in schema pictopia_rewards from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema pictopia_rewards to service_role;
-- Only the Edge Function's server role may call this transaction. No public EXECUTE.
create or replace function public.pictopia_referrals_v1(p_token_hash text, p_network_hash text, p_operation text, p_code text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  me pictopia_rewards.installations%rowtype;
  inviter pictopia_rewards.installations%rowtype;
  subject_key text;
  attempts integer;
  cap integer;
  fresh_code text;
  bucket timestamptz := date_trunc('hour', now());
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' or p_network_hash !~ '^[a-f0-9]{64}$' or p_operation not in ('sync','redeem') then
    return jsonb_build_object('error','Invalid request.');
  end if;
  -- A single short transaction lock gives deterministic ordering even for mutual referrals.
  perform pg_advisory_xact_lock(783021475112::bigint);
  delete from pictopia_rewards.rate_limits where window_start < now() - interval '2 hours';
  for subject_key, cap in select v.subject, v.cap from (values
    ('network:' || p_network_hash || ':' || p_operation, case when p_operation='redeem' then 50 else 300 end),
    ('install:' || p_token_hash || ':' || p_operation, case when p_operation='redeem' then 10 else 120 end)
  ) as v(subject,cap) loop
    insert into pictopia_rewards.rate_limits as r values(subject_key,bucket,1)
    on conflict(subject) do update set window_start=bucket, attempts=case when r.window_start=bucket then r.attempts+1 else 1 end
    returning r.attempts into attempts;
    if attempts > cap then return jsonb_build_object('error','Too many attempts. Try again in an hour.','rateLimited',true); end if;
  end loop;
  select * into me from pictopia_rewards.installations where token_hash=p_token_hash;
  if not found then
    -- Limit creation separately, including callers that rotate installation tokens.
    subject_key := 'register:' || p_network_hash;
    insert into pictopia_rewards.rate_limits as r values(subject_key,bucket,1)
    on conflict(subject) do update set window_start=bucket, attempts=case when r.window_start=bucket then r.attempts+1 else 1 end
    returning r.attempts into attempts;
    if attempts > 20 then return jsonb_build_object('error','Too many new installations. Try again in an hour.','rateLimited',true); end if;
    loop
      fresh_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,7));
      exit when not exists(select 1 from pictopia_rewards.installations where code=fresh_code);
    end loop;
    insert into pictopia_rewards.installations(token_hash,code) values(p_token_hash,fresh_code) returning * into me;
  end if;
  if p_operation='redeem' then
    if p_code is null or p_code !~ '^[A-F0-9]{7}$' then return jsonb_build_object('error','Enter a valid 7-character referral code.'); end if;
    select * into inviter from pictopia_rewards.installations where code=p_code;
    if not found then return jsonb_build_object('error','That code wasn’t found. Check it and try again.'); end if;
    if inviter.token_hash=me.token_hash then return jsonb_build_object('error','You can’t redeem your own code.'); end if;
    if me.redeemed_code is not null then
      if me.redeemed_code <> inviter.code then return jsonb_build_object('error','This installation has already redeemed a referral code.'); end if;
      -- Lost responses and retries return the committed result without awarding again.
    else
      update pictopia_rewards.installations set earned=earned+1000 where token_hash=inviter.token_hash;
      update pictopia_rewards.installations set earned=earned+1000, redeemed_code=inviter.code where token_hash=p_token_hash returning * into me;
    end if;
  end if;
  return jsonb_build_object('code',me.code,'earned',me.earned,'redeemed',me.redeemed_code is not null);
end;
$$;
revoke all on function public.pictopia_referrals_v1(text,text,text,text) from public, anon, authenticated;
grant execute on function public.pictopia_referrals_v1(text,text,text,text) to service_role;

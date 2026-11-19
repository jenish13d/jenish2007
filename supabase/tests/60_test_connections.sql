\set ON_ERROR_STOP on
begin;
insert into public.creator_platform_connections (creator_id, platform, platform_user_id, platform_login, display_name, access_token)
values ('11111111-1111-1111-1111-111111111111', 'twitch', 'tw-1', 'creator_a', 'Creator A', 'v1:x:y:z');

-- Creator A sees status without tokens.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.sl_my_connections() where platform = 'twitch' and connected;
  if n <> 1 then raise exception 'creator A should see twitch connection'; end if;
  begin
    perform access_token from public.creator_platform_connections;
    raise exception 'authenticated must not read connection tokens';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Creator B sees nothing of A.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.sl_my_connections() where platform = 'twitch';
  if n <> 0 then raise exception 'creator B must not see A''s connection'; end if;
end $$;

reset role;
-- Same Twitch account cannot bind to a second creator.
do $$
begin
  begin
    insert into public.creator_platform_connections (creator_id, platform, platform_user_id, access_token)
    values ('22222222-2222-2222-2222-222222222222', 'twitch', 'tw-1', 'v1:a:b:c');
    raise exception 'duplicate platform account should be rejected';
  exception when unique_violation then null;
  end;
end $$;

-- anon cannot call the status RPC.
set local role anon;
do $$
begin
  begin
    perform public.sl_my_connections();
    raise exception 'anon must not execute sl_my_connections';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
\echo 'connections tests passed'

-- Withdrawal gate and earnings summary.
begin;
update public.platform_settings set payouts_enabled = false where id;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$
declare j jsonb;
begin
  begin
    perform public.sl_request_payout(100000);
    raise exception 'payout request must fail while withdrawals are disabled';
  exception when feature_not_supported then null;
  end;
  j := public.sl_my_earnings_summary();
  if j is null or (j->>'payouts_enabled')::boolean then raise exception 'summary should report payouts disabled'; end if;
  if j ? 'viewer_user_id' then raise exception 'summary leaked viewer ids'; end if;
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    perform public.sl_my_earnings_summary();
    raise exception 'anon must not read earnings summary';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
\echo 'payout gate tests passed'

-- 0012: Twitch / Kick platform connections.
--
-- Tokens are AES-256-GCM encrypted by the application before they reach this
-- table, and the table grants nothing to anon/authenticated: only the
-- service-role server code reads or writes it. Creators see connection status
-- (never tokens) through sl_my_connections().
-- Idempotent and additive: no existing table or column is altered or dropped.

create table if not exists public.creator_platform_connections (
  creator_id        uuid not null references auth.users(id) on delete cascade,
  platform          text not null check (platform in ('twitch', 'kick')),
  platform_user_id  text not null,
  platform_login    text,
  display_name      text,
  avatar_url        text,
  access_token      text not null,
  refresh_token     text,
  expires_at        timestamptz,
  scopes            text[] not null default '{}',
  connected_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (creator_id, platform)
);

-- One platform account can be bound to only one StreamLounge creator.
create unique index if not exists creator_platform_connections_account_uq
  on public.creator_platform_connections (platform, platform_user_id);

alter table public.creator_platform_connections enable row level security;
revoke all on public.creator_platform_connections from anon, authenticated;
grant select, insert, update, delete on public.creator_platform_connections to service_role;

create or replace function public.sl_my_connections()
returns table (
  platform       text,
  connected      boolean,
  account_login  text,
  display_name   text,
  avatar_url     text,
  connected_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select 'youtube'::text,
         coalesce(p.youtube_connected, false),
         p.youtube_handle,
         p.youtube_channel_name,
         p.youtube_avatar_url,
         null::timestamptz
    from public.creator_profiles p
   where p.id = auth.uid()
  union all
  select c.platform, true, c.platform_login, c.display_name, c.avatar_url, c.connected_at
    from public.creator_platform_connections c
   where c.creator_id = auth.uid();
$$;

revoke all on function public.sl_my_connections() from public, anon;
grant execute on function public.sl_my_connections() to authenticated;

-- ---------------------------------------------------------------------------
-- Withdrawal gate. Off until Razorpay Route (or another licensed payout
-- provider) is approved for this account. Only the owner flips it, from the
-- Supabase SQL editor — deliberately not from the web admin panel:
--   update public.platform_settings set payouts_enabled = true where id;
-- ---------------------------------------------------------------------------
alter table public.platform_settings
  add column if not exists payouts_enabled boolean not null default false;
grant select (payouts_enabled) on public.platform_settings to anon, authenticated;

create or replace function public.sl_request_payout(p_amount_paise bigint)
returns public.payouts language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); b record; s public.platform_settings; r public.payouts;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = 'insufficient_privilege'; end if;
  perform pg_advisory_xact_lock(hashtextextended('payout:'||v_uid::text, 0));
  select * into s from public.platform_settings where id;
  if not s.payouts_enabled then
    raise exception 'withdrawals are not enabled yet' using errcode = 'feature_not_supported';
  end if;
  if p_amount_paise < s.min_payout_paise then raise exception 'below minimum payout' using errcode = 'check_violation'; end if;
  select * into b from public.sl_creator_balance(v_uid);
  if p_amount_paise > b.available_paise then raise exception 'insufficient available balance' using errcode = 'check_violation'; end if;
  insert into public.payouts (creator_id, amount_paise) values (v_uid, p_amount_paise) returning * into r;
  return r;
end $$;
revoke all on function public.sl_request_payout(bigint) from public, anon;
grant execute on function public.sl_request_payout(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Creator earnings summary (own data only). Supporters are identified by the
-- alias they chose; the real payer account is never returned.
-- ---------------------------------------------------------------------------
create or replace function public.sl_my_earnings_summary()
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as uid),
  pay as (
    select p.* from public.payments p, me where p.creator_id = me.uid
  ),
  st as (
    select count(*) filter (where s.last_seen - s.started_at >= interval '1 minute') as streams,
           coalesce(sum(extract(epoch from s.last_seen - s.started_at))
                    filter (where s.last_seen - s.started_at >= interval '1 minute'), 0)::bigint as seconds,
           coalesce(bool_or(s.last_seen > now() - interval '2 minutes'), false) as live_now
      from public.stream_sessions s, me where s.creator_id = me.uid
  )
  select case when (select uid from me) is null then null else jsonb_build_object(
    'superchats',       (select count(*) from pay where status <> 'refunded'),
    'supporters',       (select count(distinct coalesce(viewer_user_id::text, 'alias:'||lower(display_name))) from pay),
    'gross_paise',      (select coalesce(sum(amount_paise - refunded_paise), 0) from pay),
    'last_30d_paise',   (select coalesce(sum(creator_share_paise), 0) from pay where captured_at > now() - interval '30 days'),
    'streams',          (select streams from st),
    'stream_seconds',   (select seconds from st),
    'live_now',         (select live_now from st),
    'top_supporters',   coalesce((
        select jsonb_agg(t order by t.total_paise desc)
          from (select display_name, count(*) as superchats, sum(amount_paise - refunded_paise) as total_paise
                  from pay where status not in ('refunded', 'dispute_lost')
                 group by display_name order by 3 desc limit 10) t), '[]'::jsonb),
    'payouts_enabled',  (select payouts_enabled from public.platform_settings where id),
    'min_payout_paise', (select min_payout_paise from public.platform_settings where id)
  ) end
$$;
revoke all on function public.sl_my_earnings_summary() from public, anon;
grant execute on function public.sl_my_earnings_summary() to authenticated;

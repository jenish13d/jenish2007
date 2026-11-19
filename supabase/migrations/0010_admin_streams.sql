-- =============================================================================
-- 0010  Owner/admin provisioning, business analytics, stream sessions
-- =============================================================================
-- Admin access is never granted by signing up with a particular email. The
-- owner role is provisioned explicitly, by an operator running
-- sl_provision_owner() with the service role / SQL editor, and only for an
-- account whose email is already verified. The app additionally requires MFA
-- (AAL2) for every admin request.
--
-- Stream time: StreamLounge cannot see inside OBS/Streamlabs/StreamYard. A
-- "stream session" is the period the creator's overlay is open and polling,
-- recorded by heartbeat. Reported as "overlay online time", not as platform
-- broadcast time.
--
-- Safety: additive, idempotent.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sl_provision_owner(p_email text, p_operator text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid; v_confirmed timestamptz;
BEGIN
  SELECT id, email_confirmed_at INTO v_id, v_confirmed FROM auth.users WHERE lower(email) = lower(btrim(p_email));
  IF v_id IS NULL THEN RAISE EXCEPTION 'no account with that email'; END IF;
  IF v_confirmed IS NULL THEN RAISE EXCEPTION 'email not verified; verify the account before granting owner'; END IF;
  INSERT INTO public.admin_users (user_id, role, granted_by) VALUES (v_id, 'owner', p_operator)
  ON CONFLICT (user_id) DO UPDATE SET role = 'owner', revoked_at = NULL, granted_by = EXCLUDED.granted_by, granted_at = now();
  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, reason, after)
  VALUES (NULL, 'provision_owner', 'user', v_id::text, 'provisioned by '||p_operator, jsonb_build_object('role','owner'));
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.sl_provision_owner(text, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sl_is_admin(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role FROM public.admin_users WHERE user_id = p_user AND revoked_at IS NULL
$$;
REVOKE ALL ON FUNCTION public.sl_is_admin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sl_is_admin(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Stream sessions (overlay heartbeats)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stream_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  uuid NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  started_at  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now(),
  CHECK (last_seen >= started_at)
);
CREATE INDEX IF NOT EXISTS stream_sessions_creator_idx ON public.stream_sessions (creator_id, last_seen DESC);
ALTER TABLE public.stream_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stream_sessions FROM anon, authenticated;
DROP POLICY IF EXISTS stream_sessions_owner_select ON public.stream_sessions;
CREATE POLICY stream_sessions_owner_select ON public.stream_sessions FOR SELECT TO authenticated
  USING (creator_id = (SELECT auth.uid()));
GRANT SELECT ON public.stream_sessions TO authenticated;
GRANT ALL ON public.stream_sessions TO service_role;

-- Extends the open session, or starts a new one after a 5-minute gap.
CREATE OR REPLACE FUNCTION public.sl_overlay_heartbeat(p_creator_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.stream_sessions
   WHERE creator_id = p_creator_id AND last_seen > now() - interval '5 minutes'
   ORDER BY last_seen DESC LIMIT 1 FOR UPDATE;
  IF v_id IS NULL THEN
    INSERT INTO public.stream_sessions (creator_id) VALUES (p_creator_id);
  ELSE
    UPDATE public.stream_sessions SET last_seen = now() WHERE id = v_id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.sl_overlay_heartbeat(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sl_overlay_heartbeat(uuid) TO service_role;

-- Sessions shorter than a minute (a page reload, a test) are not streams.
CREATE OR REPLACE VIEW public.sl_stream_stats AS
SELECT creator_id,
       count(*) FILTER (WHERE last_seen - started_at >= interval '1 minute') AS streams,
       coalesce(sum(extract(epoch FROM last_seen - started_at)) FILTER (WHERE last_seen - started_at >= interval '1 minute'), 0)::bigint AS seconds,
       bool_or(last_seen > now() - interval '2 minutes') AS live_now
  FROM public.stream_sessions GROUP BY creator_id;
REVOKE ALL ON public.sl_stream_stats FROM anon, authenticated;
GRANT SELECT ON public.sl_stream_stats TO service_role;

-- ---------------------------------------------------------------------------
-- Admin analytics (service role only; the API checks admin + MFA first)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sl_admin_overview()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'creators_total',   (SELECT count(*) FROM public.creator_profiles),
    'creators_public',  (SELECT count(*) FROM public.creator_profiles WHERE public_page_enabled),
    'creators_active_30d', (SELECT count(DISTINCT creator_id) FROM public.payments WHERE captured_at > now() - interval '30 days'),
    'viewers_registered', (SELECT count(*) FROM auth.users u WHERE NOT EXISTS (
                             SELECT 1 FROM public.creator_profiles p WHERE p.id = u.id AND p.username IS NOT NULL)),
    'payers_signed_in', (SELECT count(DISTINCT viewer_user_id) FROM public.payments WHERE viewer_user_id IS NOT NULL),
    'superchats',       (SELECT count(*) FROM public.payments WHERE status NOT IN ('refunded')),
    'volume_paise',     (SELECT coalesce(sum(amount_paise),0) FROM public.payments),
    'refunds_paise',    (SELECT coalesce(sum(refunded_paise),0) FROM public.payments),
    'platform_revenue_paise', (SELECT coalesce(sum(amount_paise),0) FROM public.ledger_entries WHERE account = 'platform_revenue'),
    'gateway_fees_paise', (SELECT coalesce(sum(amount_paise),0) FROM public.ledger_entries WHERE account = 'gateway_fees'),
    'creator_earnings_paise', (SELECT coalesce(sum(amount_paise),0) FROM public.ledger_entries WHERE account = 'creator'),
    'payouts_pending_paise',  (SELECT coalesce(sum(amount_paise),0) FROM public.payouts WHERE status IN ('requested','approved','processing')),
    'payouts_completed_paise',(SELECT coalesce(sum(amount_paise),0) FROM public.payouts WHERE status = 'completed'),
    'payouts_failed_count',   (SELECT count(*) FROM public.payouts WHERE status = 'failed'),
    'disputes_open',    (SELECT count(*) FROM public.disputes WHERE status = 'open'),
    'live_now',         (SELECT count(*) FROM public.sl_stream_stats WHERE live_now),
    'stream_seconds',   (SELECT coalesce(sum(seconds),0) FROM public.sl_stream_stats),
    'growth', jsonb_build_object(
      'signups_1d',  (SELECT count(*) FROM auth.users WHERE created_at > now() - interval '1 day'),
      'signups_7d',  (SELECT count(*) FROM auth.users WHERE created_at > now() - interval '7 days'),
      'signups_30d', (SELECT count(*) FROM auth.users WHERE created_at > now() - interval '30 days'),
      'volume_1d_paise',  (SELECT coalesce(sum(amount_paise),0) FROM public.payments WHERE captured_at > now() - interval '1 day'),
      'volume_7d_paise',  (SELECT coalesce(sum(amount_paise),0) FROM public.payments WHERE captured_at > now() - interval '7 days'),
      'volume_30d_paise', (SELECT coalesce(sum(amount_paise),0) FROM public.payments WHERE captured_at > now() - interval '30 days')
    ),
    'webhook_failures', (SELECT count(*) FROM public.webhook_events WHERE processed_at IS NULL AND received_at < now() - interval '1 hour')
  )
$$;

CREATE OR REPLACE FUNCTION public.sl_admin_creators(p_search text, p_limit integer, p_offset integer)
RETURNS TABLE (
  creator_id uuid, username text, creator_name text, registered_at timestamptz, public_page boolean,
  youtube_connected boolean, streams bigint, stream_seconds bigint, superchats bigint,
  gross_paise bigint, creator_share_paise bigint, platform_share_paise bigint,
  pending_payout_paise bigint, paid_out_paise bigint, available_paise bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id, p.username, p.creator_name, p.created_at, p.public_page_enabled, p.youtube_connected,
         coalesce(s.streams,0), coalesce(s.seconds,0),
         (SELECT count(*) FROM public.payments x WHERE x.creator_id = p.id),
         (SELECT coalesce(sum(amount_paise),0) FROM public.payments x WHERE x.creator_id = p.id)::bigint,
         (SELECT coalesce(sum(amount_paise),0) FROM public.ledger_entries l WHERE l.creator_id = p.id AND l.account = 'creator')::bigint,
         (SELECT coalesce(sum(amount_paise),0) FROM public.ledger_entries l WHERE l.creator_id = p.id AND l.account = 'platform_revenue')::bigint,
         b.reserved_paise, b.paid_out_paise, b.available_paise
    FROM public.creator_profiles p
    LEFT JOIN public.sl_stream_stats s ON s.creator_id = p.id
    CROSS JOIN LATERAL public.sl_creator_balance(p.id) b
   WHERE p_search IS NULL OR p.username ILIKE '%'||replace(replace(p_search,'%','\%'),'_','\_')||'%'
                          OR p.creator_name ILIKE '%'||replace(replace(p_search,'%','\%'),'_','\_')||'%'
   ORDER BY p.created_at DESC
   LIMIT least(greatest(coalesce(p_limit,50),1),200) OFFSET greatest(coalesce(p_offset,0),0)
$$;

-- Owner-editable platform settings, with before/after audit and a reason.
CREATE OR REPLACE FUNCTION public.sl_admin_update_settings(p_admin uuid, p_changes jsonb, p_reason text)
RETURNS public.platform_settings LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE before_s public.platform_settings; after_s public.platform_settings; k text;
  allowed text[] := ARRAY['platform_fee_bps','gateway_fee_bearer','settlement_hold_days','min_payout_paise',
    'message_limit_default','message_limit_min','message_limit_max','points_per_rupee','points_per_redemption',
    'redemption_value_paise','points_enabled'];
BEGIN
  IF (SELECT role FROM public.admin_users WHERE user_id = p_admin AND revoked_at IS NULL) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'only the owner can change platform settings' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN RAISE EXCEPTION 'a reason of at least 10 characters is required'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_changes) LOOP
    IF NOT k = ANY (allowed) THEN RAISE EXCEPTION 'setting % cannot be changed here', k; END IF;
  END LOOP;
  SELECT * INTO before_s FROM public.platform_settings WHERE id FOR UPDATE;
  UPDATE public.platform_settings s SET
    platform_fee_bps       = coalesce((p_changes->>'platform_fee_bps')::int, s.platform_fee_bps),
    gateway_fee_bearer     = coalesce(p_changes->>'gateway_fee_bearer', s.gateway_fee_bearer),
    settlement_hold_days   = coalesce((p_changes->>'settlement_hold_days')::int, s.settlement_hold_days),
    min_payout_paise       = coalesce((p_changes->>'min_payout_paise')::bigint, s.min_payout_paise),
    message_limit_default  = coalesce((p_changes->>'message_limit_default')::int, s.message_limit_default),
    message_limit_min      = coalesce((p_changes->>'message_limit_min')::int, s.message_limit_min),
    message_limit_max      = coalesce((p_changes->>'message_limit_max')::int, s.message_limit_max),
    points_per_rupee       = coalesce((p_changes->>'points_per_rupee')::int, s.points_per_rupee),
    points_per_redemption  = coalesce((p_changes->>'points_per_redemption')::int, s.points_per_redemption),
    redemption_value_paise = coalesce((p_changes->>'redemption_value_paise')::bigint, s.redemption_value_paise),
    points_enabled         = coalesce((p_changes->>'points_enabled')::boolean, s.points_enabled),
    updated_at = now(), updated_by = p_admin
  WHERE id RETURNING * INTO after_s;
  IF after_s.message_limit_min > after_s.message_limit_default OR after_s.message_limit_default > after_s.message_limit_max THEN
    RAISE EXCEPTION 'message limits must satisfy min <= default <= max';
  END IF;
  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, reason, before, after)
  VALUES (p_admin, 'update_settings', 'platform_settings', 'singleton', p_reason, to_jsonb(before_s), to_jsonb(after_s));
  RETURN after_s;
END $$;

REVOKE ALL ON FUNCTION public.sl_admin_overview(), public.sl_admin_creators(text,integer,integer),
  public.sl_admin_update_settings(uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sl_admin_overview(), public.sl_admin_creators(text,integer,integer),
  public.sl_admin_update_settings(uuid,jsonb,text) TO service_role;

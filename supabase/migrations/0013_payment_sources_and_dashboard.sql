-- =============================================================================
-- 0013  Payment sources (8% QR / 0% external link), dashboard layout,
--       YouTube account connection retired
-- =============================================================================
-- REQUIRES OWNER APPROVAL BEFORE IT IS APPLIED TO PRODUCTION.
-- Section 1 changes the live platform fee from 10% to 8% for every payment
-- captured after the migration runs. Payments already recorded keep the rate
-- frozen on their own row (payments.platform_fee_bps); nothing historical is
-- rewritten.
--
-- Model
--   STREAMLOUNGE_QR          Collected by StreamLounge's Razorpay account (the
--                            on-screen QR and /c/<username> checkout). Recorded
--                            in `payments` and the append-only ledger with the
--                            QR platform fee (platform_settings.platform_fee_bps,
--                            8%). This is the only source the ledger accepts.
--   EXTERNAL_RAZORPAY_LINK   The creator's own Razorpay link. StreamLounge never
--                            holds the money, so it is NEVER credited to the
--                            creator ledger (that would make money we never
--                            received withdrawable) and never counted as
--                            platform revenue. It is recorded, if at all, in
--                            `external_payments` with platform_fee_paise = 0, and
--                            only when verified by a webhook signed with the
--                            creator's own Razorpay webhook secret.
--
-- The source is decided by which Razorpay account verified the payment, never
-- by anything a browser sends.
--
-- Safety: additive except for (a) the fee setting in section 1 and (b) the
-- replacement of sl_my_connections() without the YouTube row. No table or
-- column is dropped; YouTube token data is left in place, inaccessible, for a
-- separate approved clean-up.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. QR platform fee: 8%  (financial change — approval required)
-- ---------------------------------------------------------------------------
ALTER TABLE public.platform_settings ALTER COLUMN platform_fee_bps SET DEFAULT 800;
DO $$ BEGIN
  UPDATE public.platform_settings SET platform_fee_bps = 800, updated_at = now()
   WHERE id AND platform_fee_bps <> 800;
  IF FOUND THEN
    INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, reason, after)
    VALUES (NULL, 'platform_fee_change', 'platform_settings', 'singleton',
            'Migration 0013: StreamLounge QR platform fee set to 8% (creator share 92%)',
            jsonb_build_object('platform_fee_bps', 800));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Payment source on platform-collected payments
-- ---------------------------------------------------------------------------
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_source text NOT NULL DEFAULT 'STREAMLOUNGE_QR';
DO $$ BEGIN
  ALTER TABLE public.payments
    ADD CONSTRAINT payments_source_platform_collected CHECK (payment_source = 'STREAMLOUNGE_QR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON COLUMN public.payments.payment_source IS
  'Always STREAMLOUNGE_QR: only money collected by the platform account enters payments/ledger.';
GRANT SELECT (payment_source) ON public.payments TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. External Razorpay link (creator-owned) — display and optional verified log
-- ---------------------------------------------------------------------------
ALTER TABLE public.creator_preferences
  ADD COLUMN IF NOT EXISTS external_payment_url text
    CHECK (external_payment_url IS NULL OR (
      length(external_payment_url) <= 200 AND
      external_payment_url ~ '^https://(rzp\.io|razorpay\.me|pages\.razorpay\.com)/[A-Za-z0-9._~/@-]+$'
    ));
GRANT UPDATE (external_payment_url) ON public.creator_preferences TO authenticated;

CREATE TABLE IF NOT EXISTS public.external_payments (
  id                  text PRIMARY KEY CHECK (id ~ '^pay_[A-Za-z0-9]+$'),
  creator_id          uuid NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  payment_source      text NOT NULL DEFAULT 'EXTERNAL_RAZORPAY_LINK'
                      CHECK (payment_source = 'EXTERNAL_RAZORPAY_LINK'),
  amount_paise        bigint NOT NULL CHECK (amount_paise > 0),
  currency            text NOT NULL DEFAULT 'INR',
  platform_fee_paise  bigint NOT NULL DEFAULT 0 CHECK (platform_fee_paise = 0),
  gateway_fee_paise   bigint NOT NULL DEFAULT 0 CHECK (gateway_fee_paise >= 0),
  payer_label         text CHECK (length(payer_label) <= 40),
  status              text NOT NULL DEFAULT 'captured' CHECK (status IN ('captured','refunded')),
  verified_via        text NOT NULL CHECK (verified_via IN ('creator_webhook')),
  captured_at         timestamptz NOT NULL,
  recorded_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS external_payments_creator_idx ON public.external_payments (creator_id, captured_at DESC);
ALTER TABLE public.external_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.external_payments FROM anon, authenticated;
DROP POLICY IF EXISTS external_payments_owner_select ON public.external_payments;
CREATE POLICY external_payments_owner_select ON public.external_payments FOR SELECT TO authenticated
  USING (creator_id = (SELECT auth.uid()));
GRANT SELECT ON public.external_payments TO authenticated;
GRANT ALL ON public.external_payments TO service_role;

-- Creator's own Razorpay webhook secret, AES-256-GCM sealed by the application.
CREATE TABLE IF NOT EXISTS public.creator_external_webhooks (
  creator_id      uuid PRIMARY KEY REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  sealed_secret   text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_event_at   timestamptz
);
ALTER TABLE public.creator_external_webhooks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.creator_external_webhooks FROM anon, authenticated;
GRANT ALL ON public.creator_external_webhooks TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Customisable dashboard layout (validated shape, small)
-- ---------------------------------------------------------------------------
ALTER TABLE public.creator_preferences
  ADD COLUMN IF NOT EXISTS dashboard_layout jsonb NOT NULL DEFAULT '{}'::jsonb;
DO $$ BEGIN
  ALTER TABLE public.creator_preferences ADD CONSTRAINT creator_preferences_dashboard_layout_shape
    CHECK (jsonb_typeof(dashboard_layout) = 'object' AND pg_column_size(dashboard_layout) < 4096);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.creator_preferences
  ADD COLUMN IF NOT EXISTS ui_theme text NOT NULL DEFAULT 'dark' CHECK (ui_theme IN ('dark','light','system'));
GRANT UPDATE (dashboard_layout, ui_theme) ON public.creator_preferences TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. YouTube account connection retired (YouTube streaming is unaffected)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sl_my_connections()
RETURNS TABLE (platform text, connected boolean, account_login text, display_name text,
               avatar_url text, connected_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.platform, true, c.platform_login, c.display_name, c.avatar_url, c.connected_at
    FROM public.creator_platform_connections c
   WHERE c.creator_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.sl_my_connections() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sl_my_connections() TO authenticated;

DO $$ BEGIN
  IF to_regclass('public.creator_youtube_tokens') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.creator_youtube_tokens FROM anon, authenticated';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Finance summary by payment source (own data only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sl_my_source_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH me AS (SELECT (SELECT auth.uid()) AS uid)
  SELECT CASE WHEN (SELECT uid FROM me) IS NULL THEN NULL ELSE jsonb_build_object(
    'qr', (SELECT jsonb_build_object(
              'count', count(*),
              'gross_paise', coalesce(sum(p.amount_paise - p.refunded_paise), 0),
              'platform_fee_paise', coalesce(sum(p.platform_fee_paise), 0),
              'creator_share_paise', coalesce(sum(p.creator_share_paise), 0),
              'gateway_fee_paise', coalesce(sum(p.gateway_fee_paise), 0))
             FROM public.payments p, me WHERE p.creator_id = me.uid),
    'external', (SELECT jsonb_build_object(
              'count', count(*),
              'gross_paise', coalesce(sum(e.amount_paise) FILTER (WHERE e.status = 'captured'), 0),
              'platform_fee_paise', 0)
             FROM public.external_payments e, me WHERE e.creator_id = me.uid),
    'qr_fee_bps', (SELECT platform_fee_bps FROM public.platform_settings WHERE id),
    'gateway_fee_bearer', (SELECT gateway_fee_bearer FROM public.platform_settings WHERE id),
    'external_link_configured', (SELECT external_payment_url IS NOT NULL FROM public.creator_preferences cp, me WHERE cp.creator_id = me.uid),
    'external_webhook_configured', EXISTS (SELECT 1 FROM public.creator_external_webhooks w, me WHERE w.creator_id = me.uid)
  ) END
$$;
REVOKE ALL ON FUNCTION public.sl_my_source_summary() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sl_my_source_summary() TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Public: the creator's own Razorpay link (already public in their
--    descriptions), shown on their page as the 0%-commission option.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_external_link(p_username text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT cp2.external_payment_url
    FROM public.creator_profiles cp
    JOIN public.creator_preferences cp2 ON cp2.creator_id = cp.id
   WHERE cp.public_page_enabled AND lower(cp.username) = lower(btrim(p_username))
   LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_public_external_link(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_external_link(text) TO anon, authenticated, service_role;

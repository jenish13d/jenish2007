-- =============================================================================
-- 0008  Payments, immutable ledger, refunds, disputes, payouts, admin audit
-- =============================================================================
-- Money is stored as integer paise (bigint). No floating point anywhere.
--
-- Model
--   payments        one row per Razorpay payment, with the fee split frozen at
--                   capture time (the fee rate in force then, not now).
--   ledger_entries  append-only. Every money movement is a set of entries
--                   whose amounts sum to the movement. Entries are never
--                   updated or deleted (enforced by trigger); a correction is a
--                   new, audited 'adjustment' entry.
--   webhook_events  every verified Razorpay webhook, keyed by Razorpay's event
--                   id, so a replayed event is detected and ignored.
--   refunds / disputes / payouts   provider objects mirrored for reporting.
--   admin_users / admin_audit_log  owner/admin roles and an immutable audit
--                   trail of every privileged action.
--
-- Creator balance
--   A creator entry becomes withdrawable at `available_at` (capture time plus
--   the settlement hold). Payout requests reserve balance immediately; a
--   failed or cancelled payout releases it. "completed" is only ever set from
--   a provider confirmation (see sl_set_payout_status).
--
-- Fee split (frozen per payment, configurable in platform_settings)
--   platform_fee   = round(gross * platform_fee_bps / 10000)
--   gateway fee    = Razorpay's actual fee + GST on it, read from the captured
--                    payment entity
--   bearer 'platform' (default): creator = gross - platform_fee
--                                platform keeps platform_fee - gateway fee
--   bearer 'creator':            creator = gross - platform_fee - gateway fee
--
-- Safety: additive only. Creates new tables/functions; changes no existing
-- table. Idempotent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Platform settings (single row). Owner-editable through the admin panel only.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id                      boolean PRIMARY KEY DEFAULT true CHECK (id),
  platform_fee_bps        integer NOT NULL DEFAULT 1000 CHECK (platform_fee_bps BETWEEN 0 AND 5000),
  gateway_fee_bearer      text    NOT NULL DEFAULT 'platform' CHECK (gateway_fee_bearer IN ('platform','creator')),
  settlement_hold_days    integer NOT NULL DEFAULT 7 CHECK (settlement_hold_days BETWEEN 0 AND 60),
  min_payout_paise        bigint  NOT NULL DEFAULT 50000 CHECK (min_payout_paise >= 100),
  message_limit_default   integer NOT NULL DEFAULT 50 CHECK (message_limit_default BETWEEN 10 AND 500),
  message_limit_min       integer NOT NULL DEFAULT 10 CHECK (message_limit_min >= 1),
  message_limit_max       integer NOT NULL DEFAULT 200 CHECK (message_limit_max <= 500),
  -- LoungePoints (see 0010). Points per whole rupee paid, and redemption rate.
  points_per_rupee        integer NOT NULL DEFAULT 1 CHECK (points_per_rupee BETWEEN 0 AND 100),
  points_per_redemption   integer NOT NULL DEFAULT 1000 CHECK (points_per_redemption > 0),
  redemption_value_paise  bigint  NOT NULL DEFAULT 1000 CHECK (redemption_value_paise >= 0),
  points_enabled          boolean NOT NULL DEFAULT false,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid
);
INSERT INTO public.platform_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_settings_public_read ON public.platform_settings;
CREATE POLICY platform_settings_public_read ON public.platform_settings FOR SELECT TO anon, authenticated USING (true);
REVOKE ALL ON public.platform_settings FROM anon, authenticated;
-- Fees are disclosed publicly on purpose: creators must see them before pricing.
GRANT SELECT (platform_fee_bps, gateway_fee_bearer, settlement_hold_days, min_payout_paise,
              message_limit_default, message_limit_min, message_limit_max,
              points_per_rupee, points_per_redemption, redemption_value_paise, points_enabled)
  ON public.platform_settings TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin roles and audit log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('owner','admin')),
  granted_at  timestamptz NOT NULL DEFAULT now(),
  granted_by  text NOT NULL,
  revoked_at  timestamptz
);
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_users FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id    uuid,
  action      text NOT NULL,
  target_type text,
  target_id   text,
  reason      text,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_audit_log FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id                   text PRIMARY KEY CHECK (id ~ '^pay_[A-Za-z0-9]+$'),
  order_id             text NOT NULL UNIQUE,
  creator_id           uuid NOT NULL REFERENCES public.creator_profiles(id) ON DELETE RESTRICT,
  submission_id        uuid REFERENCES public.creator_submissions(id) ON DELETE SET NULL,
  interaction_type     text NOT NULL,
  -- Real payer account, when the viewer was signed in. Never exposed to creators.
  viewer_user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name         text NOT NULL DEFAULT 'Anonymous',
  currency             text NOT NULL DEFAULT 'INR',
  amount_paise         bigint NOT NULL CHECK (amount_paise > 0),
  platform_fee_bps     integer NOT NULL,
  gateway_fee_bearer   text NOT NULL,
  platform_fee_paise   bigint NOT NULL CHECK (platform_fee_paise >= 0),
  gateway_fee_paise    bigint NOT NULL DEFAULT 0 CHECK (gateway_fee_paise >= 0),
  gateway_tax_paise    bigint NOT NULL DEFAULT 0 CHECK (gateway_tax_paise >= 0),
  creator_share_paise  bigint NOT NULL,
  refunded_paise       bigint NOT NULL DEFAULT 0 CHECK (refunded_paise >= 0),
  status               text NOT NULL DEFAULT 'captured'
                       CHECK (status IN ('captured','partially_refunded','refunded','disputed','dispute_lost')),
  method               text,
  captured_at          timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (refunded_paise <= amount_paise)
);
CREATE INDEX IF NOT EXISTS payments_creator_captured_idx ON public.payments (creator_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS payments_viewer_idx ON public.payments (viewer_user_id) WHERE viewer_user_id IS NOT NULL;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payments FROM anon, authenticated;
DROP POLICY IF EXISTS payments_creator_select ON public.payments;
CREATE POLICY payments_creator_select ON public.payments FOR SELECT TO authenticated
  USING (creator_id = (SELECT auth.uid()));
-- Creators see what they need for their dashboard; viewer_user_id is withheld.
GRANT SELECT (id, creator_id, submission_id, interaction_type, display_name, currency, amount_paise,
              platform_fee_bps, gateway_fee_bearer, platform_fee_paise, gateway_fee_paise,
              gateway_tax_paise, creator_share_paise, refunded_paise, status, method, captured_at)
  ON public.payments TO authenticated;

-- ---------------------------------------------------------------------------
-- Ledger (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  idempotency_key  text NOT NULL,
  account          text NOT NULL CHECK (account IN ('creator','platform_revenue','gateway_fees')),
  kind             text NOT NULL CHECK (kind IN ('capture','refund','dispute_hold','dispute_release','adjustment')),
  creator_id       uuid REFERENCES public.creator_profiles(id) ON DELETE RESTRICT,
  payment_id       text REFERENCES public.payments(id) ON DELETE RESTRICT,
  amount_paise     bigint NOT NULL,
  available_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,
  note             text,
  UNIQUE (idempotency_key, account)
);
CREATE INDEX IF NOT EXISTS ledger_creator_idx ON public.ledger_entries (creator_id, available_at) WHERE account = 'creator';
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ledger_entries FROM anon, authenticated;
DROP POLICY IF EXISTS ledger_creator_select ON public.ledger_entries;
CREATE POLICY ledger_creator_select ON public.ledger_entries FOR SELECT TO authenticated
  USING (account = 'creator' AND creator_id = (SELECT auth.uid()));
GRANT SELECT (id, account, kind, creator_id, payment_id, amount_paise, available_at, created_at, note)
  ON public.ledger_entries TO authenticated;

-- ---------------------------------------------------------------------------
-- Provider mirrors
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_events (
  event_id     text PRIMARY KEY,
  event        text NOT NULL,
  payload      jsonb NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error        text
);
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.webhook_events FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.refunds (
  id           text PRIMARY KEY,
  payment_id   text NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  status       text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.refunds FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.disputes (
  id           text PRIMARY KEY,
  payment_id   text NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  status       text NOT NULL CHECK (status IN ('open','won','lost','closed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.disputes FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.payouts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id       uuid NOT NULL REFERENCES public.creator_profiles(id) ON DELETE RESTRICT,
  amount_paise     bigint NOT NULL CHECK (amount_paise > 0),
  status           text NOT NULL DEFAULT 'requested'
                   CHECK (status IN ('requested','approved','processing','completed','failed','cancelled')),
  provider         text NOT NULL DEFAULT 'razorpay_route',
  provider_ref     text UNIQUE,
  failure_reason   text,
  requested_at     timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz
);
CREATE INDEX IF NOT EXISTS payouts_creator_idx ON public.payouts (creator_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS payouts_status_idx ON public.payouts (status, requested_at);
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payouts FROM anon, authenticated;
DROP POLICY IF EXISTS payouts_creator_select ON public.payouts;
CREATE POLICY payouts_creator_select ON public.payouts FOR SELECT TO authenticated
  USING (creator_id = (SELECT auth.uid()));
GRANT SELECT (id, creator_id, amount_paise, status, failure_reason, requested_at, updated_at, completed_at)
  ON public.payouts TO authenticated;

-- ---------------------------------------------------------------------------
-- Immutability
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sl_forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; record a new audited entry instead', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END $$;
DROP TRIGGER IF EXISTS ledger_entries_immutable ON public.ledger_entries;
CREATE TRIGGER ledger_entries_immutable BEFORE UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.sl_forbid_mutation();
DROP TRIGGER IF EXISTS admin_audit_log_immutable ON public.admin_audit_log;
CREATE TRIGGER admin_audit_log_immutable BEFORE UPDATE OR DELETE ON public.admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.sl_forbid_mutation();

-- ---------------------------------------------------------------------------
-- Balances
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sl_creator_balance(p_creator_id uuid)
RETURNS TABLE (earned_paise bigint, pending_paise bigint, available_paise bigint,
               reserved_paise bigint, paid_out_paise bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH l AS (
    SELECT coalesce(sum(amount_paise),0)::bigint AS total,
           coalesce(sum(amount_paise) FILTER (WHERE available_at > now()),0)::bigint AS pending
      FROM public.ledger_entries WHERE account = 'creator' AND creator_id = p_creator_id
  ), p AS (
    SELECT coalesce(sum(amount_paise) FILTER (WHERE status IN ('requested','approved','processing')),0)::bigint AS reserved,
           coalesce(sum(amount_paise) FILTER (WHERE status = 'completed'),0)::bigint AS paid
      FROM public.payouts WHERE creator_id = p_creator_id
  )
  SELECT l.total, greatest(l.pending, 0), (l.total - l.pending - p.reserved - p.paid), p.reserved, p.paid FROM l, p
$$;
REVOKE ALL ON FUNCTION public.sl_creator_balance(uuid) FROM PUBLIC, anon;
-- Authenticated callers may only read their own balance (checked in sl_my_balance).
CREATE OR REPLACE FUNCTION public.sl_my_balance()
RETURNS TABLE (earned_paise bigint, pending_paise bigint, available_paise bigint,
               reserved_paise bigint, paid_out_paise bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT * FROM public.sl_creator_balance((SELECT auth.uid())) WHERE (SELECT auth.uid()) IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.sl_my_balance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sl_my_balance() TO authenticated;
REVOKE ALL ON FUNCTION public.sl_creator_balance(uuid) FROM authenticated;

-- ---------------------------------------------------------------------------
-- Capture: record a verified, captured payment exactly once.
-- Called by the server (service role) after it has fetched the payment from
-- Razorpay and validated amount, currency, order and status itself.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sl_record_payment_capture(
  p_payment_id text, p_order_id text, p_creator_id uuid, p_interaction_type text,
  p_amount_paise bigint, p_currency text, p_gateway_fee_paise bigint, p_gateway_tax_paise bigint,
  p_method text, p_viewer_user_id uuid, p_display_name text, p_submission_id uuid, p_captured_at timestamptz
) RETURNS public.payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  s public.platform_settings;
  existing public.payments;
  v_platform bigint; v_creator bigint; v_gw bigint; v_platform_net bigint;
  v_avail timestamptz;
  r public.payments;
BEGIN
  SELECT * INTO existing FROM public.payments WHERE id = p_payment_id;
  IF FOUND THEN
    IF existing.order_id <> p_order_id OR existing.creator_id <> p_creator_id OR existing.amount_paise <> p_amount_paise THEN
      RAISE EXCEPTION 'payment % already recorded with different details', p_payment_id USING ERRCODE = 'unique_violation';
    END IF;
    -- Late-arriving link to the submission is allowed; nothing else changes.
    IF existing.submission_id IS NULL AND p_submission_id IS NOT NULL THEN
      UPDATE public.payments SET submission_id = p_submission_id, updated_at = now() WHERE id = p_payment_id RETURNING * INTO existing;
    END IF;
    RETURN existing;
  END IF;

  SELECT * INTO s FROM public.platform_settings WHERE id;
  v_gw := coalesce(p_gateway_fee_paise,0);  -- Razorpay's fee already includes its tax
  v_platform := round(p_amount_paise * s.platform_fee_bps / 10000.0)::bigint;
  IF s.gateway_fee_bearer = 'creator' THEN
    v_creator := p_amount_paise - v_platform - v_gw;
    v_platform_net := v_platform;
  ELSE
    v_creator := p_amount_paise - v_platform;
    v_platform_net := v_platform - v_gw;
  END IF;
  v_avail := coalesce(p_captured_at, now()) + make_interval(days => s.settlement_hold_days);

  INSERT INTO public.payments (id, order_id, creator_id, submission_id, interaction_type, viewer_user_id,
      display_name, currency, amount_paise, platform_fee_bps, gateway_fee_bearer, platform_fee_paise,
      gateway_fee_paise, gateway_tax_paise, creator_share_paise, method, captured_at)
  VALUES (p_payment_id, p_order_id, p_creator_id, p_submission_id, p_interaction_type, p_viewer_user_id,
      left(coalesce(nullif(btrim(p_display_name),''),'Anonymous'), 40), upper(p_currency), p_amount_paise,
      s.platform_fee_bps, s.gateway_fee_bearer, v_platform, v_gw, coalesce(p_gateway_tax_paise,0), v_creator,
      p_method, coalesce(p_captured_at, now()))
  RETURNING * INTO r;

  INSERT INTO public.ledger_entries (idempotency_key, account, kind, creator_id, payment_id, amount_paise, available_at) VALUES
    ('capture:'||p_payment_id, 'creator',          'capture', p_creator_id, p_payment_id, v_creator, v_avail),
    ('capture:'||p_payment_id, 'platform_revenue', 'capture', p_creator_id, p_payment_id, v_platform_net, now()),
    ('capture:'||p_payment_id, 'gateway_fees',     'capture', p_creator_id, p_payment_id, v_gw, now());
  RETURN r;
END $$;

-- ---------------------------------------------------------------------------
-- Refund: reverse proportionally, once per Razorpay refund id.
-- Gateway fees are not returned by Razorpay, so the platform absorbs them.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sl_record_refund(p_refund_id text, p_payment_id text, p_amount_paise bigint, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE pay public.payments; v_creator bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM public.refunds WHERE id = p_refund_id) THEN
    UPDATE public.refunds SET status = p_status WHERE id = p_refund_id; RETURN;
  END IF;
  SELECT * INTO pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown payment %', p_payment_id; END IF;
  IF pay.refunded_paise + p_amount_paise > pay.amount_paise THEN
    RAISE EXCEPTION 'refund exceeds captured amount for %', p_payment_id;
  END IF;
  INSERT INTO public.refunds (id, payment_id, amount_paise, status) VALUES (p_refund_id, p_payment_id, p_amount_paise, p_status);
  v_creator := round(pay.creator_share_paise * p_amount_paise / pay.amount_paise::numeric)::bigint;
  INSERT INTO public.ledger_entries (idempotency_key, account, kind, creator_id, payment_id, amount_paise) VALUES
    ('refund:'||p_refund_id, 'creator',          'refund', pay.creator_id, p_payment_id, -v_creator),
    ('refund:'||p_refund_id, 'platform_revenue', 'refund', pay.creator_id, p_payment_id, -(p_amount_paise - v_creator));
  UPDATE public.payments SET refunded_paise = refunded_paise + p_amount_paise,
         status = CASE WHEN refunded_paise + p_amount_paise >= amount_paise THEN 'refunded' ELSE 'partially_refunded' END,
         updated_at = now()
   WHERE id = p_payment_id;
END $$;

-- ---------------------------------------------------------------------------
-- Disputes: hold the creator's share while open; release if won.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sl_record_dispute(p_dispute_id text, p_payment_id text, p_amount_paise bigint, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE pay public.payments; d public.disputes; v_hold bigint;
BEGIN
  SELECT * INTO pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown payment %', p_payment_id; END IF;
  v_hold := round(pay.creator_share_paise * least(p_amount_paise, pay.amount_paise) / pay.amount_paise::numeric)::bigint;
  SELECT * INTO d FROM public.disputes WHERE id = p_dispute_id;
  IF NOT FOUND THEN
    INSERT INTO public.disputes (id, payment_id, amount_paise, status) VALUES (p_dispute_id, p_payment_id, p_amount_paise, 'open');
    INSERT INTO public.ledger_entries (idempotency_key, account, kind, creator_id, payment_id, amount_paise)
    VALUES ('dispute_hold:'||p_dispute_id, 'creator', 'dispute_hold', pay.creator_id, p_payment_id, -v_hold)
    ON CONFLICT DO NOTHING;
    UPDATE public.payments SET status = 'disputed', updated_at = now() WHERE id = p_payment_id;
  END IF;
  IF p_status IN ('won','lost','closed') THEN
    UPDATE public.disputes SET status = p_status, updated_at = now() WHERE id = p_dispute_id;
    IF p_status = 'won' THEN
      INSERT INTO public.ledger_entries (idempotency_key, account, kind, creator_id, payment_id, amount_paise)
      VALUES ('dispute_release:'||p_dispute_id, 'creator', 'dispute_release', pay.creator_id, p_payment_id, v_hold)
      ON CONFLICT DO NOTHING;
      UPDATE public.payments SET status = CASE WHEN refunded_paise > 0 THEN 'partially_refunded' ELSE 'captured' END,
             updated_at = now() WHERE id = p_payment_id;
    ELSIF p_status = 'lost' THEN
      UPDATE public.payments SET status = 'dispute_lost', updated_at = now() WHERE id = p_payment_id;
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Payouts
-- ---------------------------------------------------------------------------
-- A creator requests a withdrawal of available balance. Serialised per creator
-- so two concurrent requests cannot both spend the same balance.
CREATE OR REPLACE FUNCTION public.sl_request_payout(p_amount_paise bigint)
RETURNS public.payouts LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := (SELECT auth.uid()); b record; s public.platform_settings; r public.payouts;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = 'insufficient_privilege'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('payout:'||v_uid::text, 0));
  SELECT * INTO s FROM public.platform_settings WHERE id;
  IF p_amount_paise < s.min_payout_paise THEN RAISE EXCEPTION 'below minimum payout' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO b FROM public.sl_creator_balance(v_uid);
  IF p_amount_paise > b.available_paise THEN RAISE EXCEPTION 'insufficient available balance' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO public.payouts (creator_id, amount_paise) VALUES (v_uid, p_amount_paise) RETURNING * INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.sl_request_payout(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sl_request_payout(bigint) TO authenticated;

-- Status transitions. 'completed' requires a provider reference: it is set only
-- from a payout-provider confirmation, never by hand.
CREATE OR REPLACE FUNCTION public.sl_set_payout_status(
  p_payout_id uuid, p_status text, p_actor uuid, p_provider_ref text, p_reason text)
RETURNS public.payouts LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE cur public.payouts; r public.payouts; ok boolean;
BEGIN
  SELECT * INTO cur FROM public.payouts WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown payout'; END IF;
  ok := (cur.status, p_status) IN (('requested','approved'),('requested','cancelled'),('approved','processing'),
                                   ('approved','cancelled'),('processing','completed'),('processing','failed'));
  IF NOT ok THEN RAISE EXCEPTION 'invalid payout transition % -> %', cur.status, p_status USING ERRCODE = 'check_violation'; END IF;
  IF p_status = 'completed' AND coalesce(p_provider_ref, cur.provider_ref) IS NULL THEN
    RAISE EXCEPTION 'completed requires a provider confirmation reference' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.payouts SET status = p_status, provider_ref = coalesce(p_provider_ref, provider_ref),
         failure_reason = CASE WHEN p_status IN ('failed','cancelled') THEN p_reason ELSE failure_reason END,
         completed_at = CASE WHEN p_status = 'completed' THEN now() ELSE completed_at END, updated_at = now()
   WHERE id = p_payout_id RETURNING * INTO r;
  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, reason, before, after)
  VALUES (p_actor, 'payout_status', 'payout', p_payout_id::text, p_reason,
          jsonb_build_object('status', cur.status), jsonb_build_object('status', p_status, 'provider_ref', r.provider_ref));
  RETURN r;
END $$;

-- ---------------------------------------------------------------------------
-- Audited manual adjustment (owner/admin only; reason mandatory)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sl_admin_adjust_creator(p_admin uuid, p_creator uuid, p_amount_paise bigint, p_reason text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE before_b record; after_b record; v_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_admin AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'not an administrator' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN RAISE EXCEPTION 'a reason of at least 10 characters is required'; END IF;
  IF p_amount_paise = 0 THEN RAISE EXCEPTION 'amount must be non-zero'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('payout:'||p_creator::text, 0));
  SELECT * INTO before_b FROM public.sl_creator_balance(p_creator);
  INSERT INTO public.ledger_entries (idempotency_key, account, kind, creator_id, amount_paise, created_by, note)
  VALUES ('adjust:'||gen_random_uuid(), 'creator', 'adjustment', p_creator, p_amount_paise, p_admin, p_reason)
  RETURNING id INTO v_id;
  INSERT INTO public.ledger_entries (idempotency_key, account, kind, creator_id, amount_paise, created_by, note)
  SELECT idempotency_key, 'platform_revenue', 'adjustment', p_creator, -p_amount_paise, p_admin, p_reason
    FROM public.ledger_entries WHERE id = v_id;
  SELECT * INTO after_b FROM public.sl_creator_balance(p_creator);
  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, reason, before, after)
  VALUES (p_admin, 'ledger_adjustment', 'creator', p_creator::text, p_reason, to_jsonb(before_b), to_jsonb(after_b));
  RETURN v_id;
END $$;

-- Links the recorded payment to the submission the viewer sent, and records the
-- display name they chose. Only fills a missing link; never rewrites one.
CREATE OR REPLACE FUNCTION public.sl_link_payment_submission(p_payment_id text, p_submission_id uuid, p_display_name text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.payments
     SET submission_id = p_submission_id,
         display_name = left(coalesce(nullif(btrim(p_display_name),''), display_name), 40),
         updated_at = now()
   WHERE id = p_payment_id AND submission_id IS NULL
$$;
REVOKE ALL ON FUNCTION public.sl_link_payment_submission(text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sl_link_payment_submission(text,uuid,text) TO service_role;

-- Only the server (service role) may call the money-moving functions.
REVOKE ALL ON FUNCTION public.sl_record_payment_capture(text,text,uuid,text,bigint,text,bigint,bigint,text,uuid,text,uuid,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sl_record_refund(text,text,bigint,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sl_record_dispute(text,text,bigint,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sl_set_payout_status(uuid,text,uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sl_admin_adjust_creator(uuid,uuid,bigint,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sl_forbid_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sl_record_payment_capture(text,text,uuid,text,bigint,text,bigint,bigint,text,uuid,text,uuid,timestamptz),
  public.sl_record_refund(text,text,bigint,text), public.sl_record_dispute(text,text,bigint,text),
  public.sl_set_payout_status(uuid,text,uuid,text,text), public.sl_admin_adjust_creator(uuid,uuid,bigint,text),
  public.sl_creator_balance(uuid) TO service_role;
GRANT ALL ON public.platform_settings, public.admin_users, public.admin_audit_log, public.payments,
  public.ledger_entries, public.webhook_events, public.refunds, public.disputes, public.payouts TO service_role;

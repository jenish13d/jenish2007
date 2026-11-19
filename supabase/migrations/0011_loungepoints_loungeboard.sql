-- =============================================================================
-- 0011  LoungePoints (viewer rewards) and LoungeBoard (creator leaderboard)
-- =============================================================================
-- LoungePoints
--   * Earned only by signed-in viewers, only on a captured payment, exactly
--     once per payment (idempotency key), and only while the owner has
--     switched points on in platform_settings.
--   * Reversed proportionally when the payment is refunded; a dispute freezes
--     nothing here because disputed payments are already excluded from new
--     earning by status.
--   * Append-only ledger. Balance = sum of entries.
--   * Redemption requests are recorded with the value frozen at request time.
--     Fulfilment (applying the value at checkout) is NOT wired yet; requests
--     stay 'pending' and are visible to the owner as reward liability.
--
-- LoungeBoard
--   * Ranks creators who opted in, by captured superchat money net of refunds,
--     excluding payments that are disputed, refunded or lost a dispute.
--   * Coarse, creator-entered locations only (city / district / state /
--     country / continent). No addresses, no coordinates.
--
-- Safety: additive, idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.loungepoints_ledger (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('earn','reverse','redeem','redeem_cancel','bonus','adjust')),
  points          integer NOT NULL CHECK (points <> 0),
  payment_id      text REFERENCES public.payments(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL UNIQUE,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loungepoints_user_idx ON public.loungepoints_ledger (user_id, created_at DESC);
ALTER TABLE public.loungepoints_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.loungepoints_ledger FROM anon, authenticated;
DROP POLICY IF EXISTS loungepoints_owner_select ON public.loungepoints_ledger;
CREATE POLICY loungepoints_owner_select ON public.loungepoints_ledger FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
GRANT SELECT (id, kind, points, payment_id, note, created_at) ON public.loungepoints_ledger TO authenticated;
GRANT ALL ON public.loungepoints_ledger TO service_role;
DROP TRIGGER IF EXISTS loungepoints_immutable ON public.loungepoints_ledger;
CREATE TRIGGER loungepoints_immutable BEFORE UPDATE OR DELETE ON public.loungepoints_ledger
  FOR EACH ROW EXECUTE FUNCTION public.sl_forbid_mutation();

CREATE TABLE IF NOT EXISTS public.loungepoints_redemptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  points       integer NOT NULL CHECK (points > 0),
  value_paise  bigint NOT NULL CHECK (value_paise >= 0),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','cancelled')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.loungepoints_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.loungepoints_redemptions FROM anon, authenticated;
DROP POLICY IF EXISTS loungepoints_redemptions_owner ON public.loungepoints_redemptions;
CREATE POLICY loungepoints_redemptions_owner ON public.loungepoints_redemptions FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
GRANT SELECT ON public.loungepoints_redemptions TO authenticated;
GRANT ALL ON public.loungepoints_redemptions TO service_role;

-- Signed-in viewers can see the payments they made (display name, creator,
-- amount, time). Column grants from 0008 already exclude viewer_user_id.
DROP POLICY IF EXISTS payments_viewer_select ON public.payments;
CREATE POLICY payments_viewer_select ON public.payments FOR SELECT TO authenticated
  USING (viewer_user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- Earning and reversal
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sl_award_points_on_capture() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.platform_settings; v_points integer;
BEGIN
  IF NEW.viewer_user_id IS NULL OR NEW.viewer_user_id = NEW.creator_id THEN RETURN NEW; END IF;
  SELECT * INTO s FROM public.platform_settings WHERE id;
  IF NOT s.points_enabled OR s.points_per_rupee = 0 THEN RETURN NEW; END IF;
  v_points := (NEW.amount_paise / 100) * s.points_per_rupee;
  IF v_points > 0 THEN
    INSERT INTO public.loungepoints_ledger (user_id, kind, points, payment_id, idempotency_key)
    VALUES (NEW.viewer_user_id, 'earn', v_points, NEW.id, 'earn:'||NEW.id)
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS payments_award_points ON public.payments;
CREATE TRIGGER payments_award_points AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.sl_award_points_on_capture();

CREATE OR REPLACE FUNCTION public.sl_reverse_points_on_refund() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE earned integer; pay public.payments; v_rev integer;
BEGIN
  SELECT * INTO pay FROM public.payments WHERE id = NEW.payment_id;
  SELECT points INTO earned FROM public.loungepoints_ledger WHERE idempotency_key = 'earn:'||NEW.payment_id;
  IF earned IS NULL OR pay.viewer_user_id IS NULL THEN RETURN NEW; END IF;
  v_rev := ceil(earned * NEW.amount_paise / pay.amount_paise::numeric)::integer;
  IF v_rev > 0 THEN
    INSERT INTO public.loungepoints_ledger (user_id, kind, points, payment_id, idempotency_key, note)
    VALUES (pay.viewer_user_id, 'reverse', -v_rev, NEW.payment_id, 'reverse:'||NEW.id, 'refund '||NEW.id)
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS refunds_reverse_points ON public.refunds;
CREATE TRIGGER refunds_reverse_points AFTER INSERT ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.sl_reverse_points_on_refund();

-- ---------------------------------------------------------------------------
-- Balance and redemption
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sl_my_points()
RETURNS TABLE (balance integer, points_per_redemption integer, redemption_value_paise bigint, enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT sum(points) FROM public.loungepoints_ledger WHERE user_id = (SELECT auth.uid())), 0)::integer,
         s.points_per_redemption, s.redemption_value_paise, s.points_enabled
    FROM public.platform_settings s WHERE s.id AND (SELECT auth.uid()) IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.sl_my_points() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sl_my_points() TO authenticated;

-- Redeems whole multiples of points_per_redemption. Serialised per user.
CREATE OR REPLACE FUNCTION public.sl_redeem_points(p_units integer)
RETURNS public.loungepoints_redemptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := (SELECT auth.uid()); s public.platform_settings; bal integer; r public.loungepoints_redemptions;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF p_units IS NULL OR p_units < 1 OR p_units > 100 THEN RAISE EXCEPTION 'invalid redemption' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO s FROM public.platform_settings WHERE id;
  IF NOT s.points_enabled THEN RAISE EXCEPTION 'LoungePoints are not active' USING ERRCODE = 'check_violation'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('points:'||v_uid::text, 0));
  SELECT coalesce(sum(points),0) INTO bal FROM public.loungepoints_ledger WHERE user_id = v_uid;
  IF bal < p_units * s.points_per_redemption THEN RAISE EXCEPTION 'not enough points' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO public.loungepoints_redemptions (user_id, points, value_paise)
  VALUES (v_uid, p_units * s.points_per_redemption, p_units * s.redemption_value_paise) RETURNING * INTO r;
  INSERT INTO public.loungepoints_ledger (user_id, kind, points, idempotency_key, note)
  VALUES (v_uid, 'redeem', -(p_units * s.points_per_redemption), 'redeem:'||r.id, 'redemption '||r.id);
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.sl_redeem_points(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sl_redeem_points(integer) TO authenticated;

-- Outstanding reward liability for the owner console.
CREATE OR REPLACE FUNCTION public.sl_reward_liability()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'points_outstanding', coalesce((SELECT sum(points) FROM public.loungepoints_ledger), 0),
    'liability_paise', coalesce((SELECT sum(points) FROM public.loungepoints_ledger), 0) * s.redemption_value_paise / s.points_per_redemption,
    'pending_redemptions_paise', coalesce((SELECT sum(value_paise) FROM public.loungepoints_redemptions WHERE status = 'pending'), 0)
  ) FROM public.platform_settings s WHERE s.id
$$;
REVOKE ALL ON FUNCTION public.sl_reward_liability() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sl_reward_liability() TO service_role;

-- ---------------------------------------------------------------------------
-- LoungeBoard
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS payments_board_idx ON public.payments (captured_at, creator_id)
  WHERE status IN ('captured','partially_refunded');

CREATE OR REPLACE FUNCTION public.sl_loungeboard(p_scope text, p_value text, p_period text, p_limit integer)
RETURNS TABLE (rank bigint, username text, creator_name text, profile_image_url text,
               total_paise bigint, superchats bigint, location text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH eligible AS (
    SELECT p.creator_id, sum(p.amount_paise - p.refunded_paise)::bigint AS total, count(*) AS n
      FROM public.payments p
     WHERE p.status IN ('captured','partially_refunded')
       AND p.captured_at >= CASE p_period
             WHEN 'today' THEN date_trunc('day', now())
             WHEN 'week'  THEN now() - interval '7 days'
             WHEN 'month' THEN now() - interval '30 days'
             ELSE '-infinity'::timestamptz END
       -- A creator paying their own page while signed in never counts.
       AND (p.viewer_user_id IS NULL OR p.viewer_user_id <> p.creator_id)
     GROUP BY p.creator_id
  )
  SELECT rank() OVER (ORDER BY e.total DESC, e.n DESC), c.username, c.creator_name, c.profile_image_url, e.total, e.n,
         CASE p_scope
           WHEN 'city' THEN pr.location_city WHEN 'district' THEN pr.location_district
           WHEN 'state' THEN pr.location_state WHEN 'country' THEN pr.location_country
           WHEN 'continent' THEN pr.location_continent ELSE NULL END
    FROM eligible e
    JOIN public.creator_profiles c ON c.id = e.creator_id AND c.public_page_enabled AND c.username IS NOT NULL
    JOIN public.creator_preferences pr ON pr.creator_id = e.creator_id AND pr.leaderboard_opt_in
   WHERE e.total > 0
     AND (p_scope = 'global' OR p_value IS NULL OR lower(CASE p_scope
           WHEN 'city' THEN pr.location_city WHEN 'district' THEN pr.location_district
           WHEN 'state' THEN pr.location_state WHEN 'country' THEN pr.location_country
           WHEN 'continent' THEN pr.location_continent END) = lower(btrim(p_value)))
   ORDER BY e.total DESC, e.n DESC
   LIMIT least(greatest(coalesce(p_limit, 50), 1), 100)
$$;
REVOKE ALL ON FUNCTION public.sl_loungeboard(text,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sl_loungeboard(text,text,text,integer) TO anon, authenticated, service_role;

-- Filter options: the locations that opted-in public creators have set.
CREATE OR REPLACE FUNCTION public.sl_loungeboard_locations(p_scope text)
RETURNS TABLE (value text, creators bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT v, count(*) FROM (
    SELECT CASE p_scope WHEN 'city' THEN pr.location_city WHEN 'district' THEN pr.location_district
             WHEN 'state' THEN pr.location_state WHEN 'country' THEN pr.location_country
             WHEN 'continent' THEN pr.location_continent END AS v
      FROM public.creator_preferences pr
      JOIN public.creator_profiles c ON c.id = pr.creator_id AND c.public_page_enabled
     WHERE pr.leaderboard_opt_in
  ) x WHERE v IS NOT NULL GROUP BY v ORDER BY count(*) DESC, v LIMIT 200
$$;
REVOKE ALL ON FUNCTION public.sl_loungeboard_locations(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sl_loungeboard_locations(text) TO anon, authenticated, service_role;

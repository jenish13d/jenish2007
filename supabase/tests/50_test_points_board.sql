CREATE OR REPLACE FUNCTION pg_temp.as_user(uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
      EXECUTE 'SET ROLE authenticated'; END $$;
UPDATE public.platform_settings SET points_enabled = true, points_per_rupee = 10, points_per_redemption = 1000, redemption_value_paise = 1000;
INSERT INTO auth.users (id, email) VALUES ('55555555-5555-5555-5555-555555555555','jay@example.test');

-- Signed-in viewer pays ₹150 -> 1500 points, once.
SELECT public.sl_record_payment_capture('pay_P1','order_P1','11111111-1111-1111-1111-111111111111','text',15000,'INR',354,54,'upi','55555555-5555-5555-5555-555555555555','Shiv',NULL,now());
SELECT public.sl_record_payment_capture('pay_P1','order_P1','11111111-1111-1111-1111-111111111111','text',15000,'INR',354,54,'upi','55555555-5555-5555-5555-555555555555','Shiv',NULL,now());
DO $$ BEGIN IF (SELECT sum(points) FROM public.loungepoints_ledger WHERE user_id='55555555-5555-5555-5555-555555555555') <> 1500 THEN RAISE EXCEPTION 'points not awarded once'; END IF; END $$;
-- Guest payments earn nothing.
SELECT public.sl_record_payment_capture('pay_P2','order_P2','11111111-1111-1111-1111-111111111111','text',5000,'INR',118,18,'upi',NULL,'Guest',NULL,now());
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.loungepoints_ledger WHERE payment_id='pay_P2') THEN RAISE EXCEPTION 'guest earned'; END IF; END $$;

-- Viewer sees own points and payment but not the real-account column; creator sees alias only.
SELECT pg_temp.as_user('55555555-5555-5555-5555-555555555555');
DO $$ BEGIN
  IF (SELECT balance FROM public.sl_my_points()) <> 1500 THEN RAISE EXCEPTION 'balance wrong'; END IF;
  IF (SELECT count(*) FROM public.payments) <> 1 THEN RAISE EXCEPTION 'viewer payment visibility wrong'; END IF;
  BEGIN PERFORM viewer_user_id FROM public.payments; RAISE EXCEPTION 'viewer_user_id exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.sl_redeem_points(2); RAISE EXCEPTION 'over-redemption'; EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM public.sl_redeem_points(1);
  IF (SELECT balance FROM public.sl_my_points()) <> 500 THEN RAISE EXCEPTION 'redeem not deducted'; END IF;
  BEGIN INSERT INTO public.loungepoints_ledger (user_id, kind, points, idempotency_key) VALUES (auth.uid(),'bonus',99999,'x'); RAISE EXCEPTION 'self-awarded points';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT pg_temp.as_user('11111111-1111-1111-1111-111111111111');
DO $$ BEGIN
  IF (SELECT display_name FROM public.payments WHERE id='pay_P1') <> 'Shiv' THEN RAISE EXCEPTION 'creator should see alias'; END IF;
  IF (SELECT count(*) FROM public.loungepoints_ledger) <> 0 THEN RAISE EXCEPTION 'creator saw viewer points'; END IF;
END $$;
RESET ROLE;

-- Refund half: points reversed proportionally (750), balance may go negative after redemption (liability recovered).
SELECT public.sl_record_refund('rfnd_P1','pay_P1',7500,'processed');
DO $$ BEGIN IF (SELECT points FROM public.loungepoints_ledger WHERE idempotency_key='reverse:rfnd_P1') <> -750 THEN RAISE EXCEPTION 'reversal wrong'; END IF; END $$;

-- LoungeBoard: hidden until opt-in; net of refunds; excludes refunded/disputed; location filters.
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.sl_loungeboard('global',NULL,'all',10)) THEN RAISE EXCEPTION 'shown without opt-in'; END IF; END $$;
UPDATE public.creator_preferences SET leaderboard_opt_in = true, location_city = 'Surat', location_state = 'Gujarat', location_country = 'IN', location_continent = 'AS'
 WHERE creator_id = '11111111-1111-1111-1111-111111111111';
DO $$ DECLARE r record; BEGIN
  SELECT * INTO r FROM public.sl_loungeboard('global',NULL,'all',10);
  -- pay_A1 refunded fully (excluded), pay_A2 won dispute (captured) 20000, pay_P1 15000-7500, pay_P2 5000 => 32500
  IF r.total_paise <> 32500 THEN RAISE EXCEPTION 'board total wrong: %', r.total_paise; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sl_loungeboard('city','surat','month',10)) THEN RAISE EXCEPTION 'city filter'; END IF;
  IF EXISTS (SELECT 1 FROM public.sl_loungeboard('city','Mumbai','all',10)) THEN RAISE EXCEPTION 'wrong city matched'; END IF;
  IF (SELECT count(*) FROM public.sl_loungeboard_locations('state')) <> 1 THEN RAISE EXCEPTION 'locations'; END IF;
END $$;
SET ROLE anon;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sl_loungeboard('country','IN','all',10)) THEN RAISE EXCEPTION 'anon cannot read board'; END IF;
  BEGIN PERFORM public.sl_reward_liability(); RAISE EXCEPTION 'anon read liability'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN IF (public.sl_reward_liability()->>'pending_redemptions_paise')::bigint <> 1000 THEN RAISE EXCEPTION 'liability'; END IF; END $$;
\echo 'points_board: ok'

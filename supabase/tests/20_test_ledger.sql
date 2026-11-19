-- Ledger, refunds, disputes, payouts and privilege tests (migration 0008).
CREATE OR REPLACE FUNCTION pg_temp.as_user(uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
      EXECUTE 'SET ROLE authenticated'; END $$;
CREATE OR REPLACE FUNCTION pg_temp.eq(label text, got bigint, want bigint) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF got IS DISTINCT FROM want THEN RAISE EXCEPTION '%: got %, want %', label, got, want; END IF; END $$;

UPDATE public.platform_settings SET settlement_hold_days = 0, platform_fee_bps = 1000, gateway_fee_bearer = 'platform', min_payout_paise = 1000;
INSERT INTO auth.users (id, email) VALUES ('33333333-3333-3333-3333-333333333333','viewer@example.test');
INSERT INTO public.creator_profiles (id, creator_name) VALUES ('33333333-3333-3333-3333-333333333333','Viewer') ON CONFLICT DO NOTHING;

-- 1. Capture ₹100 with ₹2.36 gateway fee: creator 90.00, platform 10.00-2.36 = 7.64, fees 2.36.
SELECT public.sl_record_payment_capture('pay_A1','order_A1','11111111-1111-1111-1111-111111111111','text',
  10000,'inr',236,36,'upi','33333333-3333-3333-3333-333333333333','Shiv',NULL,now());
SELECT pg_temp.eq('creator share', (SELECT creator_share_paise FROM public.payments WHERE id='pay_A1'), 9000);
SELECT pg_temp.eq('ledger sums to gross', (SELECT sum(amount_paise)::bigint FROM public.ledger_entries WHERE payment_id='pay_A1'), 10000);
SELECT pg_temp.eq('platform net', (SELECT amount_paise FROM public.ledger_entries WHERE payment_id='pay_A1' AND account='platform_revenue'), 764);

-- 2. Replay is a no-op; a replay with a different amount is rejected.
SELECT public.sl_record_payment_capture('pay_A1','order_A1','11111111-1111-1111-1111-111111111111','text',
  10000,'INR',236,36,'upi',NULL,'Shiv',NULL,now());
SELECT pg_temp.eq('no duplicate entries', (SELECT count(*)::bigint FROM public.ledger_entries WHERE payment_id='pay_A1'), 3);
DO $$ BEGIN
  PERFORM public.sl_record_payment_capture('pay_A1','order_A1','11111111-1111-1111-1111-111111111111','text',
    99999,'INR',236,36,'upi',NULL,'Shiv',NULL,now());
  RAISE EXCEPTION 'tampered replay accepted';
EXCEPTION WHEN unique_violation THEN NULL; END $$;

-- 3. Creator-bears-fee mode on a second payment.
UPDATE public.platform_settings SET gateway_fee_bearer = 'creator';
SELECT public.sl_record_payment_capture('pay_A2','order_A2','11111111-1111-1111-1111-111111111111','audio',
  20000,'INR',472,72,'card',NULL,'Jay',NULL,now());
SELECT pg_temp.eq('creator bears fee', (SELECT creator_share_paise FROM public.payments WHERE id='pay_A2'), 20000-2000-472);
UPDATE public.platform_settings SET gateway_fee_bearer = 'platform';

-- 4. Partial then full refund of pay_A1; over-refund rejected; refund replay is a no-op.
SELECT public.sl_record_refund('rfnd_1','pay_A1',5000,'processed');
SELECT public.sl_record_refund('rfnd_1','pay_A1',5000,'processed');
SELECT pg_temp.eq('creator reversed half', (SELECT amount_paise FROM public.ledger_entries WHERE idempotency_key='refund:rfnd_1' AND account='creator'), -4500);
DO $$ BEGIN PERFORM public.sl_record_refund('rfnd_2','pay_A1',6000,'processed'); RAISE EXCEPTION 'over-refund accepted';
EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'refund exceeds%' THEN RAISE; END IF; END $$;
SELECT public.sl_record_refund('rfnd_3','pay_A1',5000,'processed');
DO $$ BEGIN IF (SELECT status FROM public.payments WHERE id='pay_A1') <> 'refunded' THEN RAISE EXCEPTION 'not marked refunded'; END IF; END $$;

-- 5. Dispute on pay_A2 holds the creator share, then release on win.
SELECT public.sl_record_dispute('disp_1','pay_A2',20000,'open');
SELECT pg_temp.eq('hold', (SELECT amount_paise FROM public.ledger_entries WHERE idempotency_key='dispute_hold:disp_1'), -17528);
SELECT public.sl_record_dispute('disp_1','pay_A2',20000,'won');
SELECT public.sl_record_dispute('disp_1','pay_A2',20000,'won');
SELECT pg_temp.eq('released once', (SELECT count(*)::bigint FROM public.ledger_entries WHERE idempotency_key='dispute_release:disp_1'), 1);

-- Balance now: pay_A1 fully refunded (0) + pay_A2 17528 = 17528 available.
SELECT pg_temp.eq('available', (SELECT available_paise FROM public.sl_creator_balance('11111111-1111-1111-1111-111111111111')), 17528);

-- 6. Ledger is append-only, even for the owner role running SQL.
DO $$ BEGIN UPDATE public.ledger_entries SET amount_paise = 1 WHERE payment_id='pay_A2'; RAISE EXCEPTION 'ledger updated';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.ledger_entries WHERE payment_id='pay_A2'; RAISE EXCEPTION 'ledger deleted';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

-- 7. Creators cannot call money-moving functions or see payer identity; payouts are balance-checked.
SELECT pg_temp.as_user('11111111-1111-1111-1111-111111111111');
DO $$ BEGIN
  BEGIN PERFORM public.sl_record_payment_capture('pay_X','order_X','11111111-1111-1111-1111-111111111111','text',100,'INR',0,0,'upi',NULL,'x',NULL,now());
        RAISE EXCEPTION 'creator forged a capture'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM viewer_user_id FROM public.payments; RAISE EXCEPTION 'creator saw viewer_user_id';
        EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.sl_creator_balance('22222222-2222-2222-2222-222222222222'); RAISE EXCEPTION 'read other balance';
        EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT count(*) FROM public.payments) <> 2 THEN RAISE EXCEPTION 'creator payment visibility wrong'; END IF;
  BEGIN PERFORM public.sl_request_payout(17529); RAISE EXCEPTION 'overdraw accepted';
        EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN PERFORM public.sl_request_payout(100); RAISE EXCEPTION 'below-minimum accepted';
        EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM public.sl_request_payout(17528);
  BEGIN PERFORM public.sl_request_payout(50000); RAISE EXCEPTION 'double spend accepted';
        EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.payouts (creator_id, amount_paise) VALUES (auth.uid(), 999999); RAISE EXCEPTION 'direct payout insert';
        EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- Creator B sees none of A's money.
SELECT pg_temp.as_user('22222222-2222-2222-2222-222222222222');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.payments) + (SELECT count(*) FROM public.ledger_entries) + (SELECT count(*) FROM public.payouts) <> 0
  THEN RAISE EXCEPTION 'B saw A money'; END IF;
  IF (SELECT available_paise FROM public.sl_my_balance()) <> 0 THEN RAISE EXCEPTION 'B balance wrong'; END IF;
END $$;
RESET ROLE;

-- 8. Payout transitions: cannot complete without a provider reference; failed releases balance.
DO $$ DECLARE pid uuid; BEGIN
  SELECT id INTO pid FROM public.payouts LIMIT 1;
  PERFORM public.sl_set_payout_status(pid,'approved',NULL,NULL,'ok');
  PERFORM public.sl_set_payout_status(pid,'processing',NULL,NULL,'sent');
  BEGIN PERFORM public.sl_set_payout_status(pid,'completed',NULL,NULL,'manual'); RAISE EXCEPTION 'completed without provider ref';
  EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM public.sl_set_payout_status(pid,'failed',NULL,NULL,'bank rejected');
  IF (SELECT available_paise FROM public.sl_creator_balance('11111111-1111-1111-1111-111111111111')) <> 17528
  THEN RAISE EXCEPTION 'failed payout did not release balance'; END IF;
  BEGIN PERFORM public.sl_set_payout_status(pid,'completed',NULL,'trf_1','x'); RAISE EXCEPTION 'failed->completed allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
-- 9. Adjustments need an active admin and a reason, and are audited with before/after.
DO $$ BEGIN PERFORM public.sl_admin_adjust_creator('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111',100,'goodwill credit'); RAISE EXCEPTION 'non-admin adjusted';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
INSERT INTO public.admin_users (user_id, role, granted_by) VALUES ('33333333-3333-3333-3333-333333333333','owner','test');
DO $$ BEGIN PERFORM public.sl_admin_adjust_creator('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111',100,'short'); RAISE EXCEPTION 'no-reason adjust';
EXCEPTION WHEN raise_exception THEN NULL; END $$;
SELECT public.sl_admin_adjust_creator('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111',100,'goodwill credit for outage');
SELECT pg_temp.eq('audited', (SELECT count(*)::bigint FROM public.admin_audit_log WHERE action='ledger_adjustment' AND before IS NOT NULL AND after IS NOT NULL), 1);
DO $$ BEGIN UPDATE public.admin_audit_log SET reason='x'; RAISE EXCEPTION 'audit edited';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
\echo 'ledger: ok'

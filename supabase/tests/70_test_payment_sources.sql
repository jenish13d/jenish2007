-- Payment sources (migration 0013): 8% QR fee, 0% external link, ledger isolation.
CREATE OR REPLACE FUNCTION pg_temp.as_user(uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
      EXECUTE 'SET ROLE authenticated'; END $$;
CREATE OR REPLACE FUNCTION pg_temp.eq(label text, got bigint, want bigint) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF got IS DISTINCT FROM want THEN RAISE EXCEPTION '%: got %, want %', label, got, want; END IF; END $$;

-- Earlier test files set their own fee; the migration's value is restored here.
UPDATE public.platform_settings SET platform_fee_bps = 800, gateway_fee_bearer = 'platform', settlement_hold_days = 0;

-- 1. A ₹1,000 QR superchat: ₹80 platform fee, ₹920 creator share, source recorded.
SELECT public.sl_record_payment_capture('pay_Q1','order_Q1','11111111-1111-1111-1111-111111111111','text',
  100000,'INR',2360,360,'upi',NULL,'Asha',NULL,now());
SELECT pg_temp.eq('qr platform fee', (SELECT platform_fee_paise FROM public.payments WHERE id='pay_Q1'), 8000);
SELECT pg_temp.eq('qr creator share', (SELECT creator_share_paise FROM public.payments WHERE id='pay_Q1'), 92000);
SELECT pg_temp.eq('qr bps frozen', (SELECT platform_fee_bps FROM public.payments WHERE id='pay_Q1'), 800);
DO $$ BEGIN IF (SELECT payment_source FROM public.payments WHERE id='pay_Q1') <> 'STREAMLOUNGE_QR' THEN
  RAISE EXCEPTION 'source not recorded'; END IF; END $$;
SELECT pg_temp.eq('ledger sums to gross', (SELECT sum(amount_paise)::bigint FROM public.ledger_entries WHERE payment_id='pay_Q1'), 100000);

-- 2. Historical rows keep the fee in force when captured (no silent rewrite).
SELECT pg_temp.eq('historical bps unchanged', (SELECT platform_fee_bps FROM public.payments WHERE id='pay_A2'), 1000);

-- 3. The ledger table cannot hold an external payment.
DO $$ BEGIN
  INSERT INTO public.payments (id, order_id, creator_id, interaction_type, amount_paise, platform_fee_bps,
    gateway_fee_bearer, platform_fee_paise, creator_share_paise, payment_source)
  VALUES ('pay_X0','order_X0','11111111-1111-1111-1111-111111111111','text',1000,0,'creator',0,1000,'EXTERNAL_RAZORPAY_LINK');
  RAISE EXCEPTION 'external payment entered platform payments';
EXCEPTION WHEN check_violation THEN NULL; END $$;

-- 4. External payments: fee must be 0, and they never touch the creator balance.
CREATE TEMP TABLE before_bal AS SELECT earned_paise FROM public.sl_creator_balance('11111111-1111-1111-1111-111111111111');
INSERT INTO public.external_payments (id, creator_id, amount_paise, verified_via, captured_at)
VALUES ('pay_E1','11111111-1111-1111-1111-111111111111',50000,'creator_webhook',now());
SELECT pg_temp.eq('external does not change ledger balance',
  (SELECT earned_paise FROM public.sl_creator_balance('11111111-1111-1111-1111-111111111111')), (SELECT earned_paise FROM before_bal));
DO $$ BEGIN
  INSERT INTO public.external_payments (id, creator_id, amount_paise, platform_fee_paise, verified_via, captured_at)
  VALUES ('pay_E2','11111111-1111-1111-1111-111111111111',50000,4000,'creator_webhook',now());
  RAISE EXCEPTION 'external commission accepted';
EXCEPTION WHEN check_violation THEN NULL; END $$;

-- 5. Creators see only their own external payments and cannot write them.
SELECT pg_temp.as_user('22222222-2222-2222-2222-222222222222');
SELECT pg_temp.eq('other creator sees none', (SELECT count(*)::bigint FROM public.external_payments), 0);
RESET ROLE;
SELECT pg_temp.as_user('11111111-1111-1111-1111-111111111111');
SELECT pg_temp.eq('owner sees own', (SELECT count(*)::bigint FROM public.external_payments), 1);
DO $$ BEGIN
  INSERT INTO public.external_payments (id, creator_id, amount_paise, verified_via, captured_at)
  VALUES ('pay_E3','11111111-1111-1111-1111-111111111111',1,'creator_webhook',now());
  RAISE EXCEPTION 'creator forged an external payment';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
SELECT pg_temp.eq('summary external gross', (SELECT (public.sl_my_source_summary()->'external'->>'gross_paise')::bigint), 50000);
SELECT pg_temp.eq('summary external fee', (SELECT (public.sl_my_source_summary()->'external'->>'platform_fee_paise')::bigint), 0);
SELECT pg_temp.eq('summary qr bps', (SELECT (public.sl_my_source_summary()->>'qr_fee_bps')::bigint), 800);

-- 6. External link URL is validated; dashboard layout is writable by the owner.
UPDATE public.creator_preferences SET external_payment_url = 'https://rzp.io/l/asha-live' WHERE creator_id = '11111111-1111-1111-1111-111111111111';
DO $$ BEGIN
  UPDATE public.creator_preferences SET external_payment_url = 'javascript:alert(1)' WHERE creator_id = '11111111-1111-1111-1111-111111111111';
  RAISE EXCEPTION 'unsafe external url accepted';
EXCEPTION WHEN check_violation THEN NULL; END $$;
UPDATE public.creator_preferences SET dashboard_layout = '{"order":["earnings","recent"],"hidden":["streams"]}'
 WHERE creator_id = '11111111-1111-1111-1111-111111111111';

-- 7. The creator cannot read or touch webhook secrets.
DO $$ BEGIN PERFORM 1 FROM public.creator_external_webhooks; RAISE EXCEPTION 'secrets readable';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

-- 8. YouTube no longer appears among connections.
SELECT pg_temp.eq('no youtube connection row', (SELECT count(*)::bigint FROM public.sl_my_connections() WHERE platform = 'youtube'), 0);
RESET ROLE;

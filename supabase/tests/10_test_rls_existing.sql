-- RLS / grant tests for the existing schema after migrations 0000-0007.
-- Each block switches role the way PostgREST does and asserts what is visible.
CREATE OR REPLACE FUNCTION pg_temp.as_user(uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  EXECUTE 'SET ROLE authenticated';
END $$;

-- 1. Anonymous visitors see public profiles through the view, and only public ones.
SET ROLE anon; SELECT set_config('request.jwt.claims','{"role":"anon"}',false);
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.public_creator_profiles;
  IF n <> 1 THEN RAISE EXCEPTION 'anon should see exactly 1 public profile, saw %', n; END IF;
END $$;
-- 2. Anonymous visitors cannot read private columns.
DO $$ BEGIN
  BEGIN PERFORM email FROM public.creator_profiles; RAISE EXCEPTION 'anon read email';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM overlay_key FROM public.creator_profiles; RAISE EXCEPTION 'anon read overlay_key';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
-- 3. Anonymous visitors cannot read submissions or insert storage objects into interaction-audio.
DO $$ BEGIN
  BEGIN PERFORM 1 FROM public.creator_submissions; RAISE EXCEPTION 'anon read submissions';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('interaction-audio','11111111-1111-1111-1111-111111111111/x.webm');
    RAISE EXCEPTION 'anon uploaded to interaction-audio without paying';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- 4. Creator B cannot read Creator A's submissions, interactions, or overlay key.
INSERT INTO public.creator_submissions (creator_id, interaction_type, amount, payment_status, metadata)
VALUES ('11111111-1111-1111-1111-111111111111','text',50,'paid','{"razorpay_payment_id":"pay_test_rls"}');
SELECT pg_temp.as_user('22222222-2222-2222-2222-222222222222');
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.creator_submissions; IF n <> 0 THEN RAISE EXCEPTION 'B saw A submissions'; END IF;
  SELECT count(*) INTO n FROM public.creator_interactions; IF n <> 0 THEN RAISE EXCEPTION 'B saw A interactions'; END IF;
  BEGIN PERFORM overlay_key FROM public.creator_profiles; RAISE EXCEPTION 'authenticated read overlay_key';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.creator_profiles SET bio='hacked' WHERE id='11111111-1111-1111-1111-111111111111';
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT bio FROM public.creator_profiles WHERE id='11111111-1111-1111-1111-111111111111') = 'hacked'
  THEN RAISE EXCEPTION 'B updated A profile'; END IF;
END $$;

-- 5. Creator A sees their own submission; existing accounts survived every migration.
SELECT pg_temp.as_user('11111111-1111-1111-1111-111111111111');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.creator_submissions) <> 1 THEN RAISE EXCEPTION 'A cannot see own submission'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.creator_profiles) <> 2 THEN RAISE EXCEPTION 'existing creators lost'; END IF;
  IF (SELECT count(*) FROM public.creator_profiles WHERE overlay_key IS NULL) > 0 THEN RAISE EXCEPTION 'overlay keys not backfilled'; END IF;
  IF (SELECT count(*) FROM public.creator_profiles WHERE email IS NULL) > 0 THEN RAISE EXCEPTION 'emails not backfilled'; END IF;
END $$;
-- 6. A duplicate payment id is rejected at the database level.
DO $$ BEGIN
  INSERT INTO public.creator_submissions (creator_id, interaction_type, amount, payment_status, metadata)
  VALUES ('11111111-1111-1111-1111-111111111111','text',50,'paid','{"razorpay_payment_id":"pay_test_rls"}');
  RAISE EXCEPTION 'duplicate payment accepted';
EXCEPTION WHEN unique_violation THEN NULL; END $$;
DELETE FROM public.creator_submissions WHERE metadata->>'razorpay_payment_id'='pay_test_rls';
\echo 'rls_existing: ok'

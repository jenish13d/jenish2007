CREATE OR REPLACE FUNCTION pg_temp.as_user(uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
      EXECUTE 'SET ROLE authenticated'; END $$;
-- Existing creators got default rows with the 50-character limit.
DO $$ BEGIN
  IF (SELECT count(*) FROM public.creator_preferences WHERE message_max_length = 50) < 2 THEN RAISE EXCEPTION 'backfill missing'; END IF;
END $$;
SELECT pg_temp.as_user('22222222-2222-2222-2222-222222222222');
DO $$ BEGIN
  UPDATE public.creator_preferences SET announcer_muted = true WHERE creator_id = '11111111-1111-1111-1111-111111111111';
  IF (SELECT count(*) FROM public.creator_preferences) <> 1 THEN RAISE EXCEPTION 'B sees other prefs'; END IF;
  BEGIN UPDATE public.creator_preferences SET message_max_length = 5000; RAISE EXCEPTION 'unbounded limit accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.creator_preferences SET creator_id = '11111111-1111-1111-1111-111111111111'; RAISE EXCEPTION 'creator_id changed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.creator_preferences SET announcer_rate = 1.5, leaderboard_opt_in = true, location_country = 'IN';
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT announcer_muted FROM public.creator_preferences WHERE creator_id='11111111-1111-1111-1111-111111111111') THEN RAISE EXCEPTION 'B muted A'; END IF;
END $$;
SET ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM 1 FROM public.creator_preferences; RAISE EXCEPTION 'anon read prefs'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT message_max_length FROM public.get_public_creator_settings('Creator_A')) <> 50 THEN RAISE EXCEPTION 'public settings wrong'; END IF;
  IF EXISTS (SELECT 1 FROM public.get_public_creator_settings('creatorb')) THEN RAISE EXCEPTION 'private creator leaked'; END IF;
END $$;
RESET ROLE;
\echo 'preferences: ok'

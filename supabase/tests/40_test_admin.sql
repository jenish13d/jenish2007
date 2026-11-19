CREATE OR REPLACE FUNCTION pg_temp.as_user(uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
      EXECUTE 'SET ROLE authenticated'; END $$;
-- Signing up with the owner email grants nothing.
INSERT INTO auth.users (id, email) VALUES ('44444444-4444-4444-4444-444444444444','streamlounge.co@gmail.com');
DO $$ BEGIN
  IF public.sl_is_admin('44444444-4444-4444-4444-444444444444') IS NOT NULL THEN RAISE EXCEPTION 'auto-admin on signup'; END IF;
  BEGIN PERFORM public.sl_provision_owner('streamlounge.co@gmail.com','test'); RAISE EXCEPTION 'unverified owner provisioned';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'email not verified%' THEN RAISE; END IF; END;
END $$;
UPDATE auth.users SET email_confirmed_at = now() WHERE id = '44444444-4444-4444-4444-444444444444';
SELECT public.sl_provision_owner('StreamLounge.co@gmail.com','operator');
DO $$ BEGIN IF public.sl_is_admin('44444444-4444-4444-4444-444444444444') <> 'owner' THEN RAISE EXCEPTION 'owner not provisioned'; END IF; END $$;
-- Neither the service role nor a signed-in user can call provisioning or admin analytics.
SET ROLE service_role;
DO $$ BEGIN PERFORM public.sl_provision_owner('creator.a@example.test','x'); RAISE EXCEPTION 'service role provisioned';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
SELECT pg_temp.as_user('11111111-1111-1111-1111-111111111111');
DO $$ BEGIN
  BEGIN PERFORM public.sl_admin_overview(); RAISE EXCEPTION 'creator read overview'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.sl_admin_creators(NULL,10,0); RAISE EXCEPTION 'creator listed creators'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM public.admin_users; RAISE EXCEPTION 'creator read admin_users'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM public.admin_audit_log; RAISE EXCEPTION 'creator read audit'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- Overview and creator rollups compute.
DO $$ DECLARE o jsonb; BEGIN
  o := public.sl_admin_overview();
  IF (o->>'creators_total')::int < 2 THEN RAISE EXCEPTION 'overview wrong: %', o; END IF;
  IF (SELECT count(*) FROM public.sl_admin_creators('creator_a',10,0)) <> 1 THEN RAISE EXCEPTION 'search wrong'; END IF;
  IF (SELECT count(*) FROM public.sl_admin_creators('%',10,0)) <> 0 THEN RAISE EXCEPTION 'wildcard injection in search'; END IF;
END $$;
-- Settings: owner only, reasoned, validated, audited.
DO $$ BEGIN PERFORM public.sl_admin_update_settings('11111111-1111-1111-1111-111111111111','{"platform_fee_bps":0}','creator tries to zero fee'); RAISE EXCEPTION 'non-owner changed settings';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN PERFORM public.sl_admin_update_settings('44444444-4444-4444-4444-444444444444','{"updated_by":"x"}','sneaky column change'); RAISE EXCEPTION 'unknown setting accepted';
EXCEPTION WHEN raise_exception THEN NULL; END $$;
SELECT public.sl_admin_update_settings('44444444-4444-4444-4444-444444444444','{"platform_fee_bps":800}','launch pricing decision');
DO $$ BEGIN IF (SELECT platform_fee_bps FROM public.platform_settings) <> 800 THEN RAISE EXCEPTION 'setting not saved'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_audit_log WHERE action='update_settings' AND (before->>'platform_fee_bps')::int <> 800) THEN RAISE EXCEPTION 'not audited'; END IF; END $$;
-- Heartbeats make sessions; short blips are not streams.
SELECT public.sl_overlay_heartbeat('11111111-1111-1111-1111-111111111111');
DO $$ BEGIN IF (SELECT streams FROM public.sl_stream_stats WHERE creator_id='11111111-1111-1111-1111-111111111111') <> 0 THEN RAISE EXCEPTION 'blip counted as stream'; END IF; END $$;
\echo 'admin: ok'

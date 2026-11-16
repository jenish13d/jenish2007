-- =============================================================================
-- 0002  Overlay keys, atomic queue claiming, updated_at trigger
-- =============================================================================
-- Purpose
--   1. Give each creator a secret, rotatable overlay key so that the OBS
--      endpoint stops being authorised by a public username.
--   2. Move event claiming, stale recovery and completion into SECURITY DEFINER
--      functions that hold the correct locks, instead of multi-statement
--      application logic.
--   3. Maintain updated_at in the database rather than in every call site.
--
-- Why the overlay key
--   /api/overlay/event was keyed on the creator's public username with no
--   secret. Polling it claims the next queued event, so any third party could
--   consume a creator's paid alerts: the viewer is charged, the stream shows
--   nothing, and the caller receives the signed media URLs. A public identifier
--   cannot be a capability.
--
-- Safety
--   Idempotent. Adds a nullable column, backfills it, then enforces NOT NULL
--   only after the backfill. Drops nothing. No existing data is modified
--   beyond the new column.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. overlay_theme (carried forward from the previous docs/sql migration)
-- ---------------------------------------------------------------------------
ALTER TABLE public.creator_profiles
    ADD COLUMN IF NOT EXISTS overlay_theme text DEFAULT 'gold';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'creator_profiles_overlay_theme_check'
    ) THEN
        ALTER TABLE public.creator_profiles
            ADD CONSTRAINT creator_profiles_overlay_theme_check
            CHECK (overlay_theme IN
                   ('emerald','crimson','violet','cyber-blue','gold','rose'));
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. overlay_key
-- ---------------------------------------------------------------------------
ALTER TABLE public.creator_profiles
    ADD COLUMN IF NOT EXISTS overlay_key text;

-- Backfill every existing creator with 32 bytes of randomness, base64url.
-- gen_random_bytes comes from pgcrypto, which Supabase enables by default.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE public.creator_profiles
   SET overlay_key = translate(
           encode(gen_random_bytes(32), 'base64'),
           '+/=', '-_'
       )
 WHERE overlay_key IS NULL;

-- Default for new rows, so a creator is never left without a key.
ALTER TABLE public.creator_profiles
    ALTER COLUMN overlay_key
    SET DEFAULT translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_');

-- Enforce presence and uniqueness only once the backfill has run.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.creator_profiles WHERE overlay_key IS NULL) THEN
        RAISE EXCEPTION
            'overlay_key backfill incomplete; refusing to add NOT NULL';
    END IF;

    ALTER TABLE public.creator_profiles
        ALTER COLUMN overlay_key SET NOT NULL;
EXCEPTION
    WHEN duplicate_object OR invalid_table_definition THEN
        NULL; -- already NOT NULL
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS creator_profiles_overlay_key_key
    ON public.creator_profiles (overlay_key);

COMMENT ON COLUMN public.creator_profiles.overlay_key IS
'Secret credential embedded in the OBS browser-source URL. Authorises polling and claiming this creator''s overlay events. Rotatable. Never exposed through public_creator_profiles.';

-- ---------------------------------------------------------------------------
-- 3. updated_at maintenance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'creator_submissions_touch_updated_at'
    ) THEN
        CREATE TRIGGER creator_submissions_touch_updated_at
            BEFORE UPDATE ON public.creator_submissions
            FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'creator_profiles_touch_updated_at'
    ) THEN
        CREATE TRIGGER creator_profiles_touch_updated_at
            BEFORE UPDATE ON public.creator_profiles
            FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Atomic event claiming
-- ---------------------------------------------------------------------------
-- FOR UPDATE SKIP LOCKED is what makes two concurrent browser sources safe:
-- each takes a different row rather than contending for the same one.
CREATE OR REPLACE FUNCTION public.claim_next_overlay_event(p_creator_id uuid)
RETURNS SETOF public.creator_submissions
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
    UPDATE public.creator_submissions AS cs
       SET status = 'processing'
     WHERE cs.id = (
           SELECT inner_cs.id
             FROM public.creator_submissions AS inner_cs
            WHERE inner_cs.creator_id     = p_creator_id
              AND inner_cs.payment_status = 'paid'
              AND inner_cs.status         = 'pending'
            ORDER BY inner_cs.created_at
            FOR UPDATE SKIP LOCKED
            LIMIT 1
           )
    RETURNING cs.*;
$$;

REVOKE ALL ON FUNCTION public.claim_next_overlay_event(uuid) FROM PUBLIC;
-- Called only by the server with the service-role key. anon and authenticated
-- are deliberately not granted: claiming is not a viewer or creator action.

COMMENT ON FUNCTION public.claim_next_overlay_event(uuid) IS
'Atomically moves the oldest paid+pending submission for a creator to processing and returns it. Uses FOR UPDATE SKIP LOCKED so concurrent pollers never receive the same event.';

-- ---------------------------------------------------------------------------
-- 5. Stale processing recovery
-- ---------------------------------------------------------------------------
-- An OBS source that crashes mid-alert leaves a row in 'processing' forever,
-- which blocks nothing structurally but loses the alert. One retry is allowed,
-- then the row is failed so it stops being reconsidered.
CREATE OR REPLACE FUNCTION public.recover_stale_overlay_events(
    p_creator_id  uuid,
    p_stale_before timestamptz
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_requeued integer := 0;
    v_failed   integer := 0;
BEGIN
    WITH stale AS (
        SELECT cs.id
          FROM public.creator_submissions AS cs
         WHERE cs.creator_id     = p_creator_id
           AND cs.payment_status = 'paid'
           AND cs.status         = 'processing'
           AND cs.updated_at     < p_stale_before
           AND COALESCE((cs.metadata->>'reclaimed_once')::boolean, false) = false
         ORDER BY cs.updated_at
         LIMIT 5
         FOR UPDATE SKIP LOCKED
    )
    UPDATE public.creator_submissions AS cs
       SET status   = 'pending',
           metadata = COALESCE(cs.metadata, '{}'::jsonb)
                      || pg_catalog.jsonb_build_object(
                             'reclaimed_once',    true,
                             'stale_recovery_at', pg_catalog.to_char(
                                 pg_catalog.now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                         )
      FROM stale
     WHERE cs.id = stale.id;

    GET DIAGNOSTICS v_requeued = ROW_COUNT;

    WITH wedged AS (
        SELECT cs.id
          FROM public.creator_submissions AS cs
         WHERE cs.creator_id     = p_creator_id
           AND cs.payment_status = 'paid'
           AND cs.status         = 'processing'
           AND cs.updated_at     < p_stale_before
           AND COALESCE((cs.metadata->>'reclaimed_once')::boolean, false) = true
         ORDER BY cs.updated_at
         LIMIT 5
         FOR UPDATE SKIP LOCKED
    )
    UPDATE public.creator_submissions AS cs
       SET status   = 'failed',
           metadata = COALESCE(cs.metadata, '{}'::jsonb)
                      || pg_catalog.jsonb_build_object(
                             'playback_error',
                             'Processing timed out: the OBS browser source did not report back.')
      FROM wedged
     WHERE cs.id = wedged.id;

    GET DIAGNOSTICS v_failed = ROW_COUNT;

    RETURN v_requeued + v_failed;
END;
$$;

REVOKE ALL ON FUNCTION public.recover_stale_overlay_events(uuid, timestamptz) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 6. Event completion
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_overlay_event(
    p_submission_id  uuid,
    p_next_status    text,
    p_playback_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_updated integer;
BEGIN
    IF p_next_status NOT IN ('completed', 'failed') THEN
        RAISE EXCEPTION 'Invalid overlay completion status: %', p_next_status;
    END IF;

    UPDATE public.creator_submissions AS cs
       SET status   = p_next_status,
           metadata = CASE
                        WHEN p_playback_error IS NULL
                          THEN COALESCE(cs.metadata, '{}'::jsonb)
                        ELSE COALESCE(cs.metadata, '{}'::jsonb)
                             || pg_catalog.jsonb_build_object(
                                   'playback_error',
                                   pg_catalog.left(p_playback_error, 500))
                      END
     WHERE cs.id = p_submission_id
       -- Only a row still in 'processing' may transition. This is the guard
       -- that makes a replayed completion report a no-op.
       AND cs.status = 'processing';

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_overlay_event(uuid, text, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- DROP FUNCTION IF EXISTS public.complete_overlay_event(uuid, text, text);
-- DROP FUNCTION IF EXISTS public.recover_stale_overlay_events(uuid, timestamptz);
-- DROP FUNCTION IF EXISTS public.claim_next_overlay_event(uuid);
-- DROP TRIGGER IF EXISTS creator_submissions_touch_updated_at ON public.creator_submissions;
-- DROP TRIGGER IF EXISTS creator_profiles_touch_updated_at   ON public.creator_profiles;
-- DROP FUNCTION IF EXISTS public.touch_updated_at();
-- DROP INDEX IF EXISTS public.creator_profiles_overlay_key_key;
-- ALTER TABLE public.creator_profiles DROP COLUMN IF EXISTS overlay_key;
-- Leaving overlay_theme in place is intentional: dropping it loses creator
-- settings. Remove it manually only if the column was not present before 0002.

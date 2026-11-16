-- =============================================================================
-- 0004  RLS and storage hardening
-- =============================================================================
-- Purpose
--   Close the access gaps a live audit of the previous deployment found, and
--   lock creator_submissions down now that no cookie-less client needs to
--   write to it.
--
-- READ THIS BEFORE RUNNING
--   Permissive RLS policies are OR-ed together. Adding a strict policy does
--   NOT close a leak while an older permissive policy survives on the same
--   table, command and role. Run supabase/audit/rls_audit.sql first, identify
--   every existing policy by name, and drop the permissive ones. The DROP
--   statements for them are left commented out below because their names are
--   environment-specific and guessing them would either fail or drop the wrong
--   thing.
--
-- Safety
--   Each policy is created only if absent. No table is dropped or recreated and
--   no row data is modified. The one behavioural change to watch is
--   creator_submissions: anon loses all access. That is intended, and the
--   application no longer needs it, but confirm the server has
--   SUPABASE_SERVICE_ROLE_KEY configured before applying, or viewer submissions
--   will begin failing.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. creator_submissions — no anon access at all
-- ---------------------------------------------------------------------------
-- Previously the viewer submission insert and the OBS claim update both ran
-- through a cookie-backed client with no session, i.e. as anon, which means
-- anon held INSERT and UPDATE on this table. Those paths now use the
-- service-role key, so anon needs nothing here.
ALTER TABLE public.creator_submissions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.creator_submissions FROM anon;

DO $$
BEGIN
    -- A creator may read their own submissions. That is the dashboard,
    -- earnings and analytics pages.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename  = 'creator_submissions'
           AND policyname = 'creator_submissions_owner_select'
    ) THEN
        CREATE POLICY creator_submissions_owner_select
            ON public.creator_submissions
            FOR SELECT TO authenticated
            USING (auth.uid() = creator_id);
    END IF;

    -- A creator may NOT insert, update or delete submissions. Submissions are
    -- created only after server-verified payment, and their status is advanced
    -- only by the overlay functions. Granting a creator UPDATE would let them
    -- mark an unpaid submission paid.
END $$;

-- ---------------------------------------------------------------------------
-- 2. soundboard_sounds — fix the cross-creator read leak
-- ---------------------------------------------------------------------------
-- Audit finding: anonymous queries returned enabled=true rows belonging to
-- creators whose public_page_enabled was not true.
ALTER TABLE public.soundboard_sounds ENABLE ROW LEVEL SECURITY;

-- Drop the permissive policy the audit identifies, e.g.:
-- DROP POLICY IF EXISTS "<permissive_select_policy_name>" ON public.soundboard_sounds;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'soundboard_sounds'
           AND policyname = 'soundboard_sounds_anon_public_select'
    ) THEN
        CREATE POLICY soundboard_sounds_anon_public_select
            ON public.soundboard_sounds
            FOR SELECT TO anon
            USING (
                enabled = true
                AND (
                    creator_id IS NULL
                    OR EXISTS (
                        SELECT 1 FROM public.creator_profiles cp
                         WHERE cp.id = soundboard_sounds.creator_id
                           AND cp.public_page_enabled = true
                    )
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'soundboard_sounds'
           AND policyname = 'soundboard_sounds_auth_select'
    ) THEN
        CREATE POLICY soundboard_sounds_auth_select
            ON public.soundboard_sounds
            FOR SELECT TO authenticated
            USING (
                auth.uid() = creator_id
                OR (
                    enabled = true
                    AND (
                        creator_id IS NULL
                        OR EXISTS (
                            SELECT 1 FROM public.creator_profiles cp
                             WHERE cp.id = soundboard_sounds.creator_id
                               AND cp.public_page_enabled = true
                        )
                    )
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'soundboard_sounds'
           AND policyname = 'soundboard_sounds_owner_insert'
    ) THEN
        CREATE POLICY soundboard_sounds_owner_insert
            ON public.soundboard_sounds
            FOR INSERT TO authenticated
            WITH CHECK (creator_id IS NOT NULL AND auth.uid() = creator_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'soundboard_sounds'
           AND policyname = 'soundboard_sounds_owner_update'
    ) THEN
        CREATE POLICY soundboard_sounds_owner_update
            ON public.soundboard_sounds
            FOR UPDATE TO authenticated
            USING (auth.uid() = creator_id)
            WITH CHECK (auth.uid() = creator_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'soundboard_sounds'
           AND policyname = 'soundboard_sounds_owner_delete'
    ) THEN
        CREATE POLICY soundboard_sounds_owner_delete
            ON public.soundboard_sounds
            FOR DELETE TO authenticated
            USING (auth.uid() = creator_id);
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. creator_interactions — owner only; viewers read via the RPC
-- ---------------------------------------------------------------------------
ALTER TABLE public.creator_interactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.creator_interactions FROM anon;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'creator_interactions'
           AND policyname = 'creator_interactions_owner_isolation'
    ) THEN
        CREATE POLICY creator_interactions_owner_isolation
            ON public.creator_interactions
            FOR ALL TO authenticated
            USING (auth.uid() = creator_id)
            WITH CHECK (auth.uid() = creator_id);
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. creator_profiles — owner isolation, and overlay_key stays secret
-- ---------------------------------------------------------------------------
ALTER TABLE public.creator_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'creator_profiles'
           AND policyname = 'creator_profiles_owner_select'
    ) THEN
        CREATE POLICY creator_profiles_owner_select
            ON public.creator_profiles
            FOR SELECT TO authenticated
            USING (auth.uid() = id OR public_page_enabled = true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'creator_profiles'
           AND policyname = 'creator_profiles_owner_update'
    ) THEN
        CREATE POLICY creator_profiles_owner_update
            ON public.creator_profiles
            FOR UPDATE TO authenticated
            USING (auth.uid() = id)
            WITH CHECK (auth.uid() = id);
    END IF;
END $$;

-- An authenticated creator visiting another creator's public page evaluates
-- this table's RLS, because public_creator_profiles uses security_invoker. The
-- SELECT policy above therefore exposes every column of a public profile to any
-- signed-in user, including email and overlay_key. Column grants close that.
REVOKE SELECT (email, overlay_key) ON public.creator_profiles FROM authenticated;
-- NOTE: no blanket "REVOKE ALL ... FROM anon" here. public_creator_profiles
-- is a security_invoker view, so anon needs column-level SELECT on the public
-- columns of this table for public pages to work. The live project grants
-- exactly those columns (see 0000_live_schema_alignment.sql); a blanket revoke
-- removed them and broke every public creator page.

-- anon reads public profiles exclusively through the view.
GRANT SELECT ON public.public_creator_profiles TO anon, authenticated;

-- Confirm the view does not select overlay_key or email. If it does, recreate
-- it without them — the audit script prints its definition.
DO $$
DECLARE
    v_definition text;
BEGIN
    SELECT pg_get_viewdef(c.oid, true) INTO v_definition
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'public_creator_profiles';

    IF v_definition IS NULL THEN
        RAISE WARNING
            'public_creator_profiles view not found; create it before serving public pages';
    ELSIF v_definition ILIKE '%overlay_key%' OR v_definition ILIKE '%email%' THEN
        RAISE EXCEPTION
            'public_creator_profiles exposes overlay_key or email; recreate the view without them before continuing';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. creator_youtube_tokens — OAuth refresh tokens, owner only
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.creator_youtube_tokens (
    creator_id    uuid PRIMARY KEY
                  REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
    access_token  text,
    refresh_token text,
    expires_at    timestamptz,
    updated_at    timestamptz DEFAULT now()
);

ALTER TABLE public.creator_youtube_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.creator_youtube_tokens FROM anon;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE tablename = 'creator_youtube_tokens'
           AND policyname = 'creator_tokens_isolation'
    ) THEN
        CREATE POLICY creator_tokens_isolation
            ON public.creator_youtube_tokens
            FOR ALL TO authenticated
            USING (auth.uid() = creator_id)
            WITH CHECK (auth.uid() = creator_id);
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. interaction_pricing — read-only reference data
-- ---------------------------------------------------------------------------
ALTER TABLE public.interaction_pricing ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'interaction_pricing'
           AND policyname = 'interaction_pricing_read_all'
    ) THEN
        CREATE POLICY interaction_pricing_read_all
            ON public.interaction_pricing
            FOR SELECT TO anon, authenticated
            USING (true);
    END IF;
END $$;

REVOKE INSERT, UPDATE, DELETE ON public.interaction_pricing FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Storage policies
-- ---------------------------------------------------------------------------
-- Audit finding: anon could call storage.from('interaction-audio').list('') and
-- enumerate top-level folder names, which are creator_id UUIDs.
--
-- Two changes close it:
--   a) Viewers no longer upload directly from the browser. The server issues a
--      signed upload URL scoped to one object path, so anon needs no INSERT on
--      the bucket at all.
--   b) anon gets no SELECT, so listing returns nothing. Playback uses
--      server-minted signed URLs, which do not consult RLS.
--
-- Review the existing policies with the audit script and drop the permissive
-- ones before relying on these.

DO $$
BEGIN
    -- A creator may read and manage objects under their own folder.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'storage' AND tablename = 'objects'
           AND policyname = 'interaction_audio_owner_access'
    ) THEN
        CREATE POLICY interaction_audio_owner_access
            ON storage.objects
            FOR SELECT TO authenticated
            USING (
                bucket_id = 'interaction-audio'
                AND (storage.foldername(name))[1] = auth.uid()::text
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'storage' AND tablename = 'objects'
           AND policyname = 'soundboard_audio_owner_write'
    ) THEN
        CREATE POLICY soundboard_audio_owner_write
            ON storage.objects
            FOR INSERT TO authenticated
            WITH CHECK (
                bucket_id = 'soundboard-audio'
                AND (storage.foldername(name))[1] = auth.uid()::text
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'storage' AND tablename = 'objects'
           AND policyname = 'soundboard_audio_owner_select'
    ) THEN
        CREATE POLICY soundboard_audio_owner_select
            ON storage.objects
            FOR SELECT TO authenticated
            USING (
                bucket_id = 'soundboard-audio'
                AND (storage.foldername(name))[1] = auth.uid()::text
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'storage' AND tablename = 'objects'
           AND policyname = 'soundboard_audio_owner_delete'
    ) THEN
        CREATE POLICY soundboard_audio_owner_delete
            ON storage.objects
            FOR DELETE TO authenticated
            USING (
                bucket_id = 'soundboard-audio'
                AND (storage.foldername(name))[1] = auth.uid()::text
            );
    END IF;
END $$;

-- Verify bucket privacy. soundboard-audio and interaction-audio must stay
-- private: playback is by signed URL only.
DO $$
DECLARE
    v_public_buckets text;
BEGIN
    SELECT string_agg(id, ', ')
      INTO v_public_buckets
      FROM storage.buckets
     WHERE id IN ('soundboard-audio', 'interaction-audio')
       AND public = true;

    IF v_public_buckets IS NOT NULL THEN
        RAISE EXCEPTION
            'Buckets must not be public: %. Set public = false before continuing.',
            v_public_buckets;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- Dropping these policies re-opens the audited leaks. Restore the previous
-- permissive policies by name from the audit output captured before applying,
-- rather than by dropping these and leaving the tables with no policy at all —
-- with RLS enabled and no policy, legitimate creator access breaks too.

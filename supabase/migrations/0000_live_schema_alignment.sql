-- =============================================================================
-- 0000  Align the database with what the application code reads and writes
-- =============================================================================
-- Run this FIRST, before 0001-0007.
--
-- The code reads and writes three creator_profiles columns that no other
-- migration creates:
--   email                 written by the sign-up trigger in 0006
--   audio_upload_enabled  read by /api/interactions and /api/uploads/audio-ticket
--   twitter_url           read and written by /api/creator/profile
-- Without them, viewer submissions, voice-note uploads, the dashboard profile
-- and (after 0006) every sign-up fail with "column does not exist".
--
-- The live project protects creator_profiles with column-level grants rather
-- than table-level ones. New columns get no grant by default, so the columns a
-- creator edits from the dashboard are granted here explicitly. email and
-- overlay_key are deliberately NOT granted to any client role.
--
-- It also removes a storage policy that let anyone upload straight into the
-- interaction-audio bucket. Viewer voice notes are uploaded through signed
-- upload URLs issued by /api/uploads/audio-ticket after payment, which need no
-- client policy; the open policy only allowed unpaid uploads.
--
-- Safety: idempotent. Adds columns and grants; drops one storage policy.
-- =============================================================================

ALTER TABLE public.creator_profiles
    ADD COLUMN IF NOT EXISTS email text,
    ADD COLUMN IF NOT EXISTS audio_upload_enabled boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS twitter_url text;

-- Backfill email for creators who signed up before the trigger wrote it.
UPDATE public.creator_profiles p
   SET email = u.email
  FROM auth.users u
 WHERE u.id = p.id
   AND p.email IS NULL;

GRANT SELECT (audio_upload_enabled, twitter_url)
    ON public.creator_profiles TO authenticated;
GRANT UPDATE (audio_upload_enabled, twitter_url)
    ON public.creator_profiles TO authenticated;

DROP POLICY IF EXISTS sl_interaction_audio_viewer_upload ON storage.objects;

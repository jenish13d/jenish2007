-- =============================================================================
-- 0006  Create a creator profile on signup
-- =============================================================================
-- Purpose
--   Guarantee that every authenticated user has a `creator_profiles` row.
--
-- Why
--   The signup page calls `supabase.auth.signUp` and nothing else. If the live
--   project has no trigger doing this, a brand-new creator signs in to a
--   dashboard with no profile, and every page that reads their profile shows an
--   error. If the project DOES already have such a trigger, this one is
--   harmless — see below.
--
-- Safety
--   Idempotent, and safe alongside an existing equivalent trigger: the insert
--   is ON CONFLICT DO NOTHING against the primary key, so whichever trigger
--   runs second is a no-op. Nothing is dropped and no existing row is modified.
--
-- Pre-flight
--   List the triggers already on auth.users before applying, so you know what
--   you are adding to:
--
--     SELECT tgname, pg_get_triggerdef(oid)
--       FROM pg_trigger
--      WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal;
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_creator_profile_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.creator_profiles (id, email, creator_name)
    VALUES (
        NEW.id,
        NEW.email,
        -- The signup form passes creator_name through to user metadata.
        -- Falling back to the email local part means the dashboard always has
        -- something to display.
        COALESCE(
            NULLIF(pg_catalog.btrim(NEW.raw_user_meta_data->>'creator_name'), ''),
            pg_catalog.split_part(NEW.email, '@', 1)
        )
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'streamlounge_create_creator_profile'
           AND tgrelid = 'auth.users'::regclass
    ) THEN
        CREATE TRIGGER streamlounge_create_creator_profile
            AFTER INSERT ON auth.users
            FOR EACH ROW
            EXECUTE FUNCTION public.create_creator_profile_for_new_user();
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Backfill: existing users with no profile row
-- ---------------------------------------------------------------------------
INSERT INTO public.creator_profiles (id, email, creator_name)
SELECT
    u.id,
    u.email,
    COALESCE(
        NULLIF(btrim(u.raw_user_meta_data->>'creator_name'), ''),
        split_part(u.email, '@', 1)
    )
  FROM auth.users AS u
  LEFT JOIN public.creator_profiles AS cp ON cp.id = u.id
 WHERE cp.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Seed the platform pricing floor, if it is empty
-- ---------------------------------------------------------------------------
-- The application falls back to the values in lib/interactions/registry.ts when
-- a row is missing, and logs that it did. Seeding keeps the database as the
-- source of truth. Existing rows are left untouched.
INSERT INTO public.interaction_pricing (interaction_type, minimum_price)
VALUES
    ('text',       10),
    ('audio',      20),
    ('soundboard', 15),
    ('stickers',   30),
    ('spin_wheel', 25),
    ('tasks',      25)
ON CONFLICT (interaction_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- DROP TRIGGER IF EXISTS streamlounge_create_creator_profile ON auth.users;
-- DROP FUNCTION IF EXISTS public.create_creator_profile_for_new_user();
-- The backfilled profile rows and seeded pricing are left in place: deleting
-- them would remove real creator accounts and pricing configuration.

-- =============================================================================
-- 0009  Creator preferences: Manage Interactions, announcer, overlay, LoungeBoard
-- =============================================================================
-- One validated row per creator, instead of more untyped keys in
-- creator_interactions.settings. Every value has a database-level bound, and
-- the API additionally enforces the owner-configurable message-length bounds
-- in platform_settings.
--
-- Safety: additive. Backfills a default row for every existing creator.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.creator_preferences (
  creator_id              uuid PRIMARY KEY REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  message_max_length      integer NOT NULL DEFAULT 50  CHECK (message_max_length BETWEEN 10 AND 500),
  -- Alerts
  alert_duration_ms       integer NOT NULL DEFAULT 8000 CHECK (alert_duration_ms BETWEEN 3000 AND 30000),
  alert_position          text    NOT NULL DEFAULT 'top-center'
                          CHECK (alert_position IN ('top-left','top-center','top-right','center','bottom-left','bottom-center','bottom-right')),
  show_amount             boolean NOT NULL DEFAULT true,
  show_sender             boolean NOT NULL DEFAULT true,
  animated_alerts_enabled boolean NOT NULL DEFAULT true,
  sound_alerts_enabled    boolean NOT NULL DEFAULT true,
  emoji_reactions_enabled boolean NOT NULL DEFAULT true,
  -- Automatic announcer (TTS)
  announcer_enabled       boolean NOT NULL DEFAULT true,
  announcer_muted         boolean NOT NULL DEFAULT false,   -- emergency mute
  announcer_voice         text    NOT NULL DEFAULT 'default' CHECK (length(announcer_voice) <= 40),
  announcer_rate          numeric(3,2) NOT NULL DEFAULT 1.00 CHECK (announcer_rate BETWEEN 0.50 AND 2.00),
  announcer_volume        numeric(3,2) NOT NULL DEFAULT 1.00 CHECK (announcer_volume BETWEEN 0.00 AND 1.00),
  announcer_read_emojis   boolean NOT NULL DEFAULT true,
  announcer_read_message  boolean NOT NULL DEFAULT true,
  announcer_min_paise     bigint  NOT NULL DEFAULT 0 CHECK (announcer_min_paise >= 0),
  -- Per streaming tool overlay tweaks (OBS / Streamlabs / StreamYard); small JSON only.
  overlay_overrides       jsonb   NOT NULL DEFAULT '{}'::jsonb
                          CHECK (jsonb_typeof(overlay_overrides) = 'object' AND pg_column_size(overlay_overrides) < 4096),
  -- LoungeBoard: hidden unless the creator opts in; coarse locations only.
  leaderboard_opt_in      boolean NOT NULL DEFAULT false,
  location_city           text CHECK (length(location_city) <= 60),
  location_district       text CHECK (length(location_district) <= 60),
  location_state          text CHECK (length(location_state) <= 60),
  location_country        text CHECK (location_country ~ '^[A-Z]{2}$'),
  location_continent      text CHECK (location_continent IN ('AF','AN','AS','EU','NA','OC','SA')),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.creator_preferences (creator_id)
SELECT id FROM public.creator_profiles ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.sl_create_creator_preferences() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.creator_preferences (creator_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sl_create_creator_preferences() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS creator_profiles_create_preferences ON public.creator_profiles;
CREATE TRIGGER creator_profiles_create_preferences AFTER INSERT ON public.creator_profiles
  FOR EACH ROW EXECUTE FUNCTION public.sl_create_creator_preferences();

ALTER TABLE public.creator_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.creator_preferences FROM anon, authenticated;
DROP POLICY IF EXISTS creator_preferences_owner_select ON public.creator_preferences;
DROP POLICY IF EXISTS creator_preferences_owner_update ON public.creator_preferences;
CREATE POLICY creator_preferences_owner_select ON public.creator_preferences FOR SELECT TO authenticated
  USING (creator_id = (SELECT auth.uid()));
CREATE POLICY creator_preferences_owner_update ON public.creator_preferences FOR UPDATE TO authenticated
  USING (creator_id = (SELECT auth.uid())) WITH CHECK (creator_id = (SELECT auth.uid()));
GRANT SELECT ON public.creator_preferences TO authenticated;
GRANT UPDATE (message_max_length, alert_duration_ms, alert_position, show_amount, show_sender,
  animated_alerts_enabled, sound_alerts_enabled, emoji_reactions_enabled, announcer_enabled,
  announcer_muted, announcer_voice, announcer_rate, announcer_volume, announcer_read_emojis,
  announcer_read_message, announcer_min_paise, overlay_overrides, leaderboard_opt_in,
  location_city, location_district, location_state, location_country, location_continent, updated_at)
  ON public.creator_preferences TO authenticated;
GRANT ALL ON public.creator_preferences TO service_role;

-- Public, read-only subset the viewer page needs (no locations, no overlay data).
CREATE OR REPLACE FUNCTION public.get_public_creator_settings(p_username text)
RETURNS TABLE (message_max_length integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT cp2.message_max_length
    FROM public.creator_profiles cp
    JOIN public.creator_preferences cp2 ON cp2.creator_id = cp.id
   WHERE cp.public_page_enabled AND lower(cp.username) = lower(btrim(p_username))
   LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_public_creator_settings(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_creator_settings(text) TO anon, authenticated, service_role;

-- =============================================================================
-- Baseline: the live Supabase schema (project vtkpbwordzzsexqyfuxn) as
-- captured read-only on 2026-11-19, before any repo migration was applied.
--
-- The live project was built from the original StreamLounge docs/sql scripts,
-- not from supabase/migrations. This file reproduces that state so that:
--   * a clean install can be rebuilt as: baseline -> migrations 0000..N
--   * every migration is tested against what production actually has.
--
-- DO NOT run this against the live project: it already has these objects.
-- =============================================================================

CREATE TABLE public.creator_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_name text NOT NULL DEFAULT 'Creator',
  username text UNIQUE,
  bio text DEFAULT '',
  profile_image_url text DEFAULT '',
  banner_image_url text DEFAULT '',
  youtube_connected boolean NOT NULL DEFAULT false,
  youtube_channel_id text DEFAULT '',
  youtube_channel_name text DEFAULT '',
  youtube_handle text DEFAULT '',
  youtube_avatar_url text DEFAULT '',
  youtube_banner_url text DEFAULT '',
  youtube_subscribers bigint NOT NULL DEFAULT 0,
  instagram_url text DEFAULT '',
  youtube_url text DEFAULT '',
  twitch_url text DEFAULT '',
  kick_url text DEFAULT '',
  discord_url text DEFAULT '',
  public_page_enabled boolean NOT NULL DEFAULT false,
  overlay_theme text NOT NULL DEFAULT 'gold'
    CHECK (overlay_theme = ANY (ARRAY['emerald','crimson','violet','cyber-blue','gold','rose'])),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.creator_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  interaction_type text NOT NULL
    CHECK (interaction_type = ANY (ARRAY['text','audio','soundboard','stickers','spin_wheel','tasks'])),
  enabled boolean NOT NULL DEFAULT false,
  price numeric(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creator_id, interaction_type)
);

CREATE TABLE public.creator_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  interaction_type text NOT NULL
    CHECK (interaction_type = ANY (ARRAY['text','audio','soundboard','stickers','spin_wheel','tasks'])),
  sender_name text DEFAULT 'Anonymous',
  message text DEFAULT '',
  amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status = ANY (ARRAY['pending','paid','failed','refunded'])),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status = ANY (ARRAY['pending','processing','completed','failed'])),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX creator_submissions_razorpay_payment_unique
  ON public.creator_submissions ((metadata->>'razorpay_payment_id'))
  WHERE (metadata->>'razorpay_payment_id') IS NOT NULL;

CREATE TABLE public.interaction_pricing (
  interaction_type text PRIMARY KEY,
  minimum_price numeric(12,2) NOT NULL CHECK (minimum_price >= 0)
);
INSERT INTO public.interaction_pricing VALUES
  ('text',18),('soundboard',28),('spin_wheel',28),('stickers',38),('tasks',48),('audio',58);

CREATE TABLE public.soundboard_sounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  storage_path text NOT NULL,
  image_path text,
  category text DEFAULT 'custom' CHECK (category = ANY (ARRAY['meme','custom','favorite'])),
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.creator_youtube_tokens (
  creator_id uuid PRIMARY KEY REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.creator_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interaction_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soundboard_sounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_youtube_tokens ENABLE ROW LEVEL SECURITY;

CREATE VIEW public.public_creator_profiles WITH (security_invoker=true, security_barrier=true) AS
SELECT id, creator_name, username, bio, profile_image_url, banner_image_url,
       youtube_connected, youtube_channel_id, youtube_channel_name, youtube_handle,
       youtube_avatar_url, youtube_banner_url, youtube_subscribers, instagram_url,
       youtube_url, twitch_url, kick_url, discord_url, public_page_enabled
  FROM public.creator_profiles WHERE public_page_enabled = true;

CREATE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.creator_profiles (id, creator_name)
  VALUES (NEW.id, COALESCE(NULLIF(NEW.raw_user_meta_data->>'creator_name',''),
                           NULLIF(NEW.raw_user_meta_data->>'full_name',''), 'Creator'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE FUNCTION public.is_creator_audio_upload_enabled(p_creator_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.creator_profiles p JOIN public.creator_interactions i ON i.creator_id = p.id
                  WHERE p.id::text = p_creator_id AND p.public_page_enabled AND i.interaction_type='audio' AND i.enabled) $$;

-- Functionally equivalent to the live get_public_interactions (replaced by 0005).
CREATE FUNCTION public.get_public_interactions(p_username text)
RETURNS TABLE(interaction_type text, price numeric, enabled boolean, tasks jsonb, options jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  IF p_username IS NULL OR btrim(p_username) = '' THEN RETURN; END IF;
  SELECT cp.id INTO v_id FROM public.creator_profiles cp
   WHERE lower(cp.username) = lower(btrim(p_username)) AND cp.public_page_enabled;
  IF v_id IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT ci.interaction_type, ci.price, ci.enabled, '[]'::jsonb, '[]'::jsonb
    FROM public.creator_interactions ci WHERE ci.creator_id = v_id AND ci.enabled ORDER BY ci.interaction_type;
END $$;

-- Policies (as live)
CREATE POLICY creator_profiles_public_select ON public.creator_profiles FOR SELECT TO anon, authenticated USING (public_page_enabled = true);
CREATE POLICY creator_profiles_owner_select ON public.creator_profiles FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
CREATE POLICY creator_profiles_owner_update ON public.creator_profiles FOR UPDATE TO authenticated USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY creator_interactions_owner_all ON public.creator_interactions FOR ALL TO authenticated USING (creator_id = (SELECT auth.uid())) WITH CHECK (creator_id = (SELECT auth.uid()));
CREATE POLICY creator_submissions_owner_select ON public.creator_submissions FOR SELECT TO authenticated USING (creator_id = (SELECT auth.uid()));
CREATE POLICY interaction_pricing_public_select ON public.interaction_pricing FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY sl_global_sound_presets_read ON public.soundboard_sounds FOR SELECT TO authenticated USING (creator_id IS NULL AND enabled = true);
CREATE POLICY soundboard_sounds_public_select ON public.soundboard_sounds FOR SELECT TO anon, authenticated
  USING (enabled AND creator_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.creator_profiles p WHERE p.id = soundboard_sounds.creator_id AND p.public_page_enabled));
CREATE POLICY soundboard_sounds_owner_all ON public.soundboard_sounds FOR ALL TO authenticated USING (creator_id = (SELECT auth.uid())) WITH CHECK (creator_id = (SELECT auth.uid()));

-- Grants (as live: column-level on creator_profiles)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
GRANT SELECT ON public.public_creator_profiles TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_interactions TO authenticated;
GRANT SELECT ON public.creator_submissions TO authenticated;
GRANT SELECT ON public.interaction_pricing TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.soundboard_sounds TO authenticated;
GRANT SELECT ON public.soundboard_sounds TO anon;
GRANT SELECT (id, creator_name, username, bio, profile_image_url, banner_image_url, youtube_connected,
  youtube_channel_id, youtube_channel_name, youtube_handle, youtube_avatar_url, youtube_banner_url,
  youtube_subscribers, instagram_url, youtube_url, twitch_url, kick_url, discord_url, public_page_enabled)
  ON public.creator_profiles TO anon;
GRANT SELECT (id, creator_name, username, bio, profile_image_url, banner_image_url, youtube_connected,
  youtube_channel_id, youtube_channel_name, youtube_handle, youtube_avatar_url, youtube_banner_url,
  youtube_subscribers, instagram_url, youtube_url, twitch_url, kick_url, discord_url, public_page_enabled,
  overlay_theme, created_at, updated_at) ON public.creator_profiles TO authenticated;
GRANT UPDATE (banner_image_url, bio, creator_name, discord_url, instagram_url, kick_url, overlay_theme,
  profile_image_url, public_page_enabled, twitch_url, updated_at, username, youtube_url)
  ON public.creator_profiles TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT EXECUTE ON FUNCTION public.get_public_interactions(text), public.is_creator_audio_upload_enabled(text) TO anon, authenticated;

-- Storage (as live)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
 ('soundboard-audio','soundboard-audio',false,10485760,ARRAY['audio/mpeg','audio/mp3','audio/wav','audio/ogg','audio/webm','audio/mp4']),
 ('soundboard-images','soundboard-images',false,5242880,ARRAY['image/jpeg','image/png','image/webp','image/gif']),
 ('interaction-audio','interaction-audio',false,10485760,ARRAY['audio/webm','audio/ogg','audio/mpeg','audio/wav','audio/mp4']);
CREATE POLICY sl_interaction_audio_viewer_upload ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'interaction-audio' AND array_length(storage.foldername(name),1) >= 1
              AND public.is_creator_audio_upload_enabled((storage.foldername(name))[1]));
CREATE POLICY sl_soundboard_images_public_read ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'soundboard-images' AND EXISTS (SELECT 1 FROM public.soundboard_sounds s JOIN public.creator_profiles p ON p.id = s.creator_id
          WHERE s.image_path = objects.name AND s.enabled AND p.public_page_enabled));
CREATE POLICY sl_soundboard_images_owner_all ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'soundboard-images' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'soundboard-images' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY sl_soundboard_audio_owner_all ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'soundboard-audio' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'soundboard-audio' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

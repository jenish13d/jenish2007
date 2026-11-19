-- Two creators shaped like the two real production accounts (no real data).
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
 ('11111111-1111-1111-1111-111111111111','creator.a@example.test','{"creator_name":"Creator A"}'),
 ('22222222-2222-2222-2222-222222222222','creator.b@example.test','{"creator_name":"Creator B"}');
UPDATE public.creator_profiles SET username='creator_a', public_page_enabled=true WHERE id='11111111-1111-1111-1111-111111111111';
UPDATE public.creator_profiles SET username='creatorb', public_page_enabled=false WHERE id='22222222-2222-2222-2222-222222222222';
INSERT INTO public.creator_interactions (creator_id, interaction_type, enabled, price) VALUES
 ('11111111-1111-1111-1111-111111111111','text',true,50),
 ('11111111-1111-1111-1111-111111111111','audio',true,100);

-- =============================================================================
-- 0007  Private bucket for generated AI stickers
-- =============================================================================
-- /api/stickers/generate used to return the image to the viewer's browser only.
-- Nothing stored it, so the OBS overlay had no image to show for a paid
-- sticker. The route now uploads each image to this bucket at
-- '<creator_id>/<razorpay_payment_id>.png', and the overlay receives a
-- short-lived signed URL for it.
--
-- No storage policies are created: anon and authenticated get no access, and
-- only the server (service role) reads or writes this bucket.
--
-- Safety: idempotent. Creates or tightens one bucket; touches no other data.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('sticker-images', 'sticker-images', false, 8388608, ARRAY['image/png'])
ON CONFLICT (id) DO UPDATE
   SET public             = false,
       file_size_limit    = EXCLUDED.file_size_limit,
       allowed_mime_types = EXCLUDED.allowed_mime_types;

-- =============================================================================
-- 0003  Single-use ledger for paid AI generations
-- =============================================================================
-- Purpose
--   Make a payment redeemable for exactly one billable AI generation.
--
-- The hole this closes
--   /api/stickers/generate accepted a payment token and generated an image,
--   with no record that the payment had been spent. A payment token is valid
--   for 15 minutes, so one ₹30 payment could be replayed for as many DALL-E
--   images as fit in that window — each one billed to the platform's OpenAI
--   account. /api/tts had no payment check at all.
--
--   Rate limiting alone does not fix this: an in-process limiter is per
--   instance, and the attacker controls request timing. A uniqueness constraint
--   in the database is the only bound that holds.
--
-- Safety
--   Idempotent. Creates one new table. Touches no existing data.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ai_generation_claims (
    razorpay_payment_id text        NOT NULL,
    kind                text        NOT NULL,
    creator_id          uuid        NOT NULL
                                    REFERENCES public.creator_profiles(id)
                                    ON DELETE CASCADE,
    created_at          timestamptz NOT NULL DEFAULT now(),

    -- One claim per payment per kind. A viewer who paid for a sticker gets one
    -- image; the text-to-speech rendering of that same submission is a separate
    -- kind and so is permitted once as well.
    CONSTRAINT ai_generation_claims_pkey
        PRIMARY KEY (razorpay_payment_id, kind),
    CONSTRAINT ai_generation_claims_kind_check
        CHECK (kind IN ('stickers', 'tts'))
);

COMMENT ON TABLE public.ai_generation_claims IS
'Single-use ledger: one row per (payment, generation kind). Inserted before the billable upstream call, so a replayed payment token hits the primary key instead of the OpenAI account.';

-- Operational housekeeping: claims older than a day are only of audit interest.
CREATE INDEX IF NOT EXISTS ai_generation_claims_created_at_idx
    ON public.ai_generation_claims (created_at);

-- No RLS policies are defined, and RLS is enabled, so anon and authenticated
-- have no access at all. The table is written exclusively by the server with
-- the service-role key.
ALTER TABLE public.ai_generation_claims ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ai_generation_claims FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Claim function
-- ---------------------------------------------------------------------------
-- Returns true when this call won the claim, false when it was already taken.
-- The ON CONFLICT DO NOTHING plus RETURNING makes the check and the insert one
-- atomic statement, so two concurrent requests cannot both win.
CREATE OR REPLACE FUNCTION public.claim_ai_generation(
    p_razorpay_payment_id text,
    p_kind                text,
    p_creator_id          uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_inserted integer;
BEGIN
    IF p_kind NOT IN ('stickers', 'tts') THEN
        RAISE EXCEPTION 'Unknown AI generation kind: %', p_kind;
    END IF;

    INSERT INTO public.ai_generation_claims
        (razorpay_payment_id, kind, creator_id)
    VALUES
        (p_razorpay_payment_id, p_kind, p_creator_id)
    ON CONFLICT (razorpay_payment_id, kind) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RETURN v_inserted = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ai_generation(text, text, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- DROP FUNCTION IF EXISTS public.claim_ai_generation(text, text, uuid);
-- DROP TABLE IF EXISTS public.ai_generation_claims;

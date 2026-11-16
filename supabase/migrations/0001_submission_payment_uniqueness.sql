-- =============================================================================
-- 0001  Submission payment uniqueness
-- =============================================================================
-- Purpose
--   Make it impossible for one Razorpay payment to produce two paid
--   submissions, under concurrency, at the database level.
--
-- Why this is the only real fix
--   The application previously selected for an existing submission and then
--   inserted. Two requests that arrive together both see no existing row and
--   both insert. Only a unique index decides the race.
--
-- Safety
--   Idempotent. Creates nothing destructively and drops nothing.
--   CONCURRENTLY is deliberately NOT used so the statement can run inside the
--   Supabase SQL editor's implicit transaction. On a large existing table,
--   prefer running the CREATE INDEX CONCURRENTLY variant noted at the bottom
--   outside a transaction instead.
--
-- Pre-flight
--   This index creation FAILS if duplicates already exist. Run the duplicate
--   report below first and resolve any rows it returns.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Pre-flight: existing duplicate payments. Expect zero rows.
-- ---------------------------------------------------------------------------
-- SELECT metadata->>'razorpay_payment_id' AS payment_id,
--        count(*)                         AS submissions,
--        array_agg(id ORDER BY created_at) AS submission_ids
--   FROM public.creator_submissions
--  WHERE metadata->>'razorpay_payment_id' IS NOT NULL
--  GROUP BY 1
-- HAVING count(*) > 1;

-- ---------------------------------------------------------------------------
-- The constraint
-- ---------------------------------------------------------------------------
-- Partial, so that rows with no payment id (none should exist going forward)
-- do not collide with one another on NULL.
CREATE UNIQUE INDEX IF NOT EXISTS creator_submissions_razorpay_payment_id_key
    ON public.creator_submissions ((metadata->>'razorpay_payment_id'))
 WHERE metadata->>'razorpay_payment_id' IS NOT NULL;

COMMENT ON INDEX public.creator_submissions_razorpay_payment_id_key IS
'Enforces one submission per Razorpay payment. The application catches 23505 on this index and reports a duplicate rather than inserting a second paid alert.';

-- ---------------------------------------------------------------------------
-- Supporting index for the overlay queue
-- ---------------------------------------------------------------------------
-- The OBS poll reads: creator_id = ? AND payment_status = 'paid'
--                     AND status = 'pending' ORDER BY created_at
-- At one poll per second per live creator this is the hottest query in the
-- application.
CREATE INDEX IF NOT EXISTS creator_submissions_overlay_queue_idx
    ON public.creator_submissions (creator_id, created_at)
 WHERE payment_status = 'paid' AND status = 'pending';

-- Stale-processing recovery scans by status and updated_at.
CREATE INDEX IF NOT EXISTS creator_submissions_processing_idx
    ON public.creator_submissions (creator_id, updated_at)
 WHERE status = 'processing';

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- DROP INDEX IF EXISTS public.creator_submissions_razorpay_payment_id_key;
-- DROP INDEX IF EXISTS public.creator_submissions_overlay_queue_idx;
-- DROP INDEX IF EXISTS public.creator_submissions_processing_idx;

-- ---------------------------------------------------------------------------
-- Large-table alternative (run OUTSIDE a transaction, one statement at a time)
-- ---------------------------------------------------------------------------
-- CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
--     creator_submissions_razorpay_payment_id_key
--     ON public.creator_submissions ((metadata->>'razorpay_payment_id'))
--  WHERE metadata->>'razorpay_payment_id' IS NOT NULL;

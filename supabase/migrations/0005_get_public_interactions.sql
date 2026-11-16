-- ==============================================================================
-- StreamLounge: Secure Public Interaction Access RPC
-- File: supabase/migrations/0005_get_public_interactions.sql
-- Status: Idempotent (CREATE OR REPLACE). Safe to re-run.
--
-- Carried forward from the previous implementation essentially unchanged: this
-- function was the one piece of the original security model that was already
-- correct. It is the ONLY public read path for interaction configuration now --
-- the application's direct-table fallback, which bypassed this function's
-- public-page gate whenever the RPC reported an interaction disabled, has been
-- removed.
--
-- Objective:
-- Safely allow public/anonymous viewers to retrieve only the interaction data
-- required for public creator pages (/[username]), without exposing private
-- creator settings, credentials, internal IDs, or timestamps.
--
-- Hardened Security & Isolation Model:
-- 1. Empty search_path: 'SET search_path = '''' enforces total immunity against
--    search-path hijacking in SECURITY DEFINER contexts. System functions and
--    schema tables are explicitly qualified. Special SQL forms (e.g. COALESCE)
--    and catalog functions (e.g. pg_catalog.btrim) use valid PostgreSQL syntax.
-- 2. Strict Unambiguous Username Resolution (UUID-Safe, No min(uuid)):
--    Because case-insensitive uniqueness on 'creator_profiles.username' cannot
--    be verified from available metadata, the function requires an unambiguous match:
--      a) Priority 1: Exact case match.
--         - If exactly 1 profile matches, verify 'public_page_enabled = true'.
--           If disabled, return no rows immediately (do NOT fall back to another creator).
--         - If more than 1 profile matches exact case -> ambiguous, return no rows.
--      b) Priority 2: If 0 exact matches, attempt case-insensitive match.
--         - If exactly 1 profile matches, verify 'public_page_enabled = true'.
--           If disabled, return no rows.
--         - If 0 or >1 profiles match case-insensitively (e.g. case-only duplicates
--           like 'Aryan' and 'aryan') -> ambiguous, return no rows.
--      c) Interaction rows are queried strictly for the resolved single creator_id.
-- 3. Strict public gate: Only creator profiles with 'public_page_enabled = true'
--    can match. Private or non-existent creators return zero rows.
-- 4. Enabled & allowlisted interactions only:
--    - Filters strictly on 'ci.enabled = true'.
--    - Enforces explicit allowlist of supported public interaction types:
--      ('text', 'audio', 'soundboard', 'stickers', 'spin_wheel', 'tasks').
--      Any internal, draft, or unknown interaction types are rejected.
-- 5. Value-level validation for tasks & options: The raw 'settings' JSONB column is
--    never returned. Legacy objects are supported by extracting only recognized
--    text fields ('task', 'label', 'name', 'text'), but returned values are
--    strictly plain string primitives (no arbitrary JSON objects, nested keys, or
--    internal configs).
-- 6. Strict column allowlist:
--      - interaction_type (text)
--      - price (numeric)
--      - enabled (boolean)
--      - tasks (jsonb array of strings)
--      - options (jsonb array of strings)
-- 7. Least-privilege execution: Execution is explicitly REVOKED from PUBLIC and
--    GRANTED only to 'anon' (unauthenticated viewers) and 'authenticated' roles.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_public_interactions(p_username text)
RETURNS TABLE (
    interaction_type text,
    price numeric,
    enabled boolean,
    tasks jsonb,
    options jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean_username text;
    v_exact_count integer;
    v_ci_count integer;
    v_creator_id uuid;
    v_public_enabled boolean;
BEGIN
    -- Guard: Return empty result set immediately if username parameter is null or blank
    IF p_username IS NULL OR pg_catalog.btrim(p_username) = '' THEN
        RETURN;
    END IF;

    v_clean_username := pg_catalog.btrim(p_username);

    -- Priority 1: Check for exact case matches across all profiles
    SELECT pg_catalog.count(*)
      INTO v_exact_count
      FROM public.creator_profiles cp
     WHERE cp.username = v_clean_username;

    IF v_exact_count = 1 THEN
        -- Exactly one exact match: verify public_page_enabled
        SELECT cp.id, cp.public_page_enabled
          INTO v_creator_id, v_public_enabled
          FROM public.creator_profiles cp
         WHERE cp.username = v_clean_username;

        -- If the matching profile has disabled public page, abort (do NOT fall through to another creator)
        IF v_public_enabled IS NOT TRUE THEN
            RETURN;
        END IF;

    ELSIF v_exact_count > 1 THEN
        -- Multiple profiles share the exact same username -> ambiguous, return no rows
        RETURN;

    ELSE
        -- Priority 2: No exact match found; attempt case-insensitive lookup
        SELECT pg_catalog.count(*)
          INTO v_ci_count
          FROM public.creator_profiles cp
         WHERE pg_catalog.lower(cp.username) = pg_catalog.lower(v_clean_username);

        IF v_ci_count = 1 THEN
            -- Exactly one case-insensitive match: verify public_page_enabled
            SELECT cp.id, cp.public_page_enabled
              INTO v_creator_id, v_public_enabled
              FROM public.creator_profiles cp
             WHERE pg_catalog.lower(cp.username) = pg_catalog.lower(v_clean_username);

            IF v_public_enabled IS NOT TRUE THEN
                RETURN;
            END IF;
        ELSE
            -- Either 0 matches or multiple case-only duplicates -> ambiguous or not found, return no rows
            RETURN;
        END IF;
    END IF;

    -- At this point, v_creator_id is guaranteed to belong to exactly ONE unambiguous public creator
    -- with public_page_enabled = true.
    -- Return sanitized interactions strictly for this single creator.
    RETURN QUERY
    SELECT
        ci.interaction_type::text,
        ci.price::numeric,
        ci.enabled::boolean,
        -- Extract and validate tasks: GUARANTEED JSON array containing only string primitives
        CASE
            WHEN ci.interaction_type = 'tasks'
             AND (
                 pg_catalog.jsonb_typeof(ci.settings->'tasks') = 'array'
                 OR pg_catalog.jsonb_typeof(ci.settings->'options') = 'array'
             )
            THEN COALESCE(
                (
                    SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(cleaned_task.val))
                    FROM (
                        SELECT CASE
                            WHEN pg_catalog.jsonb_typeof(elem) = 'string'
                                THEN pg_catalog.btrim(elem #>> '{}')
                            WHEN pg_catalog.jsonb_typeof(elem) = 'object' AND pg_catalog.jsonb_typeof(elem->'task') = 'string'
                                THEN pg_catalog.btrim(elem->>'task')
                            WHEN pg_catalog.jsonb_typeof(elem) = 'object' AND pg_catalog.jsonb_typeof(elem->'label') = 'string'
                                THEN pg_catalog.btrim(elem->>'label')
                            WHEN pg_catalog.jsonb_typeof(elem) = 'object' AND pg_catalog.jsonb_typeof(elem->'name') = 'string'
                                THEN pg_catalog.btrim(elem->>'name')
                            ELSE NULL
                        END AS val
                        FROM pg_catalog.jsonb_array_elements(
                            CASE
                                WHEN pg_catalog.jsonb_typeof(ci.settings->'tasks') = 'array' THEN ci.settings->'tasks'
                                ELSE ci.settings->'options'
                            END
                        ) AS elem
                    ) cleaned_task
                    WHERE cleaned_task.val IS NOT NULL
                      AND pg_catalog.length(cleaned_task.val) > 0
                ),
                '[]'::jsonb
            )
            ELSE '[]'::jsonb
        END AS tasks,
        -- Extract and validate wheel options: GUARANTEED JSON array containing only string primitives
        CASE
            WHEN ci.interaction_type = 'spin_wheel'
             AND (
                 pg_catalog.jsonb_typeof(ci.settings->'options') = 'array'
                 OR pg_catalog.jsonb_typeof(ci.settings->'segments') = 'array'
             )
            THEN COALESCE(
                (
                    SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(cleaned_opt.val))
                    FROM (
                        SELECT CASE
                            WHEN pg_catalog.jsonb_typeof(elem) = 'string'
                                THEN pg_catalog.btrim(elem #>> '{}')
                            WHEN pg_catalog.jsonb_typeof(elem) = 'object' AND pg_catalog.jsonb_typeof(elem->'label') = 'string'
                                THEN pg_catalog.btrim(elem->>'label')
                            WHEN pg_catalog.jsonb_typeof(elem) = 'object' AND pg_catalog.jsonb_typeof(elem->'name') = 'string'
                                THEN pg_catalog.btrim(elem->>'name')
                            WHEN pg_catalog.jsonb_typeof(elem) = 'object' AND pg_catalog.jsonb_typeof(elem->'text') = 'string'
                                THEN pg_catalog.btrim(elem->>'text')
                            ELSE NULL
                        END AS val
                        FROM pg_catalog.jsonb_array_elements(
                            CASE
                                WHEN pg_catalog.jsonb_typeof(ci.settings->'options') = 'array' THEN ci.settings->'options'
                                ELSE ci.settings->'segments'
                            END
                        ) AS elem
                    ) cleaned_opt
                    WHERE cleaned_opt.val IS NOT NULL
                      AND pg_catalog.length(cleaned_opt.val) > 0
                ),
                '[]'::jsonb
            )
            ELSE '[]'::jsonb
        END AS options
    FROM public.creator_interactions ci
    WHERE ci.creator_id = v_creator_id
      AND ci.enabled = true
      AND ci.interaction_type IN ('text', 'audio', 'soundboard', 'stickers', 'spin_wheel', 'tasks')
    ORDER BY ci.interaction_type;
END;
$$;

-- Revoke default public execution privileges
REVOKE ALL ON FUNCTION public.get_public_interactions(text) FROM PUBLIC;

-- Grant execution to unauthenticated (anon) and authenticated viewers
GRANT EXECUTE ON FUNCTION public.get_public_interactions(text) TO anon, authenticated;

-- Ensure standard administrative ownership for SECURITY DEFINER execution in Supabase
-- Note: In standard Supabase projects, the administrative database role is 'postgres'.
-- If your environment uses a different admin role (e.g. 'supabase_admin'), adjust accordingly.
ALTER FUNCTION public.get_public_interactions(text) OWNER TO postgres;

-- Document function purpose in PostgreSQL catalog
COMMENT ON FUNCTION public.get_public_interactions(text) IS
'Returns sanitized public interaction configuration for an unambiguous public creator. Enforces empty search_path, strict UUID-safe single-creator resolution (returning no rows for ambiguous matches or disabled profiles), enabled and allowlisted interaction filtering, and validates that tasks and options contain only clean string arrays.';

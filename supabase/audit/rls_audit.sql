-- ==============================================================================
-- StreamLounge: Read-Only RLS, Policy, View & Privilege Audit Script
-- File: supabase/audit/rls_audit.sql
-- Status: READ-ONLY INSPECTION QUERIES (SAFE TO RUN IN SUPABASE SQL EDITOR)
--
-- Purpose:
-- Local development credentials (.env.local) contain only the Supabase
-- publishable/anon key, which cannot inspect pg_policies or system catalogs.
-- Run these read-only queries in the Supabase SQL Editor to verify the exact
-- RLS flags, policies, column grants, view options, and SECURITY DEFINER
-- functions currently active in your database.
-- ==============================================================================

-- 1. Check RLS enabled / forced status on all StreamLounge tables
SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
      'creator_profiles',
      'creator_submissions',
      'creator_interactions',
      'soundboard_sounds',
      'creator_youtube_tokens',
      'interaction_pricing',
      'ai_generation_claims'
  )
ORDER BY c.relname;

-- 2. Inspect public views (confirm public_creator_profiles has security_invoker=true and excludes email)
SELECT
    c.relname AS view_name,
    c.reloptions AS view_options,
    pg_get_viewdef(c.oid, true) AS view_definition
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'v'
  AND c.relname = 'public_creator_profiles';

-- 3. Inspect all RLS policies on public tables and storage.objects
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE (schemaname = 'public' AND tablename IN (
    'creator_profiles',
    'creator_submissions',
    'creator_interactions',
    'soundboard_sounds',
    'creator_youtube_tokens',
    'interaction_pricing'
))
   OR (schemaname = 'storage' AND tablename = 'objects')
ORDER BY schemaname, tablename, cmd, policyname;

-- 4. Inspect table-level grants for anon and authenticated
SELECT
    table_schema,
    table_name,
    grantee,
    privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
  AND table_name IN (
      'creator_profiles',
      'public_creator_profiles',
      'creator_submissions',
      'creator_interactions',
      'soundboard_sounds',
      'creator_youtube_tokens',
      'interaction_pricing'
  )
ORDER BY table_name, grantee, privilege_type;

-- 5. Inspect column-level grants on creator_profiles and public_creator_profiles
SELECT
    table_name,
    grantee,
    column_name,
    privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
  AND table_name IN ('creator_profiles', 'public_creator_profiles')
ORDER BY table_name, grantee, column_name, privilege_type;

-- 6. Inspect SECURITY DEFINER functions and execution privileges
SELECT
    n.nspname AS schema_name,
    p.proname AS function_name,
    p.prosecdef AS security_definer,
    p.proconfig AS function_config,
    pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
ORDER BY p.proname;

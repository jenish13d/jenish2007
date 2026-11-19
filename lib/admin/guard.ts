import type { NextResponse } from "next/server";

import { apiError } from "@/lib/http/responses";
import { RATE_LIMITS, clientIdentifier, consume } from "@/lib/security/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export type AdminContext = { userId: string; role: "owner" | "admin" };

/**
 * Server-side gate for every admin endpoint:
 *   1. a signed-in session (cookie, verified by Supabase Auth),
 *   2. an active row in admin_users (provisioned explicitly; never by email),
 *   3. MFA: the session must be at assurance level aal2,
 *   4. optionally, the owner role.
 * Non-admins get a 404 so the panel's existence is not confirmed to them.
 */
export async function requireAdmin(
  request: Request,
  options: { ownerOnly?: boolean } = {},
): Promise<{ ok: true; ctx: AdminContext } | { ok: false; response: NextResponse }> {
  const limit = consume(`admin:${clientIdentifier(request)}`, RATE_LIMITS.admin);
  if (!limit.allowed) {
    return { ok: false, response: apiError("rate_limited", "Slow down.", { retryAfterSeconds: limit.retryAfterSeconds }) };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: apiError("unauthorized", "Sign in first.") };

  const { data: role, error } = await getSupabaseServiceClient().rpc("sl_is_admin", { p_user: user.id });
  if (error) {
    console.error("[admin] role lookup failed:", error.message);
    return { ok: false, response: apiError("internal_error", "Could not verify access.") };
  }
  if (role !== "owner" && role !== "admin") {
    return { ok: false, response: apiError("not_found", "Not found.") };
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") {
    return {
      ok: false,
      response: apiError("forbidden", "Two-factor verification is required for the admin panel.", {
        meta: { mfa_required: true, mfa_enrolled: aal?.nextLevel === "aal2" },
      }),
    };
  }

  if (options.ownerOnly && role !== "owner") {
    return { ok: false, response: apiError("forbidden", "Only the owner can do that.") };
  }
  return { ok: true, ctx: { userId: user.id, role } };
}

export { csvCell } from "./csv.ts";

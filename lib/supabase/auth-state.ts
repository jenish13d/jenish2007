import type { User } from "@supabase/supabase-js";

export type ClientAuth =
  | { status: "signed_in"; user: User }
  | { status: "signed_out" }
  | { status: "error"; message: string };

const SIGNED_OUT_ERRORS = new Set(["AuthSessionMissingError", "AuthInvalidJwtError"]);

export function classifyAuthResult(
  user: User | null | undefined,
  error: { name?: string; status?: number; message?: string } | null | undefined,
): ClientAuth {
  if (user) return { status: "signed_in", user };
  if (!error) return { status: "signed_out" };
  if (SIGNED_OUT_ERRORS.has(error.name ?? "") || error.status === 401 || error.status === 403) {
    return { status: "signed_out" };
  }
  return { status: "error", message: "We couldn't reach the server. Check your connection and try again." };
}


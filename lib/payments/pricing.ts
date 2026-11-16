import type { SupabaseClient } from "@supabase/supabase-js";

import {
  MAX_AMOUNT_RUPEES,
  interactionDefinition,
  type InteractionType,
} from "../interactions/registry.ts";
import type { PublicInteractionRow } from "../db/types.ts";

/**
 * Server-authoritative pricing.
 *
 * Price and availability are resolved from the database on every request, in
 * both order creation and submission insertion, so a tampered client cannot buy
 * a disabled interaction or pay less than the creator's floor.
 */

export interface ResolvedPricing {
  enabled: boolean;
  /** Minimum the viewer may pay, in rupees. */
  minimumRupees: number;
  /** Wheel segments or task list, where the interaction defines them. */
  options: string[];
  tasks: string[];
}

/**
 * Resolves pricing for a public viewer.
 *
 * Reads through the hardened `get_public_interactions` RPC, which enforces the
 * public-page gate, resolves the username unambiguously and returns only an
 * allowlist of columns. The original code called the RPC and then, if the
 * interaction came back disabled, re-read `creator_interactions` directly and
 * used whatever that returned — which both defeated the RPC's public-page gate
 * and meant a disabled interaction could be re-enabled by the fallback. There
 * is no fallback here: the RPC is the only public path.
 */
export async function resolvePublicPricing(
  supabase: SupabaseClient,
  username: string,
  interactionType: InteractionType,
): Promise<ResolvedPricing> {
  const definition = interactionDefinition(interactionType);

  const { data, error } = await supabase.rpc("get_public_interactions", {
    p_username: username,
  });

  if (error) {
    console.error("[pricing] get_public_interactions failed:", error.message);
    return {
      enabled: false,
      minimumRupees: definition.fallbackMinimumPrice,
      options: [],
      tasks: [],
    };
  }

  const rows = (Array.isArray(data) ? data : []) as PublicInteractionRow[];
  const match = rows.find((row) => row.interaction_type === interactionType);

  if (!match || !match.enabled) {
    return {
      enabled: false,
      minimumRupees: definition.fallbackMinimumPrice,
      options: [],
      tasks: [],
    };
  }

  const creatorPrice = Number(match.price);

  return {
    enabled: true,
    // The creator's configured price is the floor. A global minimum from
    // `interaction_pricing` is applied on top by `applyGlobalMinimum`.
    minimumRupees: Number.isFinite(creatorPrice) && creatorPrice > 0
      ? creatorPrice
      : definition.fallbackMinimumPrice,
    options: Array.isArray(match.options) ? match.options : [],
    tasks: Array.isArray(match.tasks) ? match.tasks : [],
  };
}

/**
 * Reads the platform-wide floor for an interaction type.
 *
 * A missing row is not fatal: the registry's fallback is used and the gap is
 * logged, rather than returning a 500 and taking checkout down because one
 * pricing row was never seeded.
 */
export async function globalMinimumRupees(
  supabase: SupabaseClient,
  interactionType: InteractionType,
): Promise<number> {
  const { data, error } = await supabase
    .from("interaction_pricing")
    .select("minimum_price")
    .eq("interaction_type", interactionType)
    .maybeSingle();

  if (error) {
    console.error("[pricing] interaction_pricing read failed:", error.message);
  }

  const value = Number(data?.minimum_price);
  if (Number.isFinite(value) && value > 0) {
    return value;
  }

  if (!error) {
    console.warn(
      `[pricing] no interaction_pricing row for '${interactionType}'; using registry fallback`,
    );
  }
  return interactionDefinition(interactionType).fallbackMinimumPrice;
}

export function effectiveMinimum(
  creatorMinimum: number,
  globalMinimum: number,
): number {
  return Math.max(creatorMinimum, globalMinimum);
}

export type AmountValidation =
  | { valid: true; rupees: number; paise: number }
  | { valid: false; error: string };

/**
 * Validates a viewer-supplied amount.
 *
 * Whole rupees only: Razorpay works in paise, and allowing fractional rupees
 * invites rounding mismatches between the order amount and the amount recorded
 * on the submission.
 */
export function validateAmount(
  amount: unknown,
  minimumRupees: number,
): AmountValidation {
  const numeric = Number(amount);

  if (!Number.isFinite(numeric)) {
    return { valid: false, error: "Enter a valid amount." };
  }
  if (!Number.isInteger(numeric)) {
    return { valid: false, error: "Enter a whole rupee amount." };
  }
  if (numeric <= 0) {
    return { valid: false, error: "Amount must be more than zero." };
  }
  if (numeric < minimumRupees) {
    return { valid: false, error: `The minimum for this is ₹${minimumRupees}.` };
  }
  if (numeric > MAX_AMOUNT_RUPEES) {
    return {
      valid: false,
      error: `Amount cannot exceed ₹${MAX_AMOUNT_RUPEES.toLocaleString("en-IN")}.`,
    };
  }

  return { valid: true, rupees: numeric, paise: numeric * 100 };
}

import { NextResponse } from "next/server";

import { csvCell, requireAdmin } from "@/lib/admin/guard";
import { apiError, withErrorHandling } from "@/lib/http/responses";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const EXPORTS = {
  payments: {
    table: "payments",
    columns: ["id", "order_id", "creator_id", "interaction_type", "display_name", "currency", "amount_paise",
      "platform_fee_paise", "gateway_fee_paise", "creator_share_paise", "refunded_paise", "status", "method", "captured_at"],
    dateColumn: "captured_at",
  },
  payouts: {
    table: "payouts",
    columns: ["id", "creator_id", "amount_paise", "status", "provider", "provider_ref", "failure_reason", "requested_at", "completed_at"],
    dateColumn: "requested_at",
  },
  ledger: {
    table: "ledger_entries",
    columns: ["id", "idempotency_key", "account", "kind", "creator_id", "payment_id", "amount_paise", "available_at", "created_at", "created_by", "note"],
    dateColumn: "created_at",
  },
} as const;

export const GET = withErrorHandling("admin/export", async (request: Request) => {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const url = new URL(request.url);
  const kind = url.searchParams.get("type") as keyof typeof EXPORTS | null;
  const spec = kind ? EXPORTS[kind] : undefined;
  if (!spec) return apiError("bad_request", "Unknown export.");

  let query = getSupabaseServiceClient().from(spec.table).select(spec.columns.join(",")).order(spec.dateColumn, { ascending: true }).limit(50_000);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (from && !Number.isNaN(Date.parse(from))) query = query.gte(spec.dateColumn, new Date(from).toISOString());
  if (to && !Number.isNaN(Date.parse(to))) query = query.lte(spec.dateColumn, new Date(to).toISOString());
  const { data, error } = await query;
  if (error) return apiError("internal_error", "Could not build the export.");

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const csv = [spec.columns.join(","), ...rows.map((row) => spec.columns.map((c) => csvCell(row[c])).join(","))].join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="streamlounge-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});

import { NextResponse } from "next/server";

import { exactIlikePattern } from "@/lib/db/like";
import { serverEnv } from "@/lib/env";
import { qrSvg } from "@/lib/qr/svg";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/qr/<username>  -> SVG QR code for the creator's payment link.
 *
 * Public, because the link it encodes is public. Only generated for creators
 * whose page is public; the encoded URL is built here from the app origin and
 * the stored username, never from request input beyond the lookup.
 */
export const dynamic = "force-dynamic";

const USERNAME = /^[A-Za-z0-9_]{3,30}$/;

export async function GET(request: Request, context: { params: Promise<{ username: string }> }) {
  const { username } = await context.params;
  if (!USERNAME.test(username)) return new NextResponse("Not found", { status: 404 });

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("get_public_creator_settings", { p_username: username });
  if (!Array.isArray(data) || data.length === 0) return new NextResponse("Not found", { status: 404 });

  const { data: profile } = await supabase.from("public_creator_profiles").select("username").ilike("username", exactIlikePattern(username)).maybeSingle();
  const canonical = profile?.username ?? username;
  const url = new URL(request.url);
  const size = Math.max(128, Math.min(2048, Number(url.searchParams.get("size")) || 512));
  const svg = qrSvg(`${serverEnv.appUrl()}/c/${canonical}`, { size, dark: "#0A2137", light: "#FFFFFF" });

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      ...(url.searchParams.get("download") === "1"
        ? { "Content-Disposition": `attachment; filename="streamlounge-${canonical}-qr.svg"` }
        : {}),
    },
  });
}

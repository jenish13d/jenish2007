import crypto from "node:crypto";

import { serverEnv } from "../env.ts";
import { openNullable, sealNullable, sealToken } from "../security/token-crypto.ts";
import { getSupabaseServiceClient } from "../supabase/service.ts";

/**
 * Twitch and Kick account connections (OAuth 2.0 authorization-code flow).
 *
 * What a connection does today: verifies the creator owns the channel and
 * shows it on their dashboard / public page. It does NOT post to chat or read
 * subscriptions. Scopes are kept to the minimum needed for that.
 *
 * Kick uses OAuth 2.1 and requires PKCE (S256); Twitch is a confidential
 * client protected by `state`, and we send PKCE there too where harmless.
 */

export type Platform = "twitch" | "kick";
export const PLATFORMS: readonly Platform[] = ["twitch", "kick"];

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

interface PlatformConfig {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  usePkce: boolean;
  clientId: () => string;
  clientSecret: () => string;
}

const CONFIG: Record<Platform, PlatformConfig> = {
  twitch: {
    authorizeUrl: "https://id.twitch.tv/oauth2/authorize",
    tokenUrl: "https://id.twitch.tv/oauth2/token",
    // No scope is needed to read the authenticated user's public profile.
    scopes: [],
    usePkce: false,
    clientId: serverEnv.twitchClientId,
    clientSecret: serverEnv.twitchClientSecret,
  },
  kick: {
    authorizeUrl: "https://id.kick.com/oauth/authorize",
    tokenUrl: "https://id.kick.com/oauth/token",
    scopes: ["user:read", "channel:read"],
    usePkce: true,
    clientId: serverEnv.kickClientId,
    clientSecret: serverEnv.kickClientSecret,
  },
};

export const PLATFORM_STATE_COOKIE = "sl_platform_oauth";
export const PLATFORM_STATE_TTL_SECONDS = 10 * 60;

export function redirectUri(platform: Platform): string {
  return new URL(`/api/auth/${platform}/callback`, serverEnv.appUrl()).toString();
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export interface PendingAuth {
  platform: Platform;
  state: string;
  verifier: string;
}

/** Builds the consent URL. Throws MissingConfigError if credentials are absent. */
export function beginAuthorization(platform: Platform): { url: string; pending: PendingAuth } {
  const cfg = CONFIG[platform];
  const state = b64url(crypto.randomBytes(32));
  const verifier = b64url(crypto.randomBytes(48));
  const params = new URLSearchParams({
    client_id: cfg.clientId(),
    redirect_uri: redirectUri(platform),
    response_type: "code",
    scope: cfg.scopes.join(" "),
    state,
  });
  if (cfg.usePkce) {
    params.set("code_challenge", b64url(crypto.createHash("sha256").update(verifier).digest()));
    params.set("code_challenge_method", "S256");
  }
  return { url: `${cfg.authorizeUrl}?${params.toString()}`, pending: { platform, state, verifier } };
}

/** Cookie value is HMAC-signed so it cannot be swapped between platforms. */
export function encodePending(p: PendingAuth): string {
  const body = b64url(Buffer.from(JSON.stringify(p)));
  const mac = crypto.createHmac("sha256", serverEnv.tokenEncryptionKey()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function decodePending(raw: string | undefined | null): PendingAuth | null {
  if (!raw) return null;
  const [body, mac] = raw.split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", serverEnv.tokenEncryptionKey()).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (isPlatform(parsed.platform) && typeof parsed.state === "string" && typeof parsed.verifier === "string") {
      return parsed as PendingAuth;
    }
  } catch {
    /* fall through */
  }
  return null;
}

export function stateMatches(a: string | null, b: string): boolean {
  if (!a) return false;
  const x = crypto.createHash("sha256").update(a).digest();
  const y = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(x, y);
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string | string[];
}

async function tokenRequest(platform: Platform, body: Record<string, string>): Promise<TokenResponse> {
  const cfg = CONFIG[platform];
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: cfg.clientId(), client_secret: cfg.clientSecret(), ...body }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`${platform} token endpoint returned ${res.status}`);
  }
  const json = (await res.json()) as TokenResponse;
  if (!json.access_token) throw new Error(`${platform} token response had no access_token`);
  return json;
}

export function exchangeCode(pending: PendingAuth, code: string): Promise<TokenResponse> {
  const body: Record<string, string> = {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(pending.platform),
  };
  if (CONFIG[pending.platform].usePkce) body.code_verifier = pending.verifier;
  return tokenRequest(pending.platform, body);
}

export interface PlatformAccount {
  id: string;
  login: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export async function fetchAccount(platform: Platform, accessToken: string): Promise<PlatformAccount> {
  if (platform === "twitch") {
    const res = await fetch("https://api.twitch.tv/helix/users", {
      headers: { Authorization: `Bearer ${accessToken}`, "Client-Id": CONFIG.twitch.clientId() },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`twitch users returned ${res.status}`);
    const json = (await res.json()) as { data?: Array<{ id: string; login: string; display_name: string; profile_image_url: string }> };
    const u = json.data?.[0];
    if (!u) throw new Error("twitch returned no user");
    return { id: u.id, login: u.login, displayName: u.display_name, avatarUrl: u.profile_image_url || null };
  }
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
  const userRes = await fetch("https://api.kick.com/public/v1/users", { headers, cache: "no-store" });
  if (!userRes.ok) throw new Error(`kick users returned ${userRes.status}`);
  const userJson = (await userRes.json()) as { data?: Array<{ user_id: number | string; name: string; profile_picture?: string }> };
  const u = userJson.data?.[0];
  if (!u) throw new Error("kick returned no user");
  let slug: string | null = null;
  const chRes = await fetch("https://api.kick.com/public/v1/channels", { headers, cache: "no-store" });
  if (chRes.ok) {
    const ch = (await chRes.json()) as { data?: Array<{ slug?: string }> };
    slug = ch.data?.[0]?.slug ?? null;
  }
  return { id: String(u.user_id), login: slug ?? u.name, displayName: u.name, avatarUrl: u.profile_picture ?? null };
}

const aad = (platform: Platform, kind: "access" | "refresh", creatorId: string) =>
  `${platform}:${kind}:${creatorId}`;

/** Caller MUST have authenticated `creatorId` from the server session. */
export async function saveConnection(
  creatorId: string,
  platform: Platform,
  account: PlatformAccount,
  tokens: TokenResponse,
): Promise<{ error: "already_linked" | "store_failed" | null }> {
  const key = serverEnv.tokenEncryptionKey();
  const scopes = Array.isArray(tokens.scope) ? tokens.scope : (tokens.scope ?? "").split(" ").filter(Boolean);
  const { error } = await getSupabaseServiceClient()
    .from("creator_platform_connections")
    .upsert(
      {
        creator_id: creatorId,
        platform,
        platform_user_id: account.id,
        platform_login: account.login,
        display_name: account.displayName,
        avatar_url: account.avatarUrl,
        access_token: sealToken(tokens.access_token, key, aad(platform, "access", creatorId)),
        refresh_token: sealNullable(tokens.refresh_token, key, aad(platform, "refresh", creatorId)),
        expires_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
        scopes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "creator_id,platform" },
    );
  if (!error) return { error: null };
  if (error.code === "23505") return { error: "already_linked" };
  console.error(`[${platform}] store failed:`, error.message);
  return { error: "store_failed" };
}

/** Best-effort token revocation at the provider, then local delete. */
export async function disconnect(creatorId: string, platform: Platform): Promise<void> {
  const service = getSupabaseServiceClient();
  const { data } = await service
    .from("creator_platform_connections")
    .select("access_token")
    .eq("creator_id", creatorId)
    .eq("platform", platform)
    .maybeSingle();
  if (data?.access_token) {
    try {
      const token = openNullable(data.access_token, serverEnv.tokenEncryptionKey(), aad(platform, "access", creatorId));
      if (token) {
        const url =
          platform === "twitch" ? "https://id.twitch.tv/oauth2/revoke" : "https://id.kick.com/oauth/revoke";
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(
            platform === "twitch"
              ? { client_id: CONFIG.twitch.clientId(), token }
              : { token, token_hint_type: "access_token" },
          ),
          cache: "no-store",
        });
      }
    } catch (e) {
      console.warn(`[${platform}] revoke failed (continuing with local delete):`, e);
    }
  }
  await service.from("creator_platform_connections").delete().eq("creator_id", creatorId).eq("platform", platform);
}

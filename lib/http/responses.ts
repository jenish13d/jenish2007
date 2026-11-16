import { NextResponse } from "next/server";

import { MissingConfigError } from "../env.ts";

/**
 * Consistent API envelopes, and one place where internal detail is stripped.
 *
 * The original routes returned `error: submissionError.message` and OpenAI's
 * raw `details` body straight to the client, which leaks Postgres column names,
 * constraint names and upstream account information. Here, the client gets a
 * stable code and a sentence it can show a viewer; the operator gets the detail
 * in the server log.
 */

export type ApiErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "payload_too_large"
  | "rate_limited"
  | "not_configured"
  | "upstream_unavailable"
  | "internal_error";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  bad_request: 400,
  validation_failed: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  rate_limited: 429,
  not_configured: 503,
  upstream_unavailable: 503,
  internal_error: 500,
};

export interface ApiErrorOptions {
  /** Field-level problems, safe to show the user. */
  fields?: Record<string, string>;
  /** Whether the caller can usefully retry the identical request. */
  retryable?: boolean;
  /** Extra safe values, e.g. `minimum_price`. Never include internal detail. */
  meta?: Record<string, string | number | boolean>;
  /** Seconds the caller should wait. Sets `Retry-After`. */
  retryAfterSeconds?: number;
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  options: ApiErrorOptions = {},
) {
  const { fields, retryable, meta, retryAfterSeconds } = options;

  const headers = new Headers();
  if (typeof retryAfterSeconds === "number") {
    headers.set("Retry-After", String(Math.max(1, Math.ceil(retryAfterSeconds))));
  }

  return NextResponse.json(
    {
      success: false as const,
      code,
      error: message,
      ...(fields ? { fields } : {}),
      ...(retryable !== undefined ? { retryable } : {}),
      ...(meta ?? {}),
    },
    { status: STATUS_BY_CODE[code], headers },
  );
}

export function apiSuccess<T extends Record<string, unknown>>(
  payload: T,
  init?: ResponseInit,
) {
  return NextResponse.json({ success: true as const, ...payload }, init);
}

/**
 * Wraps a route handler so an unexpected throw becomes a logged 500 with a
 * generic body, and a missing-secret throw becomes an honest 503 that names the
 * variable to the operator without echoing any value.
 */
export function withErrorHandling<Args extends unknown[]>(
  routeName: string,
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof MissingConfigError) {
        console.error(
          `[${routeName}] missing configuration: ${error.variable}`,
        );
        return apiError(
          "not_configured",
          "This feature is not configured on the server yet.",
          { meta: { missing_configuration: error.variable } },
        );
      }

      console.error(`[${routeName}] unhandled error:`, error);
      return apiError("internal_error", "Something went wrong. Please try again.");
    }
  };
}

/**
 * Reads and size-caps a JSON request body.
 *
 * Route handlers receive whatever the client sends, so an unbounded
 * `request.json()` is an easy memory-pressure vector on a serverless function.
 */
export async function readJsonBody(
  request: Request,
  maxBytes = 32 * 1024,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > maxBytes) {
    return {
      ok: false,
      response: apiError("payload_too_large", "Request body is too large."),
    };
  }

  const raw = await request.text();
  if (raw.length > maxBytes) {
    return {
      ok: false,
      response: apiError("payload_too_large", "Request body is too large."),
    };
  }

  if (!raw.trim()) {
    return { ok: true, value: {} };
  }

  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return {
      ok: false,
      response: apiError("bad_request", "Request body is not valid JSON."),
    };
  }
}

/**
 * HTTP helpers for Route Handlers: consistent JSON envelopes, error mapping
 * (no stack traces or filesystem paths leak), access guards and rate limits.
 *
 * Access model (local-first):
 *  - Browser UI writes (`/api/app/*`) must be same-origin requests. Browsers set
 *    `Sec-Fetch-Site`, which other websites cannot forge, so a page on another
 *    origin cannot drive your vault (CSRF protection).
 *  - Agent REST endpoints (`/api/references`, ...) are read-only and require the
 *    API key via `Authorization: Bearer <key>` or `X-API-Key`.
 *  - Images are served to same-origin pages or to requests carrying the API key.
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ImageValidationError } from "./images";
import { NotFoundError } from "./repositories/references";
import { verifyApiKey } from "./repositories/settings";
import { DuplicateTermError } from "./repositories/taxonomy";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "error",
    public details?: unknown,
  ) {
    super(message);
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function paged<T>(items: T[], meta: { total: number; limit: number; offset: number }) {
  const hasMore = meta.offset + items.length < meta.total;
  return NextResponse.json({
    data: items,
    meta: { ...meta, hasMore, nextOffset: hasMore ? meta.offset + items.length : null },
  });
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Some fields are invalid.",
          details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 400 },
    );
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: { code: "not_found", message: error.message } }, { status: 404 });
  }
  if (error instanceof ImageValidationError) {
    return NextResponse.json({ error: { code: "invalid_image", message: error.message } }, { status: 422 });
  }
  if (error instanceof DuplicateTermError) {
    return NextResponse.json({ error: { code: "duplicate", message: error.message } }, { status: 409 });
  }
  console.error("[design-vault]", error);
  const message =
    error instanceof Error && /at least one screenshot|Replace it instead|Enter a name/.test(error.message)
      ? error.message
      : "Something went wrong on the server. Please try again.";
  return NextResponse.json({ error: { code: "server_error", message } }, { status: 500 });
}

/** Wraps a handler so thrown errors become consistent JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

function isSameOriginBrowserRequest(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  // Fallback for older clients: Origin must match Host.
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function requireSameOrigin(req: Request) {
  if (!isSameOriginBrowserRequest(req)) {
    throw new HttpError(403, "This action is only available from the Design Vault app.", "forbidden");
  }
}

export function extractApiKey(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return req.headers.get("x-api-key")?.trim() ?? null;
}

export async function requireAgentAuth(req: Request) {
  const key = extractApiKey(req);
  if (!key) {
    throw new HttpError(401, "Missing API key. Send `Authorization: Bearer <key>`.", "unauthorized");
  }
  if (!(await verifyApiKey(key))) throw new HttpError(401, "Invalid API key.", "unauthorized");
  rateLimit(`agent:${key.slice(0, 12)}`, 600, 60_000);
}

/** Same-origin pages (img tags, opened links) or API-key holders may read images. */
export async function requireImageAccess(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  if (site === "same-origin" || site === "none") return;
  const key = extractApiKey(req);
  if (key && (await verifyApiKey(key))) return;
  throw new HttpError(401, "Image access requires the Design Vault app or an API key.", "unauthorized");
}

const buckets = new Map<string, number[]>();

/** Simple in-memory sliding-window rate limiter (single local process). */
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    throw new HttpError(429, "Too many requests. Please wait a moment and try again.", "rate_limited");
  }
  hits.push(now);
  buckets.set(key, hits);
}

export async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "The request body must be valid JSON.", "bad_request");
  }
}

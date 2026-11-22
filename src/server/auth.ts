/**
 * Single-owner login for hosted deployments.
 *
 * When `DESIGN_VAULT_PASSWORD` is set, every page and app endpoint requires a
 * session cookie. The cookie holds an expiry time signed with HMAC-SHA256; the
 * signing key comes from `DESIGN_VAULT_SESSION_SECRET` or, by default, is
 * derived from the password — so changing the password signs everyone out.
 *
 * Kept free of database and Node-only imports beyond `node:crypto` so the
 * proxy can use it.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "dv_session";
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

export interface AuthSettings {
  password: string | null;
  sessionSecret: string | null;
  onVercel: boolean;
  /** Signed-out visitors may view (never change) the vault. Requires a password. */
  publicView?: boolean;
}

export function authSettings(): AuthSettings {
  const password = process.env.DESIGN_VAULT_PASSWORD?.trim() || null;
  return {
    password,
    sessionSecret: process.env.DESIGN_VAULT_SESSION_SECRET?.trim() || null,
    onVercel: Boolean(process.env.VERCEL),
    publicView: Boolean(password) && /^(1|true|yes|on)$/i.test(process.env.DESIGN_VAULT_PUBLIC_VIEW?.trim() ?? ""),
  };
}

function signingKey(s: AuthSettings) {
  return createHash("sha256").update(`design-vault-session:${s.sessionSecret ?? ""}:${s.password ?? ""}`).digest();
}

function sign(payload: string, s: AuthSettings) {
  return createHmac("sha256", signingKey(s)).update(payload).digest("base64url");
}

export function createSessionToken(s: AuthSettings, now = Date.now()) {
  const payload = `v1.${now + SESSION_MAX_AGE_S * 1000}`;
  return `${payload}.${sign(payload, s)}`;
}

export function verifySessionToken(token: string | undefined | null, s: AuthSettings, now = Date.now()) {
  if (!token || !s.password) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const expires = Number(parts[1]);
  if (!Number.isFinite(expires) || expires < now) return false;
  const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`, s));
  const actual = Buffer.from(parts[2]);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Constant-time password comparison. */
export function checkPassword(input: string, s: AuthSettings) {
  if (!s.password) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(s.password).digest();
  return timingSafeEqual(a, b);
}

/** Only allow redirects back into this app after signing in. */
export function safeNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

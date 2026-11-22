import { NextResponse, type NextRequest } from "next/server";
import { authSettings, SESSION_COOKIE, verifySessionToken } from "@/server/auth";

/**
 * Access gate for hosted deployments (runs before every page and API route).
 *
 * - Local (no `DESIGN_VAULT_PASSWORD`): everything passes, as before.
 * - On Vercel without a password: the app refuses to serve your vault and
 *   explains how to set one — it is never left open to the internet.
 * - With a password: pages redirect to /login and app endpoints return 401
 *   unless the signed session cookie is valid. Agent REST endpoints may
 *   instead present the API key (checked by the route itself).
 */
const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"]);
const AGENT_PREFIXES = ["/api/references", "/api/collections", "/api/taxonomy", "/api/search", "/api/images"];
const BARE_HEADER = "x-dv-bare";

function forward(req: NextRequest, bare = false) {
  const headers = new Headers(req.headers);
  headers.delete(BARE_HEADER); // never trust a client-supplied value
  if (bare) headers.set(BARE_HEADER, "1");
  return NextResponse.next({ request: { headers } });
}

const SETUP_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Design Vault — setup needed</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 20px;line-height:1.55;color:#222}code{background:#f1f1ef;padding:2px 6px;border-radius:4px}</style></head>
<body><h1>One more step</h1><p>This Design Vault is deployed but has no login password yet, so it is locked to protect your references.</p>
<p>In Vercel, open your project → <b>Settings → Environment Variables</b>, add <code>DESIGN_VAULT_PASSWORD</code> with a strong password, then redeploy.</p></body></html>`;

export function proxy(req: NextRequest) {
  const s = authSettings();
  const path = req.nextUrl.pathname;

  if (!s.password) {
    if (s.onVercel) {
      return new NextResponse(SETUP_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    }
    return forward(req, path === "/login");
  }

  if (PUBLIC_PATHS.has(path)) return forward(req, path === "/login");

  const isAgentPath = AGENT_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  if (isAgentPath && (req.headers.has("authorization") || req.headers.has("x-api-key"))) return forward(req);

  if (verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, s)) return forward(req);

  if (path.startsWith("/api/")) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Please sign in to Design Vault." } }, { status: 401 });
  }
  const login = new URL("/login", req.url);
  const next = `${path}${req.nextUrl.search}`;
  if (next !== "/") login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|robots.txt).*)"],
};

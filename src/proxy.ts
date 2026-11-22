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
 * - With `DESIGN_VAULT_PUBLIC_VIEW=true` as well: signed-out visitors may
 *   *view* the gallery, explore, collections and reference pages (GET only).
 *   Everything that changes data, settings (incl. the API key) and the
 *   add/edit pages still require signing in.
 */
const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"]);
const AGENT_PREFIXES = ["/api/references", "/api/collections", "/api/taxonomy", "/api/search", "/api/images"];
const BARE_HEADER = "x-dv-bare";
const VIEWER_HEADER = "x-dv-viewer";

/** Read-only routes open to signed-out visitors of a public vault. */
const VISITOR_ROUTES = [
  /^\/$/,
  /^\/explore$/,
  /^\/collections$/,
  /^\/collections\/col_[A-Za-z0-9]+$/,
  /^\/recent$/,
  /^\/favorites$/,
  /^\/references\/ref_[A-Za-z0-9]+$/,
  /^\/api\/images\/img_[A-Za-z0-9]+\/(thumb|preview|original)$/,
  // The gallery's "Load more" (read-only list; writes to this path are POST and stay blocked).
  /^\/api\/app\/references$/,
];

function isVisitorRoute(method: string, path: string) {
  return (method === "GET" || method === "HEAD") && VISITOR_ROUTES.some((r) => r.test(path));
}

function forward(req: NextRequest, opts: { bare?: boolean; viewer?: boolean } = {}) {
  const headers = new Headers(req.headers);
  // Never trust client-supplied values for these.
  headers.delete(BARE_HEADER);
  headers.delete(VIEWER_HEADER);
  if (opts.bare) headers.set(BARE_HEADER, "1");
  if (opts.viewer) headers.set(VIEWER_HEADER, "1");
  return NextResponse.next({ request: { headers } });
}

const SETUP_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Design Vault — setup needed</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 20px;line-height:1.55;color:#222}code{background:#f1f1ef;padding:2px 6px;border-radius:4px}</style></head>
<body><h1>One more step</h1><p>This Design Vault is deployed but has no login password yet, so it is locked to protect your references.</p>
<p>In Vercel, open your project → <b>Settings → Environment Variables</b>, add <code>DESIGN_VAULT_PASSWORD</code> with a strong password, then redeploy.</p></body></html>`;

const VISITOR_UNAVAILABLE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Design Vault</title>
<style>body{font-family:system-ui,sans-serif;max-width:520px;margin:15vh auto;padding:0 20px;line-height:1.55;color:#222}</style></head>
<body><h1>Coming soon</h1><p>This design library isn't available yet. Please check back later.</p><p><a href="/login">Owner sign in</a></p></body></html>`;

const has = (...names: string[]) => names.some((n) => Boolean(process.env[n]?.trim()));

/** Storage settings a Vercel deployment needs (Vercel's disk is temporary and read-only). */
function missingHostedSettings() {
  const missing: { what: string; vars: string; how: string }[] = [];
  if (!has("TURSO_DATABASE_URL", "DESIGN_VAULT_DATABASE_URL")) {
    missing.push({ what: "Database (Turso)", vars: "TURSO_DATABASE_URL", how: "Storage tab → Turso → create a database and connect it to this project." });
  }
  if (!has("TURSO_AUTH_TOKEN", "DESIGN_VAULT_DATABASE_TOKEN")) {
    missing.push({ what: "Database access token (Turso)", vars: "TURSO_AUTH_TOKEN", how: "Added automatically when Turso is connected; or create a token in the Turso dashboard." });
  }
  if (!has("BLOB_READ_WRITE_TOKEN")) {
    missing.push({ what: "File storage (Vercel Blob)", vars: "BLOB_READ_WRITE_TOKEN", how: "Storage tab → Create → Blob (Private) → connect it to this project." });
  }
  return missing;
}

function storageSetupHtml(missing: ReturnType<typeof missingHostedSettings>) {
  const rows = missing.map((m) => `<li><b>${m.what}</b> — <code>${m.vars}</code><br><span>${m.how}</span></li>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Design Vault — storage not connected</title>
<style>body{font-family:system-ui,sans-serif;max-width:620px;margin:12vh auto;padding:0 20px;line-height:1.55;color:#222}code{background:#f1f1ef;padding:2px 6px;border-radius:4px}li{margin:0 0 14px}span{color:#555}</style></head>
<body><h1>Almost there — connect storage</h1><p>You're signed in, but this vault can't store anything yet. Vercel's own disk is temporary, so Design Vault needs these settings:</p>
<ul>${rows}</ul><p>Add them in your Vercel project, then go to <b>Deployments → ⋯ → Redeploy</b>. Settings only apply to new deployments. If a value exists under a different name, add it again with exactly the name shown above.</p></body></html>`;
}

export function proxy(req: NextRequest) {
  const s = authSettings();
  const path = req.nextUrl.pathname;

  if (!s.password) {
    if (s.onVercel) {
      return new NextResponse(SETUP_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    }
    return forward(req, { bare: path === "/login" });
  }

  if (PUBLIC_PATHS.has(path)) return forward(req, { bare: path === "/login" });

  const isAgentPath = AGENT_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  if (isAgentPath && (req.headers.has("authorization") || req.headers.has("x-api-key"))) return forward(req);

  if (verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, s)) {
    // Signed in, but the hosted storage isn't connected yet: explain instead of crashing.
    const missing = s.onVercel ? missingHostedSettings() : [];
    if (missing.length && !path.startsWith("/api/auth/")) {
      if (path.startsWith("/api/")) {
        return NextResponse.json({ error: { code: "setup_incomplete", message: `Missing settings: ${missing.map((m) => m.vars).join(", ")}` } }, { status: 503 });
      }
      return new NextResponse(storageSetupHtml(missing), { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    }
    return forward(req);
  }

  // Public view: signed-out visitors may browse, never change anything.
  if (s.publicView && isVisitorRoute(req.method, path)) {
    const missing = s.onVercel ? missingHostedSettings() : [];
    if (missing.length) {
      return new NextResponse(VISITOR_UNAVAILABLE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    }
    return forward(req, { viewer: true });
  }

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

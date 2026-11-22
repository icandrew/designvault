# Security model

Design Vault is a **personal, local-first** application. By default it's secured for use on your own computer. Hosted mode (Vercel) adds a login and private cloud storage. See "Hosted mode" below.

## What is in place

**Network exposure**
- The dev and production servers bind to `127.0.0.1` only (`npm run dev`, `npm start`), so other devices on your network cannot reach them.

**Write protection (CSRF)**
- All create/update/delete endpoints live under `/api/app/*` and only accept **same-origin** browser requests. Browsers send `Sec-Fetch-Site`, which a malicious website cannot forge, so another site you visit cannot modify or read your vault through your browser.

**Agent access**
- The REST API (`/api/references`, `/api/search`, …) is **read-only** (GET only) and requires an API key (`Authorization: Bearer …`). Keys are compared in constant time.
- The key is generated randomly on first run and stored in the local database, or set with `DESIGN_VAULT_API_KEY`. Rotate it in Settings → Agent access or with `npm run api-key -- --regenerate`.
- The MCP server exposes only read-only tools and opens SQLite with `PRAGMA query_only = ON`, so even a bug could not write.
- Rate limits: 600 req/min per API key, 120 uploads/min, 10 URL captures/min.

**Uploads**
- File type is detected from the file signature (magic bytes), never from the name or browser-reported MIME type. Only PNG, JPEG and WebP are accepted.
- Size limit (default 25 MB) and pixel limit (120 megapixels) prevent resource exhaustion; images are decoded by `sharp` and corrupted files are rejected with a clear message.
- Stored filenames are generated IDs (`img_…`); user filenames are never used on disk. Storage keys are validated against a strict pattern and resolved paths are checked to stay inside the storage folder (no directory traversal, no arbitrary file access).
- Staged uploads expire after 24 hours.

**URL capture (SSRF protection)**
- Only `http`/`https` URLs on ports 80/443, without embedded credentials.
- Hostnames are resolved and rejected if *any* address is private, loopback, link-local (including cloud metadata `169.254.169.254`), multicast or reserved — IPv4 and IPv6, including IPv4-mapped addresses.
- Every request the headless browser makes — redirects and subresources included — is re-checked and blocked if it targets a private address.
- The capture browser has no cookies or stored logins, blocks service workers and downloads, and does **not** bypass sign-in walls, paywalls or anti-bot protection.

**Errors and secrets**
- API errors return a code and a friendly message; stack traces and filesystem paths are never sent to clients (they are logged to the server console only).
- No secrets are shipped to the browser. The API key is only shown on the Settings page, which is served to same-origin requests from your machine.
- Security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`.

## Hosted mode (Vercel)

When deployed online (see [DEPLOY-VERCEL.md](DEPLOY-VERCEL.md)), these protections are added:

- **Login.** With `DESIGN_VAULT_PASSWORD` set, a proxy (`src/proxy.ts`) runs before every page and API route:
  - Signed-out page requests redirect to `/login`.
  - Signed-out app endpoints and images return 401.
  - The login page renders without reading the vault.
- **No accidental exposure.** On Vercel without a password, the app serves only a "set a password" notice (HTTP 503), never your data.
- **Sessions.** An HttpOnly, Secure, SameSite=Lax cookie holds an HMAC-SHA256 signed expiry (30 days). The signing key comes from `DESIGN_VAULT_SESSION_SECRET` or is derived from the password, so changing either signs everyone out.
- **Login safeguards.**
  - The password is compared in constant time.
  - Cross-site login requests are refused.
  - Failed attempts are delayed and rate-limited (8 per 5 minutes per IP, per server instance).
- **Agents.** The REST API skips the login but always requires the API key. Requests carrying credentials must present a valid key; a forged `Sec-Fetch-Site` header no longer unlocks images.
- **Private files.**
  - Screenshots and videos are stored as private Vercel Blob objects and streamed only through the authenticated image route. They have no public URLs.
  - Browser uploads use short-lived tokens (30 minutes), each limited to one `staging/<id>` path, the allowed media types and the size limit, with no overwriting.
  - Every file is still checked by its signature (magic bytes) before it's accepted.
- **Database.**
  - Turso connections use HTTPS with an auth token.
  - The MCP server's hosted connection rejects anything but reads, and a read-only Turso token adds a second layer.
  - Cascading deletes are done explicitly in code, because hosted libSQL connections don't enforce foreign keys.
- **No URL capture** on hosted deployments, so there's no server-side browser to abuse.

## Known limitations

- Anyone with access to your user account can read the `data/` folder directly. Use OS-level disk encryption if that matters to you.
- DNS rebinding between the SSRF check and the browser's own resolution is mitigated by re-checking every request, but not impossible to exploit in theory.
- Locally, the web UI has no login unless you set `DESIGN_VAULT_PASSWORD`; it relies on binding to localhost.
- Hosted mode is single-owner: one shared password, no user accounts. Rate limits are kept in memory per server instance, not globally.
- API keys are stored in plain text in the database. Rotate the key if you think it leaked.

## Further hardening (for multi-user or high-value deployments)

1. Replace the shared password with real accounts (e.g. Auth.js / OIDC) and add CSRF tokens on top of origin checks.
2. Add a Content-Security-Policy and HSTS. Vercel serves HTTPS by default.
3. Move rate limiting to a shared store (e.g. Upstash Redis).
4. Store API keys hashed, support multiple scoped keys with expiry, and log access.
5. Review dependency updates regularly (`npm audit`).

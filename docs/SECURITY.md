# Security model

Design Vault is a **personal, local-first** application. It is secured for use on your own computer, not for the public internet.

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

## Known limitations

- Anyone with access to your user account can read the `data/` folder directly. Use OS-level disk encryption if that matters to you.
- DNS rebinding between the SSRF check and the browser's own resolution is mitigated by re-checking every request, but not impossible to exploit in theory.
- The web UI itself has no login; it relies on binding to localhost.

## Before exposing Design Vault publicly

Do **not** put the current version on the internet as-is. At minimum:

1. Add real user authentication (e.g. Auth.js / OIDC) and protect every page and `/api/app/*` route; add CSRF tokens in addition to origin checks.
2. Serve over HTTPS behind a reverse proxy; set HSTS and a Content-Security-Policy.
3. Move rate limiting to a shared store (Redis) and add request size limits at the proxy.
4. Store API keys hashed, support multiple scoped keys with expiry, and log access.
5. Run URL capture in an isolated container or separate network namespace with egress filtering.
6. Move images to private object storage (S3-compatible) with signed URLs; move the database to PostgreSQL with backups.
7. Review dependency updates regularly (`npm audit`).

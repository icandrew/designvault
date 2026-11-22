import path from "node:path";

/**
 * Central runtime configuration. Everything is read from environment
 * variables (see `.env.example`) with safe local defaults.
 *
 * Two ways to run:
 *  - Local (default): SQLite file + images on this computer's disk.
 *  - Hosted (e.g. Vercel): set `TURSO_DATABASE_URL` (+ `TURSO_AUTH_TOKEN`) for
 *    the database and `BLOB_READ_WRITE_TOKEN` for images/videos. A login
 *    password (`DESIGN_VAULT_PASSWORD`) is required when deployed on Vercel.
 */
function resolveDir(value: string | undefined, fallback: string) {
  const dir = value && value.trim() ? value.trim() : fallback;
  // The ignore comment stops Vercel's bundler from copying the whole project into every function.
  return path.isAbsolute(dir) ? dir : path.resolve(/*turbopackIgnore: true*/ process.cwd(), dir);
}

function env(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function getConfig() {
  const dataDir = resolveDir(process.env.DESIGN_VAULT_DATA_DIR, "data");
  const databaseUrl = env("TURSO_DATABASE_URL") ?? env("DESIGN_VAULT_DATABASE_URL");
  // Ignore values that aren't real read-write tokens (e.g. a store ID pasted by mistake).
  const rawBlobToken = env("BLOB_READ_WRITE_TOKEN");
  const blobToken = rawBlobToken?.startsWith("vercel_blob_rw_") ? rawBlobToken : null;
  // Newer private Blob stores connect through Vercel's built-in identity (OIDC):
  // they only provide BLOB_STORE_ID, and the SDK authenticates with VERCEL_OIDC_TOKEN.
  const blobStoreId = env("BLOB_STORE_ID");
  const blobEnabled = Boolean(blobToken || blobStoreId);
  const onVercel = Boolean(process.env.VERCEL);
  return {
    dataDir,
    databaseFile: path.join(dataDir, "vault.db"),
    storageDir: path.join(dataDir, "storage"),
    /** Hosted libSQL/Turso database (libsql://… or https://…). Null = local SQLite file. */
    databaseUrl,
    databaseAuthToken: env("TURSO_AUTH_TOKEN") ?? env("DESIGN_VAULT_DATABASE_TOKEN"),
    /** Vercel Blob read-write token (classic stores). */
    blobToken,
    /** Vercel Blob store ID (stores connected via Vercel's built-in identity). */
    blobStoreId,
    /** Images are stored in Vercel Blob (otherwise on the local disk). */
    blobEnabled,
    /** How the app authenticates to Blob: a read-write token, or Vercel's built-in identity. */
    blobAuth: (blobToken ? "token" : blobStoreId ? "identity" : null) as "token" | "identity" | null,
    /** Running on Vercel (or another serverless host that sets VERCEL). */
    onVercel,
    /** Files go straight from the browser to Blob storage (bypasses the 4.5 MB request limit). */
    directUploads: blobEnabled,
    /** Login password. When set, every page and app endpoint requires signing in. */
    password: env("DESIGN_VAULT_PASSWORD"),
    /** Optional secret for signing login sessions (defaults to one derived from the password). */
    sessionSecret: env("DESIGN_VAULT_SESSION_SECRET"),
    /** Optional fixed API key. When unset, a key is generated and stored in settings. */
    apiKey: env("DESIGN_VAULT_API_KEY"),
    maxUploadBytes: Number(process.env.DESIGN_VAULT_MAX_UPLOAD_MB ?? 25) * 1024 * 1024,
    maxVideoBytes: Number(process.env.DESIGN_VAULT_MAX_VIDEO_MB ?? 200) * 1024 * 1024,
    /** URL capture needs a local Chromium, which serverless hosts don't provide. */
    captureEnabled: !onVercel && process.env.DESIGN_VAULT_DISABLE_CAPTURE !== "true",
    /** Only for automated tests. Never enable on a machine reachable from a network. */
    captureAllowPrivateHosts: process.env.DESIGN_VAULT_CAPTURE_ALLOW_PRIVATE === "true",
    captureTimeoutMs: Number(process.env.DESIGN_VAULT_CAPTURE_TIMEOUT_MS ?? 30000),
  };
}

export type AppConfig = ReturnType<typeof getConfig>;

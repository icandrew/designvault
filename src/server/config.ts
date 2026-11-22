import path from "node:path";

/**
 * Central runtime configuration. Everything is read from environment
 * variables (see `.env.example`) with safe local defaults.
 */
function resolveDir(value: string | undefined, fallback: string) {
  const dir = value && value.trim() ? value.trim() : fallback;
  return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
}

export function getConfig() {
  const dataDir = resolveDir(process.env.DESIGN_VAULT_DATA_DIR, "data");
  return {
    dataDir,
    databaseFile: path.join(dataDir, "vault.db"),
    storageDir: path.join(dataDir, "storage"),
    /** Optional fixed API key. When unset, a key is generated and stored in settings. */
    apiKey: process.env.DESIGN_VAULT_API_KEY?.trim() || null,
    maxUploadBytes: Number(process.env.DESIGN_VAULT_MAX_UPLOAD_MB ?? 25) * 1024 * 1024,
    maxVideoBytes: Number(process.env.DESIGN_VAULT_MAX_VIDEO_MB ?? 200) * 1024 * 1024,
    /** Only for automated tests. Never enable on a machine reachable from a network. */
    captureAllowPrivateHosts: process.env.DESIGN_VAULT_CAPTURE_ALLOW_PRIVATE === "true",
    captureTimeoutMs: Number(process.env.DESIGN_VAULT_CAPTURE_TIMEOUT_MS ?? 30000),
  };
}

export type AppConfig = ReturnType<typeof getConfig>;

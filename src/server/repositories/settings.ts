import { randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getConfig } from "../config";
import { getDb } from "../db/client";
import { appSettings } from "../db/schema";

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  const db = await getDb();
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date().toISOString() } });
}

/** The read-only agent API key. `DESIGN_VAULT_API_KEY` overrides the stored key. */
export async function getApiKey(): Promise<{ key: string; source: "env" | "settings" }> {
  const fromEnv = getConfig().apiKey;
  if (fromEnv) return { key: fromEnv, source: "env" };
  return { key: (await getSetting("api_key"))!, source: "settings" };
}

export async function regenerateApiKey() {
  const key = `dv_${randomBytes(24).toString("base64url")}`;
  await setSetting("api_key", key);
  return key;
}

export async function verifyApiKey(candidate: string | null | undefined) {
  if (!candidate) return false;
  const { key } = await getApiKey();
  const a = Buffer.from(candidate);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

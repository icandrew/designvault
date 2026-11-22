import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { DB } from "./client";
import { appSettings, terms, type TermKind } from "./schema";
import { BUILT_IN_TERMS } from "./taxonomy-seed";
import { newId, slugify } from "../ids";

/** Idempotent: inserts built-in taxonomy terms and default settings if missing. */
export async function ensureSeedData(db: DB) {
  const seeded = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(sql`${appSettings.key} = 'taxonomy_seeded'`);

  if (seeded.length === 0) {
    const rows = (Object.entries(BUILT_IN_TERMS) as [TermKind, string[]][]).flatMap(([kind, names]) =>
      names.map((name) => ({ id: newId("trm"), kind, name, slug: slugify(name), isBuiltIn: true })),
    );
    for (let i = 0; i < rows.length; i += 50) {
      await db.insert(terms).values(rows.slice(i, i + 50)).onConflictDoNothing();
    }
    await db.insert(appSettings).values({ key: "taxonomy_seeded", value: "true" }).onConflictDoNothing();
  }

  await db
    .insert(appSettings)
    .values({ key: "api_key", value: `dv_${randomBytes(24).toString("base64url")}` })
    .onConflictDoNothing();
}

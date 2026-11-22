/**
 * Copies your local vault (all references, collections, classifications and
 * every screenshot/video file) into a hosted vault (Turso + Vercel Blob).
 *
 *   npm run hosted:import -- .env.hosted
 *
 * The env file must contain TURSO_DATABASE_URL, TURSO_AUTH_TOKEN and
 * BLOB_READ_WRITE_TOKEN (copy them from Vercel → your project → Settings →
 * Environment Variables). Safe to run more than once: records and files that
 * already exist in the hosted vault are skipped. Your local vault is only read.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

type Row = Record<string, string | number | null>;

async function main() {
  const envFile = process.argv[2];
  if (envFile) {
    if (!fs.existsSync(envFile)) throw new Error(`Env file not found: ${envFile}`);
    process.loadEnvFile(envFile);
  }
  for (const name of ["TURSO_DATABASE_URL", "BLOB_READ_WRITE_TOKEN"]) {
    if (!process.env[name]) throw new Error(`${name} is missing. Put it in an env file and pass its path, e.g. npm run hosted:import -- .env.hosted`);
  }

  // Local vault (read-only). Resolve the local paths before hosted settings take effect.
  const dataDir = path.resolve(process.cwd(), process.env.DESIGN_VAULT_DATA_DIR?.trim() || "data");
  const localDbFile = path.join(dataDir, "vault.db");
  const localStorage = path.join(dataDir, "storage");
  if (!fs.existsSync(localDbFile)) throw new Error(`No local vault found at ${localDbFile}`);
  const local = new DatabaseSync(localDbFile, { readOnly: true });
  const all = (sql: string) => local.prepare(sql).all() as Row[];

  // Hosted vault: opening it applies migrations and built-in data.
  const { getDb, rawAll, closeDb } = await import("../src/server/db/client");
  const { BlobStorageDriver } = await import("../src/server/storage");
  await getDb();
  const { createClient } = await import("@libsql/client/web");
  const remote = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN, intMode: "number" });

  const insert = async (table: string, rows: Row[]) => {
    let added = 0;
    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50);
      const results = await remote.batch(
        chunk.map((row) => {
          const cols = Object.keys(row);
          return {
            sql: `insert or ignore into "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) values (${cols.map(() => "?").join(", ")})`,
            args: cols.map((c) => row[c]),
          };
        }),
        "write",
      );
      added += results.reduce((n, r) => n + r.rowsAffected, 0);
    }
    console.log(`  ${table}: ${added} added, ${rows.length - added} already there`);
  };

  console.log("Copying records…");
  // Classification terms: built-in terms already exist in the hosted vault under
  // different IDs, so match them by (kind, slug) and remap references to them.
  const hostedTerms = await rawAll<{ id: string; kind: string; slug: string }>(`select id, kind, slug from terms`);
  const byKey = new Map(hostedTerms.map((t) => [`${t.kind}:${t.slug}`, t.id]));
  const termMap = new Map<string, string>();
  const newTerms: Row[] = [];
  for (const t of all(`select * from terms`)) {
    const existing = byKey.get(`${t.kind}:${t.slug}`);
    if (existing) termMap.set(String(t.id), existing);
    else {
      termMap.set(String(t.id), String(t.id));
      newTerms.push(t);
    }
  }
  const mapTerm = (id: string | number | null) => (id === null ? null : (termMap.get(String(id)) ?? null));
  await insert("terms", newTerms);
  await insert(
    "references",
    all(`select * from "references"`).map((r) => ({ ...r, industry_id: mapTerm(r.industry_id), page_type_id: mapTerm(r.page_type_id) })),
  );
  await insert(
    "reference_terms",
    all(`select * from reference_terms`).map((r) => ({ ...r, term_id: mapTerm(r.term_id) })).filter((r) => r.term_id),
  );
  const images = all(`select * from reference_images`);
  await insert("reference_images", images);
  await insert("design_analyses", all(`select * from design_analyses`));
  await insert("collections", all(`select * from collections`));
  await insert("collection_references", all(`select * from collection_references`));

  console.log("Uploading files…");
  const blob = new BlobStorageDriver(process.env.BLOB_READ_WRITE_TOKEN!);
  const keys = images.flatMap((i) => [i.original_key, i.preview_key, i.thumb_key]).map(String);
  let uploaded = 0;
  let skipped = 0;
  let missing = 0;
  for (const [n, key] of keys.entries()) {
    const file = path.join(localStorage, key);
    if (!fs.existsSync(file)) {
      missing += 1;
      continue;
    }
    if ((await blob.size(key)) !== null) skipped += 1;
    else {
      await blob.put(key, fs.readFileSync(file));
      uploaded += 1;
    }
    if ((n + 1) % 25 === 0) console.log(`  ${n + 1}/${keys.length} files…`);
  }
  console.log(`  files: ${uploaded} uploaded, ${skipped} already there${missing ? `, ${missing} missing locally` : ""}`);

  remote.close();
  closeDb();
  local.close();
  console.log("\nDone. Open your hosted vault — your references are there.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

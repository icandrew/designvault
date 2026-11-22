import fs from "node:fs/promises";
import path from "node:path";
import { getConfig } from "./config";
import { checkpoint, rawAll } from "./db/client";
import { getCollection, listCollections } from "./repositories/collections";
import { getReference } from "./repositories/references";
import { listTerms } from "./repositories/taxonomy";

/** Portable JSON export of all metadata. */
export async function exportLibrary() {
  const ids = await rawAll<{ id: string }>(`select id from "references" order by created_at`);
  const references = [];
  for (const { id } of ids) references.push(await getReference(id));
  const collections = [];
  for (const c of await listCollections()) collections.push(await getCollection(c.id));
  return {
    format: "design-vault-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    note: "Metadata only. Image files are referenced by imageId; use `npm run backup` for a complete backup.",
    taxonomy: await listTerms(),
    references,
    collections,
  };
}

/**
 * Full backup: a consistent copy of the SQLite database (VACUUM INTO) and all
 * stored image files, written to `<dataDir>/../backups/<timestamp>/` by default.
 */
export async function createBackup(targetRoot?: string) {
  const { dataDir, storageDir } = getConfig();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const root = targetRoot ?? path.join(path.dirname(dataDir), "backups");
  const dest = path.join(root, stamp);
  await fs.mkdir(dest, { recursive: true });
  await checkpoint();
  const dbFile = path.join(dest, "vault.db").replace(/'/g, "''");
  await rawAll(`vacuum into '${dbFile}'`);
  await fs.cp(storageDir, path.join(dest, "storage"), { recursive: true }).catch((error) => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  });
  return dest;
}

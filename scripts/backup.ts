/**
 * Full backup of the database and all stored images.
 *   npm run backup                 → ./backups/<timestamp>/
 *   npm run backup -- D:\MyBackups → D:\MyBackups\<timestamp>/
 * Safe to run while the app is running.
 */
import { createBackup } from "../src/server/backup";
import { closeDb } from "../src/server/db/client";

async function main() {
  const dest = await createBackup(process.argv[2]);
  console.log(`Backup written to:\n  ${dest}\n\nIt contains vault.db (all metadata) and storage/ (original screenshots, previews, thumbnails).`);
  closeDb();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

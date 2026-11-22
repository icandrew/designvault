/** Applies database migrations (also happens automatically on first use). */
import { closeDb, getDb } from "../src/server/db/client";
import { getConfig } from "../src/server/config";

async function main() {
  await getDb();
  console.log(`Database is up to date: ${getConfig().databaseFile}`);
  closeDb();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

/** Applies database migrations (also happens automatically on first use). Runs before `next build` on Vercel. */
import { closeDb, getDb } from "../src/server/db/client";
import { getConfig } from "../src/server/config";

async function main() {
  const config = getConfig();
  if (config.onVercel && !config.databaseUrl) {
    console.warn("TURSO_DATABASE_URL is not set — skipping database migrations. Connect a Turso database in Vercel (see docs/DEPLOY-VERCEL.md).");
    return;
  }
  await getDb();
  const where = config.databaseUrl ? `hosted database ${new URL(config.databaseUrl.replace(/^libsql:/, "https:")).host}` : config.databaseFile;
  console.log(`Database is up to date: ${where}`);
  closeDb();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

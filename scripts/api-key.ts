/** Prints the read-only agent API key (or `--regenerate` to rotate it). */
import { closeDb } from "../src/server/db/client";
import { getApiKey, regenerateApiKey } from "../src/server/repositories/settings";

async function main() {
  if (process.argv.includes("--regenerate")) {
    console.log(`New API key: ${await regenerateApiKey()}`);
  } else {
    const { key, source } = await getApiKey();
    console.log(`API key (${source === "env" ? "from DESIGN_VAULT_API_KEY" : "stored in database"}): ${key}`);
  }
  closeDb();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

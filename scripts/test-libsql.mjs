// Runs the unit/integration suite against the libSQL engine (the one hosted
// Turso vaults use), backed by a temporary local libSQL file.
import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["vitest", "run", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DV_TEST_ENGINE: "libsql" },
});
process.exit(result.status ?? 1);

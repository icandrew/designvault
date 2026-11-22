/**
 * Restores a backup created by `npm run backup`.
 *   npm run restore -- backups/2026-11-23T10-00-00-000Z
 * Stop the app (and Claude Code sessions using the MCP server) first.
 * The current data folder is moved aside to data-before-restore-<timestamp>.
 */
import fs from "node:fs";
import path from "node:path";
import { getConfig } from "../src/server/config";

const source = process.argv[2];
if (!source) {
  console.error("Usage: npm run restore -- <backup-folder>");
  process.exit(1);
}
const src = path.resolve(source);
if (!fs.existsSync(path.join(src, "vault.db"))) {
  console.error(`No vault.db found in ${src}. Point to a folder created by "npm run backup".`);
  process.exit(1);
}
const { dataDir } = getConfig();
if (fs.existsSync(dataDir)) {
  const aside = `${dataDir}-before-restore-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  fs.renameSync(dataDir, aside);
  console.log(`Current data moved to ${aside}`);
}
fs.mkdirSync(dataDir, { recursive: true });
fs.copyFileSync(path.join(src, "vault.db"), path.join(dataDir, "vault.db"));
if (fs.existsSync(path.join(src, "storage"))) fs.cpSync(path.join(src, "storage"), path.join(dataDir, "storage"), { recursive: true });
console.log(`Restored backup from ${src} into ${dataDir}. Start the app with "npm run dev".`);

/**
 * Design Vault MCP server (stdio, read-only).
 *
 * Connect from any Claude Code project:
 *   claude mcp add design-vault --scope user -- node "<vault>/mcp/start.mjs"
 *
 * The server reads the local SQLite database directly (opened with
 * `PRAGMA query_only`), so the web app does not need to be running.
 * Never write to stdout here: it carries the MCP protocol.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(projectRoot);
for (const file of [".env.local", ".env"]) {
  if (fs.existsSync(file)) {
    try {
      process.loadEnvFile(file);
    } catch {
      // ignore malformed env files
    }
  }
}

async function main() {
  const { getDb } = await import("../src/server/db/client");
  await getDb({ readOnly: true });
  const { createDesignVaultServer } = await import("../src/server/mcp-tools");
  const server = createDesignVaultServer();
  await server.connect(new StdioServerTransport());
  console.error("[design-vault] MCP server ready (read-only)");
}

main().catch((error) => {
  console.error("[design-vault] MCP server failed to start:", error instanceof Error ? (process.env.DEBUG ? error.stack : error.message) : error);
  process.exit(1);
});

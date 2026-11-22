/**
 * Installs the Design Vault Claude Code skill.
 *   npm run skill:install                 → personal skills (~/.claude/skills), available in every project
 *   npm run skill:install -- <project>    → project skills (<project>/.claude/skills)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "claude", "skills", "design-vault-references");
const targetProject = process.argv[2];
const base = targetProject ? path.join(path.resolve(targetProject), ".claude", "skills") : path.join(os.homedir(), ".claude", "skills");
const dest = path.join(base, "design-vault-references");

fs.mkdirSync(dest, { recursive: true });
fs.cpSync(source, dest, { recursive: true });
console.log(`Installed the design-vault-references skill to:\n  ${dest}`);
console.log("Restart Claude Code (or start a new session) to pick it up. Make sure the design-vault MCP server is connected (run /mcp).");

#!/usr/bin/env node
/**
 * Launcher for the Design Vault MCP server. Works from any working directory
 * (Claude Code starts MCP servers in the calling project's folder):
 *
 *   claude mcp add design-vault --scope user -- node "<vault>/mcp/start.mjs"
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
// Make tsx resolve the vault's TypeScript path aliases (e.g. "@/lib/...").
process.env.TSX_TSCONFIG_PATH = path.join(root, "tsconfig.json");
const { register: registerEsm } = await import("tsx/esm/api");
const { register: registerCjs } = await import("tsx/cjs/api");
registerEsm({ tsconfig: process.env.TSX_TSCONFIG_PATH });
registerCjs();
await import(pathToFileURL(path.join(root, "mcp", "server.ts")).href);

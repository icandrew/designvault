/**
 * Connects to the Design Vault MCP server over stdio exactly like Claude Code
 * does (from a different working directory) and exercises every tool.
 * Usage: node scripts/mcp-smoke.mjs
 */
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, "mcp", "start.mjs")],
  cwd: os.tmpdir(),
  env: { ...process.env },
  stderr: "pipe",
});
const client = new Client({ name: "design-vault-smoke", version: "1.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => `${t.name}${t.annotations?.readOnlyHint ? " (read-only)" : ""}`).join(", "));

const call = async (name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  const images = res.content.filter((c) => c.type === "image");
  return { res, text, images };
};

const search = await call("search_design_references", { query: "premium product detail page with sticky purchase", limit: 3 });
console.log("search:", search.text.slice(0, 600));
const first = JSON.parse(search.text).results[0];
if (first) {
  console.log("context:", (await call("get_reference_context", { id: first.id, includeSimilar: true })).text.slice(0, 400));
  const imgs = await call("get_reference_images", { id: first.id });
  console.log("images:", imgs.images.length, "image block(s);", imgs.images.map((i) => `${i.mimeType} ${Math.round(i.data.length / 1024)}KB`).join(", "));
  console.log("similar:", (await call("find_similar_references", { id: first.id })).text.slice(0, 200));
}
console.log("collections:", (await call("list_design_collections")).text.slice(0, 200));
console.log("patterns:", (await call("get_design_patterns", { layout: ["Split Screen"] })).text.slice(0, 300));
console.log("taxonomy:", (await call("list_design_taxonomy")).text.slice(0, 200));
await client.close();

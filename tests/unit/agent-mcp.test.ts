import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getReferenceContext, searchForAgent } from "@/server/agent";
import { closeDb, getDb, rawAll } from "@/server/db/client";
import { createDesignVaultServer } from "@/server/mcp-tools";
import { addToCollection, createCollection } from "@/server/repositories/collections";
import { addReference, createTempVault } from "./helpers";

const vault = createTempVault();
let petId: string;
let dashId: string;
let collectionId: string;
let client: Client;

beforeAll(async () => {
  petId = await addReference(
    {
      title: "Conditioning shampoo product page",
      siteName: "Fictional Pet Co",
      sourceUrl: "https://pets.example/shampoo",
      industry: "Pet Care",
      pageType: "Product Detail Page",
      components: ["Sticky CTA", "Product Gallery"],
      visualStyles: ["Minimalist"],
      interactions: [
        { name: "Sticky Elements", verified: true },
        { name: "Parallax", verified: false },
      ],
      status: "curated",
      analysis: {
        observations: "Gallery left, purchase column right",
        interesting: "Calm, generous whitespace",
        usageIdeas: "Sticky purchase bar on mobile",
        limitations: "Low-contrast secondary text",
        aiSuggestions: "Possibly uses a 12-column grid",
      },
    },
    "#88aa66",
    [1440, 6000],
  );
  dashId = await addReference({ title: "Analytics dashboard", industry: "SaaS", pageType: "Dashboard", layouts: ["Bento Grid"], capturedTheme: "dark" }, "#101010");
  collectionId = await createCollection({ name: "Pet brief", kind: "moodboard", brief: "Premium pet shampoo website" });
  await addToCollection(collectionId, [petId], "Best product presentation");

  // Simulate the MCP process: read-only connection.
  closeDb();
  await getDb({ readOnly: true });
  const server = createDesignVaultServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client?.close();
  vault.cleanup();
});

const callJson = async (name: string, args: Record<string, unknown> = {}) => {
  const res = await client.callTool({ name, arguments: args });
  const content = res.content as { type: string; text?: string; data?: string; mimeType?: string }[];
  return { res, content, data: JSON.parse(content.find((c) => c.type === "text")!.text!) };
};

describe("agent search", () => {
  it("ranks references for a natural-language brief with explanations", async () => {
    const res = await searchForAgent({ query: "premium website for a pet care brand selling shampoo, product detail page" });
    expect(res.results[0].id).toBe(petId);
    expect(res.results[0].relevance.reasons.join(" ")).toMatch(/Pet Care/);
    expect(res.results.map((r) => r.id)).not.toContain(dashId);
  });

  it("separates observed facts, curator notes and AI suggestions", async () => {
    const ctx = await getReferenceContext(petId);
    expect(ctx!.observed.notes).toBe("Gallery left, purchase column right");
    expect(ctx!.observed.verifiedInteractions).toEqual(["Sticky Elements"]);
    expect(ctx!.curatorNotes.unverifiedInteractionLabels).toEqual(["Parallax"]);
    expect(ctx!.aiSuggestions?.reviewedByCurator).toBe(false);
    expect(ctx!.aiSuggestions?.caution).toMatch(/not treat as verified/i);
    expect(ctx!.sourceUrl).toBe("https://pets.example/shampoo");
  });
});

describe("MCP server", () => {
  it("exposes only read-only tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "search_design_references",
        "get_design_reference",
        "get_reference_images",
        "find_similar_references",
        "list_design_collections",
        "get_collection_references",
        "get_design_patterns",
        "get_reference_context",
      ]),
    );
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint, t.name).toBe(true);
      expect(t.name).not.toMatch(/create|update|delete|add_|remove|write|set_/);
    }
  });

  it("searches real stored references", async () => {
    const { data } = await callJson("search_design_references", { query: "pet shampoo product page", limit: 5 });
    expect(data.results[0].id).toBe(petId);
    expect(data.results[0].sourceUrl).toBe("https://pets.example/shampoo");
    const filtered = await callJson("search_design_references", { industry: ["SaaS"] });
    expect(filtered.data.results.map((r: { id: string }) => r.id)).toEqual([dashId]);
  });

  it("retrieves reference details and context", async () => {
    const detail = await callJson("get_design_reference", { id: petId });
    expect(detail.data.components.map((c: { name: string }) => c.name)).toContain("Sticky CTA");
    expect(JSON.stringify(detail.data)).not.toMatch(/storage[\\/]|vault\.db|[A-Z]:\\/);
    const ctx = await callJson("get_reference_context", { id: petId, includeSimilar: true });
    expect(ctx.data.reusablePrinciples).toBe("Sticky purchase bar on mobile");
    const missing = await client.callTool({ name: "get_reference_context", arguments: { id: "ref_doesnotexist" } });
    expect(missing.isError).toBe(true);
  });

  it("returns actual image content, segmenting tall pages", async () => {
    const { content } = await callJson("get_reference_images", { id: petId, maxSegments: 2 });
    const images = content.filter((c) => c.type === "image");
    expect(images.length).toBe(2);
    expect(images[0].mimeType).toBe("image/jpeg");
    expect(Buffer.from(images[0].data!, "base64").subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  });

  it("returns collections with briefs and selection notes", async () => {
    const cols = await callJson("list_design_collections");
    expect(cols.data[0].brief).toBe("Premium pet shampoo website");
    const items = await callJson("get_collection_references", { collectionId });
    expect(items.data.items[0].whySelected).toBe("Best product presentation");
  });

  it("filters design patterns by verified interactions", async () => {
    const verified = await callJson("get_design_patterns", { interaction: ["Sticky Elements"], verifiedOnly: true });
    expect(verified.data.results.map((r: { id: string }) => r.id)).toEqual([petId]);
    const parallax = await callJson("get_design_patterns", { interaction: ["Parallax"], verifiedOnly: true });
    expect(parallax.data.results).toHaveLength(0);
  });

  it("runs on a connection where SQLite rejects writes", async () => {
    await expect(rawAll(`delete from "references"`)).rejects.toThrow(/readonly|read-only|query_only|attempt to write/i);
  });
});

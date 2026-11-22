/**
 * Read-only MCP tool definitions for Design Vault. Every tool queries the real
 * database; nothing is hardcoded. Used by `mcp/server.ts` (stdio) and tests.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import sharp from "sharp";
import { z } from "zod";
import { CAPTURED_THEMES, DARK_MODE_SUPPORT, LABELS, TERM_KIND_LABELS, TERM_KINDS, VIEWPORTS, type Filters } from "@/lib/domain";
import { getReferenceContext, getSimilarForAgent, searchForAgent } from "./agent";
import { slugify } from "./ids";
import { getCollection, listCollections } from "./repositories/collections";
import { getReference } from "./repositories/references";
import { listTerms } from "./repositories/taxonomy";
import { getStorage } from "./storage";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const list = z.array(z.string().max(80)).max(20).optional();
const filterShape = {
  industry: list.describe("Industry names or slugs, e.g. ['Pet Care']"),
  pageType: list.describe("Page types, e.g. ['Product Detail Page']"),
  component: list.describe("UI components, e.g. ['Hero', 'Sticky CTA']"),
  visualStyle: list.describe("Visual styles, e.g. ['Editorial', 'Minimalist']"),
  layout: list.describe("Layout characteristics, e.g. ['Bento Grid']"),
  interaction: list.describe("Interaction/motion patterns, e.g. ['Scroll Reveal']"),
  tag: list.describe("Free tags"),
  theme: z.array(z.enum(CAPTURED_THEMES)).optional().describe("Captured screenshot theme"),
  viewport: z.array(z.enum(VIEWPORTS)).optional().describe("Captured viewport"),
  darkMode: z.array(z.enum(DARK_MODE_SUPPORT)).optional().describe("Whether the source website supports dark mode"),
  favoritesOnly: z.boolean().optional(),
  collectionId: z.string().max(40).optional(),
};

type FilterArgs = { [K in keyof typeof filterShape]?: z.infer<(typeof filterShape)[K]> };

function toFilters(args: FilterArgs): Partial<Filters> {
  const slugs = (v?: string[]) => (v ?? []).map(slugify).filter(Boolean);
  return {
    industry: slugs(args.industry),
    pageType: slugs(args.pageType),
    component: slugs(args.component),
    visualStyle: slugs(args.visualStyle),
    layout: slugs(args.layout),
    interaction: slugs(args.interaction),
    tag: slugs(args.tag),
    theme: args.theme ?? [],
    viewport: args.viewport ?? [],
    darkMode: args.darkMode ?? [],
    favorite: args.favoritesOnly ? true : undefined,
    collection: args.collectionId,
  };
}

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function fail(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

/** Agent-friendly image rendering: large previews are downscaled; tall pages are split into segments. */
async function renderForAgent(data: Buffer, mode: "auto" | "full" | "top", maxSegments: number) {
  const meta = await sharp(data).metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;
  const targetW = Math.min(1200, width);
  const scaledH = Math.round((height * targetW) / width);
  const segmentH = Math.round(targetW * 1.4);
  const resized = await sharp(data).resize({ width: targetW, withoutEnlargement: true }).toBuffer();

  if (mode === "full" || scaledH <= segmentH * 1.15) {
    // Keep within ~8000px on the long edge for vision models.
    const limit = 7800;
    const out = scaledH > limit ? await sharp(resized).resize({ height: limit }).jpeg({ quality: 78 }).toBuffer() : await sharp(resized).jpeg({ quality: 80 }).toBuffer();
    return [{ data: out, note: `Full image (${width}x${height} original, sent at ${scaledH > limit ? Math.round((targetW * limit) / scaledH) : targetW}px wide)` }];
  }
  const segments = mode === "top" ? 1 : Math.min(maxSegments, Math.ceil(scaledH / segmentH));
  const out: { data: Buffer; note: string }[] = [];
  for (let i = 0; i < segments; i++) {
    const top = i * segmentH;
    const h = Math.min(segmentH, scaledH - top);
    if (h <= 0) break;
    const buf = await sharp(resized).extract({ left: 0, top, width: targetW, height: h }).jpeg({ quality: 80 }).toBuffer();
    out.push({ data: buf, note: `Segment ${i + 1} of ${Math.ceil(scaledH / segmentH)} (from top ${Math.round((top / scaledH) * 100)}% of page)` });
  }
  return out;
}

export function createDesignVaultServer() {
  const server = new McpServer(
    { name: "design-vault", version: "1.0.0" },
    {
      instructions:
        "Design Vault is the user's curated library of website and UI screenshots. Use it to ground design decisions in saved references: search first with compact results, open full context only for 3–6 relevant references, and load screenshots only when visual details matter. Observed facts, curator notes and AI suggestions are labelled separately; never treat AI suggestions or unverified interactions as evidence. Always cite reference IDs. Use references to inform principles; never reproduce layouts, branding, copy or assets.",
    },
  );

  server.registerTool(
    "search_design_references",
    {
      title: "Search design references",
      description:
        "Search the vault with a natural-language brief and/or structured filters. Returns compact summaries ranked by relevance with explanations and stable reference IDs. Start here. Call list_design_taxonomy to see valid filter values.",
      inputSchema: {
        query: z.string().max(500).optional().describe("Brief or keywords, e.g. 'premium pet care product page with sticky purchase bar'"),
        ...filterShape,
        includeArchived: z.boolean().optional(),
        limit: z.number().int().min(1).max(25).optional().describe("Default 8"),
        offset: z.number().int().min(0).optional(),
      },
      annotations: READ_ONLY,
    },
    async (args) => {
      const filters = toFilters(args);
      if (args.includeArchived) filters.status = ["to_review", "curated", "archived"];
      const res = await searchForAgent({ query: args.query, filters, limit: args.limit ?? 8, offset: args.offset ?? 0 });
      return json({
        total: res.total,
        returned: res.results.length,
        nextOffset: res.offset + res.results.length < res.total ? res.offset + res.results.length : null,
        matchedVocabulary: res.matchedTerms,
        results: res.results,
        hint: res.total === 0 ? "No matches. Try fewer filters, broader words, or list_design_taxonomy for valid values." : "Use get_reference_context for the most relevant 3–6 IDs.",
      });
    },
  );

  server.registerTool(
    "get_reference_context",
    {
      title: "Get reference context",
      description:
        "Compact, agent-friendly analysis of one reference: source, classification, observed facts, curator notes, reusable principles, limitations, unverified AI suggestions and screenshot availability.",
      inputSchema: { id: z.string().max(40), includeSimilar: z.boolean().optional() },
      annotations: READ_ONLY,
    },
    async ({ id, includeSimilar }) => {
      const ctx = await getReferenceContext(id);
      if (!ctx) return fail(`No reference with id ${id}.`);
      return json(includeSimilar ? { ...ctx, similar: await getSimilarForAgent(id) } : ctx);
    },
  );

  server.registerTool(
    "get_design_reference",
    {
      title: "Get design reference",
      description: "Full structured metadata for one reference, including every classification, timestamp and screenshot record.",
      inputSchema: { id: z.string().max(40) },
      annotations: READ_ONLY,
    },
    async ({ id }) => {
      const ref = await getReference(id);
      if (!ref) return fail(`No reference with id ${id}.`);
      const { images, cover: _cover, ...rest } = ref;
      void _cover;
      return json({
        ...rest,
        images: images.map(({ urls: _u, ...img }) => {
          void _u;
          return img;
        }),
      });
    },
  );

  server.registerTool(
    "get_reference_images",
    {
      title: "Get reference images",
      description:
        "Returns actual screenshot content for one reference. By default sends the first screenshot as an agent-sized image; tall full-page captures are split into top-to-bottom segments. Only call for references you are actively analysing.",
      inputSchema: {
        id: z.string().max(40),
        imageIds: z.array(z.string().max(40)).max(6).optional().describe("Specific screenshots; defaults to the first one"),
        variant: z.enum(["preview", "thumb", "original"]).optional().describe("preview (default), thumb (small, cheap), original (untouched; large)"),
        mode: z.enum(["auto", "top", "full"]).optional().describe("auto: segment tall pages; top: first segment only; full: whole page in one image"),
        maxSegments: z.number().int().min(1).max(6).optional().describe("Default 3"),
      },
      annotations: READ_ONLY,
    },
    async ({ id, imageIds, variant = "preview", mode = "auto", maxSegments = 3 }) => {
      const ref = await getReference(id);
      if (!ref) return fail(`No reference with id ${id}.`);
      const selected = imageIds?.length ? ref.images.filter((i) => imageIds.includes(i.id)) : ref.images.slice(0, 1);
      if (!selected.length) return fail("None of the requested images belong to this reference.");
      const storage = getStorage();
      const content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[] = [
        {
          type: "text",
          text: JSON.stringify({
            referenceId: ref.id,
            title: ref.title,
            sourceUrl: ref.sourceUrl,
            available: ref.images.map((i) => ({
              imageId: i.id,
              media: i.mediaType,
              ...(i.durationMs ? { durationSeconds: Math.round(i.durationMs / 100) / 10 } : {}),
              label: i.label,
              viewport: i.viewport,
              theme: i.theme,
              type: i.screenshotType,
              size: `${i.width}x${i.height}`,
            })),
          }),
        },
      ];
      const { getImage } = await import("./repositories/references");
      for (const img of selected) {
        const row = await getImage(img.id);
        if (!row) continue;
        // Videos can't be sent as images: use the poster frame and say so.
        const isVideo = row.mediaType === "video";
        const key = variant === "thumb" ? row.thumbKey : variant === "original" && !isVideo ? row.originalKey : row.previewKey;
        if (isVideo) {
          content.push({
            type: "text",
            text: `${img.id} is an MP4 video (${Math.round((row.durationMs ?? 0) / 100) / 10}s, ${row.width}x${row.height}). Showing its poster frame only — motion is not visible here; rely on the curator's interaction notes and verified interactions for behavior.`,
          });
        }
        const data = await storage.get(key);
        if (!data) {
          content.push({ type: "text", text: `Image ${img.id}: file missing from storage.` });
          continue;
        }
        const label = `${img.id} · ${LABELS.viewport[img.viewport]} · ${LABELS.capturedTheme[img.theme]} theme · ${LABELS.screenshotType[img.screenshotType]}`;
        if (variant === "thumb") {
          content.push({ type: "text", text: `${label} (thumbnail)` }, { type: "image", data: data.toString("base64"), mimeType: "image/webp" });
          continue;
        }
        const parts = await renderForAgent(data, mode, maxSegments);
        for (const p of parts) {
          content.push({ type: "text", text: `${label} — ${p.note}` }, { type: "image", data: p.data.toString("base64"), mimeType: "image/jpeg" });
        }
      }
      return { content };
    },
  );

  server.registerTool(
    "find_similar_references",
    {
      title: "Find similar references",
      description: "References that share meaningful metadata (industry, page type, layout, style, components) with a given reference, with the shared attributes listed.",
      inputSchema: { id: z.string().max(40), limit: z.number().int().min(1).max(20).optional() },
      annotations: READ_ONLY,
    },
    async ({ id, limit }) => {
      const ref = await getReference(id);
      if (!ref) return fail(`No reference with id ${id}.`);
      return json({ referenceId: id, similar: await getSimilarForAgent(id, limit ?? 6) });
    },
  );

  server.registerTool(
    "list_design_collections",
    {
      title: "List design collections",
      description: "Collections and project moodboards (with their website briefs) curated by the user.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const cols = await listCollections();
      return json(cols.map((c) => ({ id: c.id, name: c.name, kind: c.kind, description: c.description, brief: c.brief, referenceCount: c.referenceCount, updatedAt: c.updatedAt })));
    },
  );

  server.registerTool(
    "get_collection_references",
    {
      title: "Get collection references",
      description: "References in a collection, in curated order, with the user's note on why each was selected. Moodboards include their website brief.",
      inputSchema: { collectionId: z.string().max(40), limit: z.number().int().min(1).max(50).optional(), offset: z.number().int().min(0).optional() },
      annotations: READ_ONLY,
    },
    async ({ collectionId, limit = 20, offset = 0 }) => {
      const col = await getCollection(collectionId);
      if (!col) return fail(`No collection with id ${collectionId}.`);
      const items = col.items.slice(offset, offset + limit);
      return json({
        id: col.id,
        name: col.name,
        kind: col.kind,
        description: col.description,
        brief: col.brief,
        total: col.items.length,
        nextOffset: offset + items.length < col.items.length ? offset + items.length : null,
        items: items.map((i) => ({
          position: i.position + 1,
          whySelected: i.note,
          id: i.reference.id,
          title: i.reference.title,
          site: i.reference.siteName,
          sourceUrl: i.reference.sourceUrl,
          industry: i.reference.industry?.name ?? null,
          pageType: i.reference.pageType?.name ?? null,
          visualStyles: i.reference.visualStyles.map((s) => s.name),
          screenshots: i.reference.imageCount,
        })),
      });
    },
  );

  server.registerTool(
    "get_design_patterns",
    {
      title: "Get design patterns",
      description:
        "Find references demonstrating a UI component, layout, interaction or visual pattern, with the curator's pattern-relevant notes. Interactions are flagged verified/unverified; set verifiedOnly to exclude unverified motion claims.",
      inputSchema: {
        component: list,
        layout: list,
        interaction: list,
        visualStyle: list,
        pattern: z.string().max(200).optional().describe("Free-text pattern, e.g. 'mega menu' or 'sticky add to cart'"),
        verifiedOnly: z.boolean().optional(),
        limit: z.number().int().min(1).max(20).optional(),
      },
      annotations: READ_ONLY,
    },
    async (args) => {
      const filters = toFilters({ component: args.component, layout: args.layout, interaction: args.interaction, visualStyle: args.visualStyle });
      const res = await searchForAgent({ query: args.pattern, filters, limit: Math.min(50, (args.limit ?? 8) * 2) });
      const out = [];
      for (const r of res.results) {
        const ref = await getReference(r.id);
        if (!ref) continue;
        const interactions = ref.interactions.map((i) => ({ name: i.name, verified: i.verified }));
        if (args.verifiedOnly && args.interaction?.length) {
          const wanted = new Set(args.interaction.map(slugify));
          if (!ref.interactions.some((i) => wanted.has(i.slug) && i.verified)) continue;
        }
        out.push({
          id: ref.id,
          title: ref.title,
          sourceUrl: ref.sourceUrl,
          components: ref.components.map((t) => t.name),
          layouts: ref.layouts.map((t) => t.name),
          interactions,
          notes: {
            observed: ref.analysis?.observations ?? null,
            layout: ref.analysis?.layoutNotes ?? null,
            interaction: ref.analysis?.interactionNotes ?? null,
            reusablePrinciples: ref.analysis?.usageIdeas ?? null,
          },
          relevance: r.relevance,
        });
        if (out.length >= (args.limit ?? 8)) break;
      }
      return json({ total: out.length, results: out });
    },
  );

  server.registerTool(
    "list_design_taxonomy",
    {
      title: "List design taxonomy",
      description: "Valid classification values (industries, page types, components, styles, layouts, interactions, tags) with usage counts. Use names in search filters.",
      inputSchema: { onlyUsed: z.boolean().optional().describe("Default true: hide unused terms") },
      annotations: READ_ONLY,
    },
    async ({ onlyUsed = true }) => {
      const terms = await listTerms();
      return json(
        Object.fromEntries(
          TERM_KINDS.map((k) => [
            TERM_KIND_LABELS[k].plural,
            terms.filter((t) => t.kind === k && (!onlyUsed || t.count > 0)).map((t) => `${t.name} (${t.count})`),
          ]),
        ),
      );
    },
  );

  return server;
}

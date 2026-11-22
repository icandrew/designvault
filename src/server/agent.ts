/**
 * Agent-facing read layer shared by the REST API and the MCP server.
 *
 * Design goals (token efficiency + traceability):
 *  - Compact summaries first; full detail and images only on request.
 *  - Every result carries a stable reference ID, source URL and a relevance
 *    explanation so agents can cite the evidence behind design decisions.
 *  - Observed facts, curator notes and AI suggestions are kept separate.
 */
import type { Filters } from "@/lib/domain";
import { LABELS } from "@/lib/domain";
import type { ReferenceDetail } from "@/lib/types";
import { rawAll } from "./db/client";
import type { TermKind } from "./db/schema";
import { buildWhere, findRelated, getReference, getSummaries, tokenize } from "./repositories/references";

const STOPWORDS = new Set(
  "a an and are as at be best brand by create design designs do example examples find for from good great has have how i in into is it its me my need of on or our page pages references reference selling sell show site sites some that the their them these this to use using want we web website websites which with work you your".split(
    " ",
  ),
);

const KIND_WEIGHT: Record<TermKind, number> = {
  industry: 5,
  page_type: 4,
  component: 3,
  layout: 3,
  visual_style: 3,
  interaction: 2,
  tag: 2,
};

const KIND_LABEL: Record<TermKind, string> = {
  industry: "industry",
  page_type: "page type",
  component: "component",
  layout: "layout",
  visual_style: "visual style",
  interaction: "interaction",
  tag: "tag",
};

function stem(token: string) {
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

function normalizeTokens(text: string, max = 5000) {
  const out = new Set<string>();
  for (const t of tokenize(text, max)) {
    if (STOPWORDS.has(t)) continue;
    out.add(stem(t));
    if (t.includes("-")) {
      out.add(stem(t.replace(/-/g, "")));
      for (const part of t.split("-")) if (part && !STOPWORDS.has(part)) out.add(stem(part));
    }
  }
  return out;
}

export interface AgentSearchResult {
  id: string;
  title: string;
  site: string | null;
  sourceUrl: string | null;
  industry: string | null;
  pageType: string | null;
  visualStyles: string[];
  layouts: string[];
  components: string[];
  capturedTheme: string;
  viewport: string;
  screenshots: number;
  videos: number;
  isFavorite: boolean;
  status: string;
  isSample: boolean;
  relevance: { score: number; reasons: string[] };
}

interface Candidate {
  id: string;
  title: string;
  search_text: string;
  site_name: string | null;
  source_url: string | null;
  is_favorite: number;
  status: string;
}

/**
 * Ranked search for agents. Structured filters narrow the candidate set; a
 * free-text brief is matched against the controlled vocabulary (multi-word
 * terms such as "Product Detail Page") and then against all metadata.
 */
export async function searchForAgent(params: {
  query?: string;
  filters?: Partial<Filters>;
  limit?: number;
  offset?: number;
}) {
  const limit = Math.min(Math.max(params.limit ?? 8, 1), 50);
  const offset = Math.max(params.offset ?? 0, 0);
  const { q: _ignored, ...structured } = params.filters ?? {};
  void _ignored;
  const { where, params: sqlParams } = buildWhere(structured);
  const candidates = await rawAll<Candidate>(
    `select r.id, r.title, r.search_text, r.site_name, r.source_url, r.is_favorite, r.status
       from "references" r ${where} order by r.created_at desc limit 5000`,
    sqlParams,
  );
  if (candidates.length === 0) return { total: 0, offset, limit, results: [] as AgentSearchResult[], matchedTerms: [] as string[] };

  const ids = candidates.map((c) => c.id);
  const termRows = await rawAll<{ reference_id: string; kind: TermKind; name: string; slug: string }>(
    `with links as (
       select reference_id, term_id from reference_terms
       union all select id, industry_id from "references" where industry_id is not null
       union all select id, page_type_id from "references" where page_type_id is not null)
     select l.reference_id, t.kind, t.name, t.slug from links l join terms t on t.id = l.term_id
      where l.reference_id in (select value from json_each(?))`,
    [JSON.stringify(ids)],
  );
  const termsByRef = new Map<string, { kind: TermKind; name: string; slug: string }[]>();
  for (const t of termRows) {
    const list = termsByRef.get(t.reference_id) ?? [];
    list.push({ kind: t.kind, name: t.name, slug: t.slug });
    termsByRef.set(t.reference_id, list);
  }

  const query = params.query?.trim() ?? "";
  const queryTokens = normalizeTokens(query, 40);
  const matchedVocabulary = new Map<string, { kind: TermKind; name: string }>();
  if (queryTokens.size) {
    const vocab = await rawAll<{ kind: TermKind; name: string; slug: string }>(`select kind, name, slug from terms`);
    for (const term of vocab) {
      const words = [...normalizeTokens(term.name.replace(/\band\b/gi, " "))];
      if (words.length && words.every((w) => queryTokens.has(w))) {
        matchedVocabulary.set(`${term.kind}:${term.slug}`, { kind: term.kind, name: term.name });
      }
    }
  }

  const scored = candidates.map((c) => {
    let score = 0;
    const reasons: string[] = [];
    if (queryTokens.size) {
      const refTerms = termsByRef.get(c.id) ?? [];
      for (const t of refTerms) {
        if (matchedVocabulary.has(`${t.kind}:${t.slug}`)) {
          score += KIND_WEIGHT[t.kind];
          reasons.push(`${KIND_LABEL[t.kind]}: ${t.name}`);
        }
      }
      const titleTokens = normalizeTokens(c.title);
      const textTokens = normalizeTokens(c.search_text);
      const textHits: string[] = [];
      for (const token of queryTokens) {
        if (titleTokens.has(token)) {
          score += 2;
          textHits.push(token);
        } else if (textTokens.has(token)) {
          score += 1;
          textHits.push(token);
        }
      }
      if (textHits.length) reasons.push(`metadata mentions: ${textHits.slice(0, 6).join(", ")}`);
    } else {
      reasons.push("matches the structured filters");
    }
    if (c.status === "curated") score += 0.5;
    if (c.is_favorite) score += 0.25;
    return { c, score, reasons };
  });

  const ranked = (queryTokens.size ? scored.filter((s) => s.reasons.length > 0 && s.score >= 1) : scored).sort(
    (a, b) => b.score - a.score,
  );
  const page = ranked.slice(offset, offset + limit);
  const summaries = await getSummaries(page.map((p) => p.c.id));
  const byId = new Map(summaries.map((s) => [s.id, s]));

  const results: AgentSearchResult[] = page.map(({ c, score, reasons }) => {
    const s = byId.get(c.id)!;
    const refTerms = termsByRef.get(c.id) ?? [];
    const names = (kind: TermKind) => refTerms.filter((t) => t.kind === kind).map((t) => t.name);
    return {
      id: c.id,
      title: c.title,
      site: c.site_name,
      sourceUrl: c.source_url,
      industry: s.industry?.name ?? null,
      pageType: s.pageType?.name ?? null,
      visualStyles: names("visual_style"),
      layouts: names("layout"),
      components: names("component"),
      capturedTheme: s.capturedTheme,
      viewport: s.capturedViewport,
      screenshots: s.imageCount,
      videos: s.videoCount,
      isFavorite: s.isFavorite,
      status: s.status,
      isSample: s.isSample,
      relevance: { score: Math.round(score * 100) / 100, reasons },
    };
  });

  return {
    total: ranked.length,
    offset,
    limit,
    results,
    matchedTerms: [...matchedVocabulary.values()].map((t) => `${KIND_LABEL[t.kind]}: ${t.name}`),
  };
}

// ---------------------------------------------------------------------------
// Compact context
// ---------------------------------------------------------------------------

const contextCache = new Map<string, { updatedAt: string; value: ReturnType<typeof buildContext> }>();

function buildContext(ref: ReferenceDetail) {
  const a = ref.analysis;
  const verifiedInteractions = ref.interactions.filter((i) => i.verified).map((i) => i.name);
  const unverifiedInteractions = ref.interactions.filter((i) => !i.verified).map((i) => i.name);
  const compact = <T extends Record<string, unknown>>(obj: T) =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0) && v !== "")) as Partial<T>;

  return {
    id: ref.id,
    title: ref.title,
    site: ref.siteName,
    sourceUrl: ref.sourceUrl,
    attribution: ref.attribution ?? (ref.siteName ? `Design by ${ref.siteName}. Saved for reference only; not owned by the vault owner.` : null),
    status: LABELS.status[ref.status],
    isSampleData: ref.isSample,
    classification: compact({
      industry: ref.industry?.name ?? null,
      additionalIndustries: ref.additionalIndustries.map((t) => t.name),
      pageType: ref.pageType?.name ?? null,
      visualStyles: ref.visualStyles.map((t) => t.name),
      layouts: ref.layouts.map((t) => t.name),
      components: ref.components.map((t) => t.name),
      tags: ref.tags.map((t) => t.name),
    }),
    capture: {
      screenshotType: LABELS.screenshotType[ref.screenshotType],
      capturedTheme: LABELS.capturedTheme[ref.capturedTheme],
      sourceSupportsDarkMode: LABELS.darkMode[ref.supportsDarkMode],
      viewport: LABELS.viewport[ref.capturedViewport],
    },
    /** Facts visible in the screenshot or verified from the source. */
    observed: compact({
      notes: a?.observations ?? null,
      verifiedInteractions,
    }),
    /** The vault owner's subjective assessment. Treat as informed opinion, not fact. */
    curatorNotes: compact({
      whyInteresting: a?.interesting ?? null,
      typography: a?.typographyNotes ?? null,
      color: a?.colorNotes ?? null,
      layout: a?.layoutNotes ?? null,
      interaction: a?.interactionNotes ?? null,
      uxStrengths: a?.uxStrengths ?? null,
      description: ref.description,
      unverifiedInteractionLabels: unverifiedInteractions,
    }),
    reusablePrinciples: a?.usageIdeas ?? null,
    limitations: a?.limitations ?? null,
    aiSuggestions: a?.aiSuggestions
      ? {
          text: a.aiSuggestions,
          reviewedByCurator: a.aiSuggestionsReviewed,
          caution: "Machine-generated observations. Do not treat as verified evidence.",
        }
      : null,
    screenshots: ref.images.map((img) => ({
      imageId: img.id,
      media: img.mediaType,
      ...(img.mediaType === "video" ? { durationSeconds: Math.round((img.durationMs ?? 0) / 100) / 10, note: "Video recording; MCP returns its poster frame" } : {}),
      label: img.label,
      viewport: LABELS.viewport[img.viewport],
      viewportSize: img.viewportWidth ? `${img.viewportWidth}x${img.viewportHeight ?? "?"}` : null,
      theme: LABELS.capturedTheme[img.theme],
      type: LABELS.screenshotType[img.screenshotType],
      size: `${img.width}x${img.height}`,
    })),
    guidance:
      "Use this reference to inform principles (hierarchy, rhythm, composition, interaction ideas). Do not reproduce its layout, branding, copy or assets. Cite the reference id in your design rationale.",
  };
}

export async function getReferenceContext(id: string) {
  const ref = await getReference(id);
  if (!ref) return null;
  const cached = contextCache.get(id);
  if (cached && cached.updatedAt === ref.updatedAt) return cached.value;
  const value = buildContext(ref);
  contextCache.set(id, { updatedAt: ref.updatedAt, value });
  if (contextCache.size > 500) contextCache.delete(contextCache.keys().next().value!);
  return value;
}

export async function getSimilarForAgent(id: string, limit = 6) {
  const related = await findRelated(id, { limit, minScore: 2 });
  return related.map((r) => ({
    id: r.reference.id,
    title: r.reference.title,
    site: r.reference.siteName,
    sourceUrl: r.reference.sourceUrl,
    industry: r.reference.industry?.name ?? null,
    pageType: r.reference.pageType?.name ?? null,
    score: r.score,
    sharedMetadata: r.sharedTerms.map((t) => `${KIND_LABEL[t.kind]}: ${t.name}`),
  }));
}

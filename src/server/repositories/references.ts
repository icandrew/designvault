/**
 * Reference repository: CRUD, filtering, metadata search, related references
 * and image management. All application features and both agent interfaces
 * (REST + MCP) go through these functions.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  TERM_FILTER_KEYS,
  type Filters,
  type ImageMeta,
  type ReferenceInputParsed,
} from "@/lib/domain";
import type {
  AnalysisDTO,
  CoverDTO,
  ImageDTO,
  Page,
  ReferenceDetail,
  ReferenceSummary,
  TermRef,
} from "@/lib/types";
import { getDb, rawAll, transaction, type SqlValue } from "../db/client";
import {
  collectionReferences,
  collections,
  designAnalyses,
  referenceImages,
  references,
  referenceTerms,
  terms,
  type ReferenceImageRow,
  type ReferenceRow,
  type TermKind,
} from "../db/schema";
import { newId } from "../ids";
import { hammingDistance, type ProcessedImage } from "../images";
import { getStorage } from "../storage";
import { resolveTermIds } from "./taxonomy";

export class NotFoundError extends Error {
  constructor(what = "Reference") {
    super(`${what} not found.`);
    this.name = "NotFoundError";
  }
}

export function imageUrls(id: string) {
  return {
    thumb: `/api/images/${id}/thumb`,
    preview: `/api/images/${id}/preview`,
    original: `/api/images/${id}/original`,
  };
}

export function toImageDTO(row: ReferenceImageRow): ImageDTO {
  return {
    id: row.id,
    referenceId: row.referenceId,
    position: row.position,
    label: row.label,
    mimeType: row.mimeType,
    mediaType: row.mediaType,
    durationMs: row.durationMs,
    width: row.width,
    height: row.height,
    previewWidth: row.previewWidth,
    previewHeight: row.previewHeight,
    thumbWidth: row.thumbWidth,
    thumbHeight: row.thumbHeight,
    bytes: row.bytes,
    viewport: row.viewport,
    viewportWidth: row.viewportWidth,
    viewportHeight: row.viewportHeight,
    theme: row.theme,
    screenshotType: row.screenshotType,
    source: row.source,
    createdAt: row.createdAt,
    urls: imageUrls(row.id),
  };
}

export function domainOf(url: string | null | undefined) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export function tokenize(q: string, max = 12) {
  return q
    .toLowerCase()
    .split(/[^\p{L}\p{N}-]+/u)
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter((t) => t.length > 0)
    .slice(0, max);
}

/** Builds a WHERE clause (alias `r`) for the shared filter model. */
export function buildWhere(filters: Partial<Filters>, options: { includeArchived?: boolean } = {}) {
  const clauses: string[] = [];
  const params: SqlValue[] = [];
  const placeholders = (values: string[]) => values.map(() => "?").join(",");

  if (filters.q) {
    for (const token of tokenize(filters.q)) {
      clauses.push(`r.search_text like ? escape '\\'`);
      params.push(`%${escapeLike(token)}%`);
    }
  }

  for (const [key, kind] of Object.entries(TERM_FILTER_KEYS) as [keyof typeof TERM_FILTER_KEYS, TermKind][]) {
    const values = (filters[key] as string[] | undefined) ?? [];
    if (!values.length) continue;
    const linked = `r.id in (select rt.reference_id from reference_terms rt join terms t on t.id = rt.term_id where t.kind = ? and t.slug in (${placeholders(values)}))`;
    if (kind === "industry") {
      clauses.push(
        `(r.industry_id in (select id from terms where kind = 'industry' and slug in (${placeholders(values)})) or ${linked})`,
      );
      params.push(...values, kind, ...values);
    } else if (kind === "page_type") {
      clauses.push(`r.page_type_id in (select id from terms where kind = 'page_type' and slug in (${placeholders(values)}))`);
      params.push(...values);
    } else {
      clauses.push(linked);
      params.push(kind, ...values);
    }
  }

  // Viewport / theme match the reference or any of its attached screenshots.
  if (filters.viewport?.length) {
    const ph = placeholders(filters.viewport);
    clauses.push(`(r.captured_viewport in (${ph}) or r.id in (select reference_id from reference_images where viewport in (${ph})))`);
    params.push(...filters.viewport, ...filters.viewport);
  }
  if (filters.theme?.length) {
    const ph = placeholders(filters.theme);
    clauses.push(`(r.captured_theme in (${ph}) or r.id in (select reference_id from reference_images where theme in (${ph})))`);
    params.push(...filters.theme, ...filters.theme);
  }
  if (filters.media?.length) {
    clauses.push(`r.id in (select reference_id from reference_images where media_type in (${placeholders(filters.media)}))`);
    params.push(...filters.media);
  }
  if (filters.darkMode?.length) {
    clauses.push(`r.supports_dark_mode in (${placeholders(filters.darkMode)})`);
    params.push(...filters.darkMode);
  }
  if (filters.status?.length) {
    clauses.push(`r.status in (${placeholders(filters.status)})`);
    params.push(...filters.status);
  } else if (!options.includeArchived) {
    clauses.push(`r.status != 'archived'`);
  }
  if (filters.favorite !== undefined) {
    clauses.push(`r.is_favorite = ?`);
    params.push(filters.favorite ? 1 : 0);
  }
  if (filters.collection) {
    clauses.push(`r.id in (select reference_id from collection_references where collection_id = ?)`);
    params.push(filters.collection);
  }
  if (filters.addedAfter) {
    clauses.push(`r.created_at >= ?`);
    params.push(filters.addedAfter);
  }
  if (filters.addedBefore) {
    clauses.push(`r.created_at <= ?`);
    params.push(filters.addedBefore);
  }
  return { where: clauses.length ? `where ${clauses.join(" and ")}` : "", params };
}

const ORDER_BY: Record<Filters["sort"], string> = {
  newest: "r.created_at desc, r.id desc",
  oldest: "r.created_at asc, r.id asc",
  title: "r.title collate nocase asc, r.id asc",
  updated: "r.updated_at desc, r.id desc",
};

export async function listReferences(
  filters: Partial<Filters>,
  { limit = 48, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<Page<ReferenceSummary>> {
  const { where, params } = buildWhere(filters);
  const order = ORDER_BY[filters.sort ?? "newest"];
  const [{ total }] = await rawAll<{ total: number }>(`select count(*) as total from "references" r ${where}`, params);
  const rows = await rawAll<{ id: string }>(
    `select r.id from "references" r ${where} order by ${order} limit ? offset ?`,
    [...params, limit, offset],
  );
  const items = await getSummaries(rows.map((r) => r.id));
  return { items, total: Number(total), limit, offset, hasMore: offset + items.length < Number(total) };
}

export async function countReferences(filters: Partial<Filters> = {}) {
  const { where, params } = buildWhere(filters);
  const [{ total }] = await rawAll<{ total: number }>(`select count(*) as total from "references" r ${where}`, params);
  return Number(total);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Card-level data for many references, preserving input order. */
export async function getSummaries(ids: string[]): Promise<ReferenceSummary[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const rows = await db.select().from(references).where(inArray(references.id, ids));
  const termIds = new Set<string>();
  for (const r of rows) {
    if (r.industryId) termIds.add(r.industryId);
    if (r.pageTypeId) termIds.add(r.pageTypeId);
  }
  const primaryTerms = termIds.size
    ? await db.select({ id: terms.id, name: terms.name, slug: terms.slug }).from(terms).where(inArray(terms.id, [...termIds]))
    : [];
  const termById = new Map(primaryTerms.map((t) => [t.id, { name: t.name, slug: t.slug }]));

  const styles = await db
    .select({ referenceId: referenceTerms.referenceId, name: terms.name, slug: terms.slug })
    .from(referenceTerms)
    .innerJoin(terms, eq(terms.id, referenceTerms.termId))
    .where(and(inArray(referenceTerms.referenceId, ids), eq(terms.kind, "visual_style")))
    .orderBy(asc(terms.name));
  const stylesByRef = new Map<string, TermRef[]>();
  for (const s of styles) {
    const list = stylesByRef.get(s.referenceId) ?? [];
    list.push({ name: s.name, slug: s.slug });
    stylesByRef.set(s.referenceId, list);
  }

  const images = await db
    .select({
      id: referenceImages.id,
      referenceId: referenceImages.referenceId,
      width: referenceImages.width,
      height: referenceImages.height,
      thumbWidth: referenceImages.thumbWidth,
      thumbHeight: referenceImages.thumbHeight,
      screenshotType: referenceImages.screenshotType,
      mediaType: referenceImages.mediaType,
      durationMs: referenceImages.durationMs,
    })
    .from(referenceImages)
    .where(inArray(referenceImages.referenceId, ids))
    .orderBy(asc(referenceImages.referenceId), asc(referenceImages.position), asc(referenceImages.createdAt));
  const coverByRef = new Map<string, CoverDTO>();
  const countByRef = new Map<string, number>();
  const videosByRef = new Map<string, number>();
  for (const img of images) {
    countByRef.set(img.referenceId, (countByRef.get(img.referenceId) ?? 0) + 1);
    if (img.mediaType === "video") videosByRef.set(img.referenceId, (videosByRef.get(img.referenceId) ?? 0) + 1);
    if (!coverByRef.has(img.referenceId)) {
      const { referenceId: _ref, ...cover } = img;
      void _ref;
      coverByRef.set(img.referenceId, cover);
    }
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is ReferenceRow => Boolean(r))
    .map((r) => ({
      id: r.id,
      title: r.title,
      siteName: r.siteName,
      sourceUrl: r.sourceUrl,
      sourceDomain: r.sourceDomain,
      industry: r.industryId ? termById.get(r.industryId) ?? null : null,
      pageType: r.pageTypeId ? termById.get(r.pageTypeId) ?? null : null,
      visualStyles: stylesByRef.get(r.id) ?? [],
      isFavorite: r.isFavorite,
      isSample: r.isSample,
      status: r.status,
      capturedTheme: r.capturedTheme,
      capturedViewport: r.capturedViewport,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      imageCount: countByRef.get(r.id) ?? 0,
      videoCount: videosByRef.get(r.id) ?? 0,
      cover: coverByRef.get(r.id) ?? null,
    }));
}

export async function getReference(id: string): Promise<ReferenceDetail | null> {
  const [summary] = await getSummaries([id]);
  if (!summary) return null;
  const db = await getDb();
  const [row] = await db.select().from(references).where(eq(references.id, id));

  const linked = await db
    .select({ kind: terms.kind, name: terms.name, slug: terms.slug, verified: referenceTerms.verified })
    .from(referenceTerms)
    .innerJoin(terms, eq(terms.id, referenceTerms.termId))
    .where(eq(referenceTerms.referenceId, id))
    .orderBy(asc(terms.name));
  const ofKind = (kind: TermKind) => linked.filter((t) => t.kind === kind).map(({ name, slug }) => ({ name, slug }));

  const images = await db
    .select()
    .from(referenceImages)
    .where(eq(referenceImages.referenceId, id))
    .orderBy(asc(referenceImages.position), asc(referenceImages.createdAt));

  const [analysis] = await db.select().from(designAnalyses).where(eq(designAnalyses.referenceId, id));
  const memberOf = await db
    .select({ id: collections.id, name: collections.name })
    .from(collectionReferences)
    .innerJoin(collections, eq(collections.id, collectionReferences.collectionId))
    .where(eq(collectionReferences.referenceId, id))
    .orderBy(asc(collections.name));

  let analysisDTO: AnalysisDTO | null = null;
  if (analysis) {
    const { referenceId: _r, ...rest } = analysis;
    void _r;
    analysisDTO = rest;
  }

  return {
    ...summary,
    description: row.description,
    additionalIndustries: ofKind("industry"),
    components: ofKind("component"),
    layouts: ofKind("layout"),
    interactions: linked
      .filter((t) => t.kind === "interaction")
      .map(({ name, slug, verified }) => ({ name, slug, verified })),
    tags: ofKind("tag"),
    screenshotType: row.screenshotType,
    supportsDarkMode: row.supportsDarkMode,
    attribution: row.attribution,
    licenseNotes: row.licenseNotes,
    capturedAt: row.capturedAt,
    images: images.map(toImageDTO),
    analysis: analysisDTO,
    collections: memberOf,
  };
}

export async function getImage(imageId: string) {
  const db = await getDb();
  const [row] = await db.select().from(referenceImages).where(eq(referenceImages.id, imageId));
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export interface NewImage {
  processed: ProcessedImage;
  meta: ImageMeta;
  source?: "upload" | "capture";
}

interface StoredImage {
  row: typeof referenceImages.$inferInsert;
  keys: string[];
}

/** Writes files first; callers must delete `keys` if the DB write fails. */
async function storeImageFiles(referenceId: string, image: NewImage, position: number): Promise<StoredImage> {
  const storage = getStorage();
  const id = newId("img");
  const { processed, meta } = image;
  const originalKey = `originals/${id}.${processed.format}`;
  const previewKey = `previews/${id}.${processed.preview.ext}`;
  const thumbKey = `thumbs/${id}.webp`;
  const keys: string[] = [];
  try {
    await storage.put(originalKey, processed.original);
    keys.push(originalKey);
    await storage.put(previewKey, processed.preview.data);
    keys.push(previewKey);
    await storage.put(thumbKey, processed.thumb.data);
    keys.push(thumbKey);
  } catch (error) {
    await Promise.all(keys.map((k) => storage.delete(k)));
    throw error;
  }
  return {
    keys,
    row: {
      id,
      referenceId,
      position,
      label: meta.label ?? null,
      originalKey,
      previewKey,
      thumbKey,
      mimeType: processed.mimeType,
      mediaType: processed.mediaType,
      durationMs: processed.durationMs,
      width: processed.width,
      height: processed.height,
      previewWidth: processed.preview.width,
      previewHeight: processed.preview.height,
      thumbWidth: processed.thumb.width,
      thumbHeight: processed.thumb.height,
      bytes: processed.bytes,
      sha256: processed.sha256,
      dhash: processed.dhash,
      viewport: meta.viewport,
      viewportWidth: meta.viewportWidth ?? null,
      viewportHeight: meta.viewportHeight ?? null,
      theme: meta.theme,
      screenshotType: meta.screenshotType,
      source: image.source ?? "upload",
    },
  };
}

async function deleteFiles(keys: string[]) {
  const storage = getStorage();
  await Promise.all(keys.map((k) => storage.delete(k).catch(() => undefined)));
}

async function writeTaxonomy(referenceId: string, input: ReferenceInputParsed) {
  const db = await getDb();
  const [industryId] = await resolveTermIds("industry", [input.industry]);
  const [pageTypeId] = input.pageType ? await resolveTermIds("page_type", [input.pageType]) : [null];
  const groups: { ids: string[]; verified?: Map<string, boolean> }[] = [
    { ids: (await resolveTermIds("industry", input.additionalIndustries)).filter((i) => i !== industryId) },
    { ids: await resolveTermIds("visual_style", input.visualStyles) },
    { ids: await resolveTermIds("layout", input.layouts) },
    { ids: await resolveTermIds("component", input.components) },
    { ids: await resolveTermIds("tag", input.tags) },
  ];
  const interactionIds = await resolveTermIds("interaction", input.interactions.map((i) => i.name));
  const verified = new Map<string, boolean>();
  input.interactions.forEach((i, idx) => {
    if (interactionIds[idx]) verified.set(interactionIds[idx], i.verified);
  });
  groups.push({ ids: interactionIds, verified });

  await db.delete(referenceTerms).where(eq(referenceTerms.referenceId, referenceId));
  const links = groups.flatMap((g) =>
    g.ids.map((termId) => ({ referenceId, termId, verified: g.verified?.get(termId) ?? false })),
  );
  if (links.length) await db.insert(referenceTerms).values(links).onConflictDoNothing();
  return { industryId: industryId ?? null, pageTypeId: pageTypeId ?? null };
}

async function writeAnalysis(referenceId: string, analysis: ReferenceInputParsed["analysis"]) {
  const db = await getDb();
  const values = {
    observations: analysis.observations ?? null,
    interesting: analysis.interesting ?? null,
    typographyNotes: analysis.typographyNotes ?? null,
    colorNotes: analysis.colorNotes ?? null,
    layoutNotes: analysis.layoutNotes ?? null,
    interactionNotes: analysis.interactionNotes ?? null,
    uxStrengths: analysis.uxStrengths ?? null,
    limitations: analysis.limitations ?? null,
    usageIdeas: analysis.usageIdeas ?? null,
    aiSuggestions: analysis.aiSuggestions ?? null,
    aiSuggestionsReviewed: analysis.aiSuggestionsReviewed ?? false,
    updatedAt: new Date().toISOString(),
  };
  await db
    .insert(designAnalyses)
    .values({ referenceId, ...values })
    .onConflictDoUpdate({ target: designAnalyses.referenceId, set: values });
}

async function writeCollections(referenceId: string, input: ReferenceInputParsed) {
  const db = await getDb();
  const ids = [...input.collectionIds];
  for (const name of input.newCollections) {
    const id = newId("col");
    await db.insert(collections).values({ id, name });
    ids.push(id);
  }
  const existing = await db
    .select({ collectionId: collectionReferences.collectionId })
    .from(collectionReferences)
    .where(eq(collectionReferences.referenceId, referenceId));
  const current = new Set(existing.map((e) => e.collectionId));
  const wanted = new Set(ids);
  const toRemove = [...current].filter((c) => !wanted.has(c));
  const toAdd = [...wanted].filter((c) => !current.has(c));
  if (toRemove.length) {
    await db
      .delete(collectionReferences)
      .where(and(eq(collectionReferences.referenceId, referenceId), inArray(collectionReferences.collectionId, toRemove)));
  }
  for (const collectionId of toAdd) {
    const [exists] = await db.select({ id: collections.id }).from(collections).where(eq(collections.id, collectionId));
    if (!exists) continue;
    const [{ max }] = await rawAll<{ max: number | null }>(
      `select max(position) as max from collection_references where collection_id = ?`,
      [collectionId],
    );
    await db.insert(collectionReferences).values({ collectionId, referenceId, position: (max ?? -1) + 1 });
    await db.update(collections).set({ updatedAt: new Date().toISOString() }).where(eq(collections.id, collectionId));
  }
}

export async function createReference(
  input: ReferenceInputParsed,
  images: NewImage[],
  options: { isSample?: boolean } = {},
): Promise<string> {
  if (images.length === 0) throw new Error("At least one screenshot is required.");
  const id = newId("ref");
  const stored: StoredImage[] = [];
  try {
    for (const [i, img] of images.entries()) stored.push(await storeImageFiles(id, img, i));
    const db = await getDb();
    await transaction(async () => {
      const nowIso = new Date().toISOString();
      await db.insert(references).values({
        id,
        title: input.title,
        siteName: input.siteName,
        sourceUrl: input.sourceUrl,
        sourceDomain: domainOf(input.sourceUrl),
        description: input.description,
        screenshotType: input.screenshotType,
        capturedTheme: input.capturedTheme,
        supportsDarkMode: input.supportsDarkMode,
        capturedViewport: input.capturedViewport,
        status: input.status,
        isFavorite: input.isFavorite,
        isSample: options.isSample ?? false,
        attribution: input.attribution,
        licenseNotes: input.licenseNotes,
        capturedAt: input.capturedAt,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      const { industryId, pageTypeId } = await writeTaxonomy(id, input);
      await db.update(references).set({ industryId, pageTypeId }).where(eq(references.id, id));
      await writeAnalysis(id, input.analysis);
      await db.insert(referenceImages).values(stored.map((s) => s.row));
      await writeCollections(id, input);
    });
  } catch (error) {
    await deleteFiles(stored.flatMap((s) => s.keys));
    throw error;
  }
  await rebuildSearchText(id);
  return id;
}

export async function updateReference(id: string, input: ReferenceInputParsed) {
  const db = await getDb();
  const [existing] = await db.select({ id: references.id }).from(references).where(eq(references.id, id));
  if (!existing) throw new NotFoundError();
  await transaction(async () => {
    const { industryId, pageTypeId } = await writeTaxonomy(id, input);
    await db
      .update(references)
      .set({
        title: input.title,
        siteName: input.siteName,
        sourceUrl: input.sourceUrl,
        sourceDomain: domainOf(input.sourceUrl),
        description: input.description,
        industryId,
        pageTypeId,
        screenshotType: input.screenshotType,
        capturedTheme: input.capturedTheme,
        supportsDarkMode: input.supportsDarkMode,
        capturedViewport: input.capturedViewport,
        status: input.status,
        isFavorite: input.isFavorite,
        attribution: input.attribution,
        licenseNotes: input.licenseNotes,
        capturedAt: input.capturedAt,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(references.id, id));
    await writeAnalysis(id, input.analysis);
    await writeCollections(id, input);
  });
  await rebuildSearchText(id);
}

export async function setFavorite(id: string, isFavorite: boolean) {
  const db = await getDb();
  const result = await db
    .update(references)
    .set({ isFavorite })
    .where(eq(references.id, id))
    .returning({ id: references.id });
  if (!result.length) throw new NotFoundError();
}

export async function deleteReference(id: string) {
  const db = await getDb();
  const images = await db
    .select({ o: referenceImages.originalKey, p: referenceImages.previewKey, t: referenceImages.thumbKey })
    .from(referenceImages)
    .where(eq(referenceImages.referenceId, id));
  const imageIds = await db.select({ id: referenceImages.id }).from(referenceImages).where(eq(referenceImages.referenceId, id));
  const deleted = await transaction(async () => {
    // Child rows are removed explicitly (not only via ON DELETE CASCADE), because
    // hosted libSQL connections don't enforce foreign keys.
    if (imageIds.length) {
      await db.update(collections).set({ coverImageId: null }).where(inArray(collections.coverImageId, imageIds.map((i) => i.id)));
    }
    await db.delete(referenceTerms).where(eq(referenceTerms.referenceId, id));
    await db.delete(designAnalyses).where(eq(designAnalyses.referenceId, id));
    await db.delete(collectionReferences).where(eq(collectionReferences.referenceId, id));
    await db.delete(referenceImages).where(eq(referenceImages.referenceId, id));
    return db.delete(references).where(eq(references.id, id)).returning({ id: references.id });
  });
  if (!deleted.length) throw new NotFoundError();
  await deleteFiles(images.flatMap((i) => [i.o, i.p, i.t]));
}

export async function addImages(referenceId: string, images: NewImage[]) {
  const db = await getDb();
  const [ref] = await db.select({ id: references.id }).from(references).where(eq(references.id, referenceId));
  if (!ref) throw new NotFoundError();
  const [{ max }] = await rawAll<{ max: number | null }>(
    `select max(position) as max from reference_images where reference_id = ?`,
    [referenceId],
  );
  let position = (max ?? -1) + 1;
  const stored: StoredImage[] = [];
  try {
    for (const img of images) stored.push(await storeImageFiles(referenceId, img, position++));
    await db.insert(referenceImages).values(stored.map((s) => s.row));
    await touch(referenceId);
  } catch (error) {
    await deleteFiles(stored.flatMap((s) => s.keys));
    throw error;
  }
  return stored.map((s) => s.row.id);
}

export async function replaceImage(imageId: string, image: NewImage) {
  const old = await getImage(imageId);
  if (!old) throw new NotFoundError("Image");
  const stored = await storeImageFiles(old.referenceId, image, old.position);
  const db = await getDb();
  try {
    const { id: _newId, referenceId: _r, position: _p, ...rest } = stored.row;
    void _newId;
    void _r;
    void _p;
    // Keep the image ID, position and descriptive metadata; point it at the new files.
    await db
      .update(referenceImages)
      .set({
        ...rest,
        label: image.meta.label ?? old.label,
        viewport: old.viewport,
        viewportWidth: old.viewportWidth,
        viewportHeight: old.viewportHeight,
        theme: old.theme,
        screenshotType: old.screenshotType,
      })
      .where(eq(referenceImages.id, imageId));
  } catch (error) {
    await deleteFiles(stored.keys);
    throw error;
  }
  await deleteFiles([old.originalKey, old.previewKey, old.thumbKey]);
  await touch(old.referenceId);
}

export async function updateImageMeta(imageId: string, meta: Partial<ImageMeta>) {
  const db = await getDb();
  const old = await getImage(imageId);
  if (!old) throw new NotFoundError("Image");
  await db.update(referenceImages).set(meta).where(eq(referenceImages.id, imageId));
  await touch(old.referenceId);
}

export async function deleteImage(imageId: string) {
  const old = await getImage(imageId);
  if (!old) throw new NotFoundError("Image");
  const [{ n }] = await rawAll<{ n: number }>(`select count(*) as n from reference_images where reference_id = ?`, [
    old.referenceId,
  ]);
  if (Number(n) <= 1) throw new Error("A reference needs at least one screenshot. Replace it instead.");
  const db = await getDb();
  await transaction(async () => {
    await db.update(collections).set({ coverImageId: null }).where(eq(collections.coverImageId, imageId));
    await db.delete(referenceImages).where(eq(referenceImages.id, imageId));
  });
  await deleteFiles([old.originalKey, old.previewKey, old.thumbKey]);
  await touch(old.referenceId);
}

export async function reorderImages(referenceId: string, imageIds: string[]) {
  const db = await getDb();
  await transaction(async () => {
    for (const [position, id] of imageIds.entries()) {
      await db
        .update(referenceImages)
        .set({ position })
        .where(and(eq(referenceImages.id, id), eq(referenceImages.referenceId, referenceId)));
    }
  });
  await touch(referenceId);
}

async function touch(referenceId: string) {
  const db = await getDb();
  await db.update(references).set({ updatedAt: new Date().toISOString() }).where(eq(references.id, referenceId));
}

/** Recomputes the denormalized search text from all searchable metadata. */
export async function rebuildSearchText(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(references).where(eq(references.id, id));
  if (!row) return;
  const termRows = await rawAll<{ name: string; kind: string }>(
    `select t.name, t.kind from terms t where t.id in (
       select term_id from reference_terms where reference_id = ?
       union select industry_id from "references" where id = ? and industry_id is not null
       union select page_type_id from "references" where id = ? and page_type_id is not null)`,
    [id, id, id],
  );
  const [analysis] = await db.select().from(designAnalyses).where(eq(designAnalyses.referenceId, id));
  const labels = await rawAll<{ label: string | null }>(
    `select label from reference_images where reference_id = ?
     union all select 'video motion animation' from reference_images where reference_id = ? and media_type = 'video'`,
    [id, id],
  );
  const parts = [
    row.title,
    row.siteName,
    row.sourceUrl,
    row.sourceDomain,
    row.description,
    row.attribution,
    row.screenshotType.replace("_", " "),
    `${row.capturedTheme} theme`,
    row.capturedViewport,
    ...termRows.map((t) => t.name),
    ...labels.map((l) => l.label),
    analysis?.observations,
    analysis?.interesting,
    analysis?.typographyNotes,
    analysis?.colorNotes,
    analysis?.layoutNotes,
    analysis?.interactionNotes,
    analysis?.uxStrengths,
    analysis?.limitations,
    analysis?.usageIdeas,
  ];
  const searchText = parts.filter(Boolean).join(" \n ").toLowerCase();
  await db.update(references).set({ searchText }).where(eq(references.id, id));
}

// ---------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------

export interface DuplicateMatch {
  referenceId: string;
  title: string;
  imageId: string;
  kind: "exact" | "similar";
  distance: number;
}

export async function findDuplicateImages(sha256: string, dhash: string, threshold = 5): Promise<DuplicateMatch[]> {
  const rows = await rawAll<{ id: string; reference_id: string; sha256: string; dhash: string; title: string }>(
    `select i.id, i.reference_id, i.sha256, i.dhash, r.title from reference_images i join "references" r on r.id = i.reference_id`,
  );
  const matches: DuplicateMatch[] = [];
  for (const r of rows) {
    if (r.sha256 === sha256) {
      matches.push({ referenceId: r.reference_id, title: r.title, imageId: r.id, kind: "exact", distance: 0 });
      continue;
    }
    const distance = hammingDistance(r.dhash, dhash);
    if (distance <= threshold) {
      matches.push({ referenceId: r.reference_id, title: r.title, imageId: r.id, kind: "similar", distance });
    }
  }
  return matches.sort((a, b) => a.distance - b.distance).slice(0, 5);
}

export async function findBySourceUrl(url: string) {
  const normalized = url.replace(/[#?].*$/, "").replace(/\/+$/, "").toLowerCase();
  const rows = await rawAll<{ id: string; title: string; source_url: string }>(
    `select id, title, source_url from "references" where source_url is not null and lower(rtrim(source_url, '/')) like ? escape '\\'`,
    [`${escapeLike(normalized)}%`],
  );
  return rows
    .filter((r) => r.source_url.replace(/[#?].*$/, "").replace(/\/+$/, "").toLowerCase() === normalized)
    .map((r) => ({ id: r.id, title: r.title }));
}

// ---------------------------------------------------------------------------
// Related references
// ---------------------------------------------------------------------------

const RELATION_WEIGHTS: Record<TermKind, number> = {
  industry: 3,
  page_type: 2.5,
  layout: 2,
  visual_style: 2,
  component: 1.5,
  interaction: 1,
  tag: 1,
};

export interface RelatedReference {
  reference: ReferenceSummary;
  score: number;
  sharedTerms: { kind: TermKind; name: string }[];
}

/**
 * Finds references sharing meaningful metadata. A minimum score avoids
 * returning loosely related images simply to fill space.
 */
export async function findRelated(id: string, { limit = 8, minScore = 3 } = {}): Promise<RelatedReference[]> {
  const rows = await rawAll<{ reference_id: string; kind: TermKind; name: string }>(
    `with mine as (
       select term_id from reference_terms where reference_id = ?1
       union select industry_id from "references" where id = ?1 and industry_id is not null
       union select page_type_id from "references" where id = ?1 and page_type_id is not null
     ),
     theirs as (
       select reference_id, term_id from reference_terms
       union all select id, industry_id from "references" where industry_id is not null
       union all select id, page_type_id from "references" where page_type_id is not null
     )
     select distinct theirs.reference_id, t.kind, t.name
     from theirs join mine on mine.term_id = theirs.term_id
     join terms t on t.id = theirs.term_id
     join "references" r on r.id = theirs.reference_id
     where theirs.reference_id != ?1 and r.status != 'archived'`,
    [id],
  );
  const scores = new Map<string, { score: number; shared: { kind: TermKind; name: string }[] }>();
  for (const row of rows) {
    const entry = scores.get(row.reference_id) ?? { score: 0, shared: [] };
    if (!entry.shared.some((s) => s.kind === row.kind && s.name === row.name)) {
      entry.score += RELATION_WEIGHTS[row.kind];
      entry.shared.push({ kind: row.kind, name: row.name });
    }
    scores.set(row.reference_id, entry);
  }
  const ranked = [...scores.entries()]
    .filter(([, v]) => v.score >= minScore)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit);
  const summaries = await getSummaries(ranked.map(([refId]) => refId));
  const byId = new Map(summaries.map((s) => [s.id, s]));
  return ranked
    .filter(([refId]) => byId.has(refId))
    .map(([refId, v]) => ({ reference: byId.get(refId)!, score: v.score, sharedTerms: v.shared }));
}

export async function getLibraryStats() {
  const [row] = await rawAll<{ refs: number; images: number; favorites: number; samples: number }>(
    `select (select count(*) from "references") as refs,
            (select count(*) from reference_images) as images,
            (select count(*) from "references" where is_favorite = 1) as favorites,
            (select count(*) from "references" where is_sample = 1) as samples`,
  );
  return {
    references: Number(row.refs),
    images: Number(row.images),
    favorites: Number(row.favorites),
    samples: Number(row.samples),
  };
}

export async function deleteSampleReferences() {
  const rows = await rawAll<{ id: string }>(`select id from "references" where is_sample = 1`);
  for (const r of rows) await deleteReference(r.id);
  return rows.length;
}

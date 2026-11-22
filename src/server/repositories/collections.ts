import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { CollectionInput } from "@/lib/domain";
import { collectionInputSchema } from "@/lib/domain";
import type { CollectionDetail, CollectionSummary, CoverDTO } from "@/lib/types";
import { getDb, rawAll, transaction } from "../db/client";
import { collectionReferences, collections, references } from "../db/schema";
import { newId } from "../ids";
import { getSummaries, NotFoundError } from "./references";

async function coversFor(collectionIds: string[]) {
  const result = new Map<string, CoverDTO[]>();
  if (!collectionIds.length) return result;
  const placeholders = collectionIds.map(() => "?").join(",");
  // First image of the first four references in each collection (or the explicit cover first).
  const rows = await rawAll<{
    collection_id: string;
    id: string;
    width: number;
    height: number;
    thumb_width: number;
    thumb_height: number;
    screenshot_type: CoverDTO["screenshotType"];
    media_type: CoverDTO["mediaType"];
    duration_ms: number | null;
    cover_first: number;
  }>(
    `select cr.collection_id, i.id, i.width, i.height, i.thumb_width, i.thumb_height, i.screenshot_type, i.media_type, i.duration_ms,
            case when c.cover_image_id = i.id then 0 else 1 end as cover_first
       from collection_references cr
       join collections c on c.id = cr.collection_id
       join reference_images i on i.id = (
         select id from reference_images where reference_id = cr.reference_id order by position, created_at limit 1)
      where cr.collection_id in (${placeholders})
      order by cr.collection_id, cover_first, cr.position`,
    collectionIds,
  );
  const explicit = await rawAll<{ collection_id: string; id: string; width: number; height: number; thumb_width: number; thumb_height: number; screenshot_type: CoverDTO["screenshotType"]; media_type: CoverDTO["mediaType"]; duration_ms: number | null }>(
    `select c.id as collection_id, i.id, i.width, i.height, i.thumb_width, i.thumb_height, i.screenshot_type, i.media_type, i.duration_ms
       from collections c join reference_images i on i.id = c.cover_image_id
      where c.id in (${placeholders})`,
    collectionIds,
  );
  const toCover = (r: (typeof explicit)[number]): CoverDTO => ({
    id: r.id,
    width: r.width,
    height: r.height,
    thumbWidth: r.thumb_width,
    thumbHeight: r.thumb_height,
    screenshotType: r.screenshot_type,
    mediaType: r.media_type,
    durationMs: r.duration_ms,
  });
  for (const r of explicit) result.set(r.collection_id, [toCover(r)]);
  for (const r of rows) {
    const list = result.get(r.collection_id) ?? [];
    if (list.length < 4 && !list.some((c) => c.id === r.id)) list.push(toCover(r));
    result.set(r.collection_id, list);
  }
  return result;
}

export async function listCollections(): Promise<CollectionSummary[]> {
  const rows = await rawAll<{
    id: string;
    name: string;
    description: string | null;
    kind: "collection" | "moodboard";
    brief: string | null;
    created_at: string;
    updated_at: string;
    n: number;
  }>(
    `select c.*, (select count(*) from collection_references cr where cr.collection_id = c.id) as n
       from collections c order by c.updated_at desc`,
  );
  const covers = await coversFor(rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    kind: r.kind,
    brief: r.brief,
    referenceCount: Number(r.n),
    covers: covers.get(r.id) ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function getCollection(id: string): Promise<CollectionDetail | null> {
  const db = await getDb();
  const [row] = await db.select().from(collections).where(eq(collections.id, id));
  if (!row) return null;
  const links = await db
    .select()
    .from(collectionReferences)
    .where(eq(collectionReferences.collectionId, id))
    .orderBy(asc(collectionReferences.position), asc(collectionReferences.addedAt));
  const summaries = await getSummaries(links.map((l) => l.referenceId));
  const byId = new Map(summaries.map((s) => [s.id, s]));
  const covers = await coversFor([id]);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    kind: row.kind,
    brief: row.brief,
    coverImageId: row.coverImageId,
    referenceCount: links.length,
    covers: covers.get(id) ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: links
      .filter((l) => byId.has(l.referenceId))
      .map((l) => ({ reference: byId.get(l.referenceId)!, position: l.position, note: l.note, addedAt: l.addedAt })),
  };
}

export async function createCollection(input: CollectionInput) {
  const data = collectionInputSchema.parse(input);
  const db = await getDb();
  const id = newId("col");
  await db.insert(collections).values({
    id,
    name: data.name,
    description: data.description,
    kind: data.kind,
    brief: data.brief,
    coverImageId: data.coverImageId ?? null,
  });
  return id;
}

export async function updateCollection(id: string, input: CollectionInput) {
  const data = collectionInputSchema.parse(input);
  const db = await getDb();
  const result = await db
    .update(collections)
    .set({
      name: data.name,
      description: data.description,
      kind: data.kind,
      brief: data.brief,
      coverImageId: data.coverImageId ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(collections.id, id))
    .returning({ id: collections.id });
  if (!result.length) throw new NotFoundError("Collection");
}

export async function deleteCollection(id: string) {
  const db = await getDb();
  const result = await db.delete(collections).where(eq(collections.id, id)).returning({ id: collections.id });
  if (!result.length) throw new NotFoundError("Collection");
}

export async function addToCollection(collectionId: string, referenceIds: string[], note?: string | null) {
  const db = await getDb();
  const [col] = await db.select({ id: collections.id }).from(collections).where(eq(collections.id, collectionId));
  if (!col) throw new NotFoundError("Collection");
  const valid = referenceIds.length
    ? await db.select({ id: references.id }).from(references).where(inArray(references.id, referenceIds))
    : [];
  const [{ max }] = await rawAll<{ max: number | null }>(
    `select max(position) as max from collection_references where collection_id = ?`,
    [collectionId],
  );
  let position = (max ?? -1) + 1;
  const validIds = new Set(valid.map((v) => v.id));
  const ordered = [...new Set(referenceIds)].filter((id) => validIds.has(id));
  for (const id of ordered) {
    await db
      .insert(collectionReferences)
      .values({ collectionId, referenceId: id, position: position++, note: note ?? null })
      .onConflictDoNothing();
  }
  await db.update(collections).set({ updatedAt: new Date().toISOString() }).where(eq(collections.id, collectionId));
  return valid.length;
}

export async function removeFromCollection(collectionId: string, referenceId: string) {
  const db = await getDb();
  await db
    .delete(collectionReferences)
    .where(and(eq(collectionReferences.collectionId, collectionId), eq(collectionReferences.referenceId, referenceId)));
  await db.update(collections).set({ updatedAt: new Date().toISOString() }).where(eq(collections.id, collectionId));
}

export async function setCollectionNote(collectionId: string, referenceId: string, note: string | null) {
  const db = await getDb();
  const result = await db
    .update(collectionReferences)
    .set({ note: note?.trim() ? note.trim().slice(0, 4000) : null })
    .where(and(eq(collectionReferences.collectionId, collectionId), eq(collectionReferences.referenceId, referenceId)))
    .returning({ id: collectionReferences.referenceId });
  if (!result.length) throw new NotFoundError("Collection item");
}

export async function reorderCollection(collectionId: string, referenceIds: string[]) {
  const db = await getDb();
  await transaction(async () => {
    for (const [position, referenceId] of referenceIds.entries()) {
      await db
        .update(collectionReferences)
        .set({ position })
        .where(and(eq(collectionReferences.collectionId, collectionId), eq(collectionReferences.referenceId, referenceId)));
    }
    await db.update(collections).set({ updatedAt: new Date().toISOString() }).where(eq(collections.id, collectionId));
  });
}

/** Lightweight list for pickers. */
export async function listCollectionOptions() {
  const db = await getDb();
  return db
    .select({ id: collections.id, name: collections.name, kind: collections.kind })
    .from(collections)
    .orderBy(desc(collections.updatedAt));
}

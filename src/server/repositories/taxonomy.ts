import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, rawAll, transaction } from "../db/client";
import { references, referenceTerms, terms, type TermKind } from "../db/schema";
import { newId, slugify } from "../ids";

export interface TermDTO {
  id: string;
  kind: TermKind;
  name: string;
  slug: string;
  isBuiltIn: boolean;
  count: number;
}

export class DuplicateTermError extends Error {
  constructor(name: string) {
    super(`"${name}" already exists.`);
    this.name = "DuplicateTermError";
  }
}

/** All terms (optionally of one kind) with the number of references using each. */
export async function listTerms(kind?: TermKind): Promise<TermDTO[]> {
  const db = await getDb();
  const usage = db
    .select({
      termId: referenceTerms.termId,
      n: sql<number>`count(*)`.as("n"),
    })
    .from(referenceTerms)
    .groupBy(referenceTerms.termId)
    .as("usage");

  const rows = await db
    .select({
      id: terms.id,
      kind: terms.kind,
      name: terms.name,
      slug: terms.slug,
      isBuiltIn: terms.isBuiltIn,
      linked: sql<number>`coalesce(${usage.n}, 0)`,
      primary: sql<number>`(select count(*) from ${references} r where r.industry_id = ${terms.id} or r.page_type_id = ${terms.id})`,
    })
    .from(terms)
    .leftJoin(usage, eq(usage.termId, terms.id))
    .where(kind ? eq(terms.kind, kind) : undefined)
    .orderBy(asc(terms.kind), sql`${terms.name} collate nocase`);

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    slug: r.slug,
    isBuiltIn: r.isBuiltIn,
    count: Number(r.linked) + Number(r.primary),
  }));
}

/** Terms in use, each with up to three recent cover thumbnails, for the Explore page. */
export async function exploreTaxonomy() {
  const rows = await rawAll<{ term_id: string; kind: TermKind; name: string; slug: string; reference_id: string; cover_id: string | null }>(
    `with links as (
       select reference_id, term_id from reference_terms
       union select id, industry_id from "references" where industry_id is not null
       union select id, page_type_id from "references" where page_type_id is not null)
     select t.id as term_id, t.kind, t.name, t.slug, r.id as reference_id,
            (select i.id from reference_images i where i.reference_id = r.id order by i.position, i.created_at limit 1) as cover_id
       from links l
       join terms t on t.id = l.term_id
       join "references" r on r.id = l.reference_id and r.status != 'archived'
      order by r.created_at desc`,
  );
  const byTerm = new Map<string, { kind: TermKind; name: string; slug: string; count: number; covers: string[] }>();
  for (const row of rows) {
    const entry = byTerm.get(row.term_id) ?? { kind: row.kind, name: row.name, slug: row.slug, count: 0, covers: [] };
    entry.count++;
    if (row.cover_id && entry.covers.length < 3) entry.covers.push(row.cover_id);
    byTerm.set(row.term_id, entry);
  }
  return [...byTerm.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export async function getTermsBySlug(kind: TermKind, slugs: string[]) {
  if (slugs.length === 0) return [];
  const db = await getDb();
  return db.select().from(terms).where(and(eq(terms.kind, kind), inArray(terms.slug, slugs)));
}

/** Find terms by display name (case-insensitive) and create any that are missing. */
export async function resolveTermIds(kind: TermKind, names: string[]): Promise<string[]> {
  const unique = new Map<string, string>();
  for (const name of names) {
    const clean = name.trim().replace(/\s+/g, " ");
    const slug = slugify(clean);
    if (slug && !unique.has(slug)) unique.set(slug, clean);
  }
  if (unique.size === 0) return [];
  const db = await getDb();
  const existing = await db
    .select({ id: terms.id, slug: terms.slug })
    .from(terms)
    .where(and(eq(terms.kind, kind), inArray(terms.slug, [...unique.keys()])));
  const bySlug = new Map(existing.map((t) => [t.slug, t.id]));
  const missing = [...unique.entries()].filter(([slug]) => !bySlug.has(slug));
  if (missing.length) {
    const rows = missing.map(([slug, name]) => ({ id: newId("trm"), kind, name, slug }));
    await db.insert(terms).values(rows).onConflictDoNothing();
    const created = await db
      .select({ id: terms.id, slug: terms.slug })
      .from(terms)
      .where(and(eq(terms.kind, kind), inArray(terms.slug, missing.map(([s]) => s))));
    for (const t of created) bySlug.set(t.slug, t.id);
  }
  return [...unique.keys()].map((slug) => bySlug.get(slug)!).filter(Boolean);
}

export async function createTerm(kind: TermKind, name: string): Promise<TermDTO> {
  const clean = name.trim().replace(/\s+/g, " ");
  const slug = slugify(clean);
  if (!slug) throw new Error("Enter a name.");
  const db = await getDb();
  const dup = await db.select({ id: terms.id }).from(terms).where(and(eq(terms.kind, kind), eq(terms.slug, slug)));
  if (dup.length) throw new DuplicateTermError(clean);
  const id = newId("trm");
  await db.insert(terms).values({ id, kind, name: clean, slug });
  return { id, kind, name: clean, slug, isBuiltIn: false, count: 0 };
}

export async function renameTerm(id: string, name: string) {
  const clean = name.trim().replace(/\s+/g, " ");
  const slug = slugify(clean);
  if (!slug) throw new Error("Enter a name.");
  const db = await getDb();
  const [term] = await db.select().from(terms).where(eq(terms.id, id));
  if (!term) return null;
  const dup = await db
    .select({ id: terms.id })
    .from(terms)
    .where(and(eq(terms.kind, term.kind), eq(terms.slug, slug), sql`${terms.id} != ${id}`));
  if (dup.length) throw new DuplicateTermError(clean);
  await db.update(terms).set({ name: clean, slug }).where(eq(terms.id, id));
  await refreshSearchTextForTerm(id);
  return { ...term, name: clean, slug };
}

export async function deleteTerm(id: string) {
  const db = await getDb();
  const affected = await referencesUsingTerm(id);
  // Explicit (hosted libSQL doesn't enforce ON DELETE rules).
  await transaction(async () => {
    await db.delete(referenceTerms).where(eq(referenceTerms.termId, id));
    await db.update(references).set({ industryId: null }).where(eq(references.industryId, id));
    await db.update(references).set({ pageTypeId: null }).where(eq(references.pageTypeId, id));
    await db.delete(terms).where(eq(terms.id, id));
  });
  const { rebuildSearchText } = await import("./references");
  for (const refId of affected) await rebuildSearchText(refId);
}

async function referencesUsingTerm(termId: string) {
  const rows = await rawAll<{ id: string }>(
    `select reference_id as id from reference_terms where term_id = ?
     union select id from "references" where industry_id = ? or page_type_id = ?`,
    [termId, termId, termId],
  );
  return rows.map((r) => r.id);
}

async function refreshSearchTextForTerm(termId: string) {
  const { rebuildSearchText } = await import("./references");
  for (const refId of await referencesUsingTerm(termId)) await rebuildSearchText(refId);
}

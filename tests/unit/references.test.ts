import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { referenceInputSchema } from "@/lib/domain";
import { closeDb, rawAll } from "@/server/db/client";
import { processImage, processVideo } from "@/server/images";
import { addToCollection, createCollection, deleteCollection, getCollection, removeFromCollection } from "@/server/repositories/collections";
import {
  addImages,
  createReference,
  deleteImage,
  deleteReference,
  findDuplicateImages,
  findRelated,
  getReference,
  listReferences,
  reorderImages,
  setFavorite,
  updateReference,
} from "@/server/repositories/references";
import { createTerm, deleteTerm, DuplicateTermError, listTerms } from "@/server/repositories/taxonomy";
import { addReference, makePng, createTempVault } from "./helpers";

const vault = createTempVault();
afterAll(() => vault.cleanup());

function storedFiles() {
  const root = path.join(vault.dir, "storage");
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true, withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name);
}

describe("reference management", () => {
  let id: string;

  beforeAll(async () => {
    id = await addReference({
      title: "Editorial skincare homepage",
      siteName: "Studio North",
      sourceUrl: "https://www.studionorth.example/home",
      industry: "Beauty and Skincare",
      pageType: "Homepage",
      visualStyles: ["Editorial", "Typography-led"],
      layouts: ["Asymmetric Grid"],
      components: ["Hero", "Footer"],
      interactions: [{ name: "Scroll Reveal", verified: true }],
      tags: ["warm neutrals"],
      analysis: { observations: "Two-line serif headline", usageIdeas: "Asymmetric hero balance" },
    });
  });

  it("creates a reference with classification, images and analysis", async () => {
    const ref = await getReference(id);
    expect(ref).not.toBeNull();
    expect(ref!.industry?.name).toBe("Beauty and Skincare");
    expect(ref!.pageType?.name).toBe("Homepage");
    expect(ref!.sourceDomain).toBe("studionorth.example");
    expect(ref!.visualStyles.map((s) => s.name)).toEqual(["Editorial", "Typography-led"]);
    expect(ref!.interactions).toEqual([{ name: "Scroll Reveal", slug: "scroll-reveal", verified: true }]);
    expect(ref!.images).toHaveLength(1);
    expect(ref!.images[0].thumbWidth).toBeLessThanOrEqual(720);
    expect(ref!.analysis?.observations).toBe("Two-line serif headline");
    // Original, preview and thumbnail are stored separately.
    expect(storedFiles()).toHaveLength(3);
  });

  it("persists metadata across a database reopen", async () => {
    closeDb();
    const ref = await getReference(id);
    expect(ref?.title).toBe("Editorial skincare homepage");
    expect(ref?.tags.map((t) => t.name)).toEqual(["warm neutrals"]);
  });

  it("edits a reference", async () => {
    await updateReference(
      id,
      referenceInputSchema.parse({
        title: "Editorial skincare homepage (edited)",
        industry: "Beauty and Skincare",
        pageType: "Landing Page",
        visualStyles: ["Minimalist"],
        status: "curated",
        capturedTheme: "dark",
        supportsDarkMode: "no",
      }),
    );
    const ref = await getReference(id);
    expect(ref!.title).toContain("(edited)");
    expect(ref!.pageType?.name).toBe("Landing Page");
    expect(ref!.visualStyles.map((s) => s.name)).toEqual(["Minimalist"]);
    // Captured theme and dark-mode support are independent properties.
    expect(ref!.capturedTheme).toBe("dark");
    expect(ref!.supportsDarkMode).toBe("no");
  });

  it("attaches multiple screenshots and deletes one without orphaned files", async () => {
    const mobile = await processImage(await makePng(390, 2400, "#aa3300"), 25 * 1024 * 1024);
    const [imageId] = await addImages(id, [{ processed: mobile, meta: { label: "Mobile", viewport: "mobile", theme: "dark", screenshotType: "full_page" } }]);
    let ref = await getReference(id);
    expect(ref!.images.map((i) => i.viewport)).toEqual(["desktop", "mobile"]);
    expect(storedFiles()).toHaveLength(6);
    await deleteImage(imageId);
    ref = await getReference(id);
    expect(ref!.images).toHaveLength(1);
    expect(storedFiles()).toHaveLength(3);
  });

  it("refuses to delete the last screenshot", async () => {
    const ref = await getReference(id);
    await expect(deleteImage(ref!.images[0].id)).rejects.toThrow(/at least one screenshot/);
  });

  it("toggles favorites", async () => {
    await setFavorite(id, true);
    expect((await listReferences({ favorite: true })).items.map((r) => r.id)).toContain(id);
    await setFavorite(id, false);
    expect((await listReferences({ favorite: true })).items.map((r) => r.id)).not.toContain(id);
  });

  it("detects exact duplicate screenshots", async () => {
    const png = await makePng(1200, 1600, "#336699");
    const processed = await processImage(png, 25 * 1024 * 1024);
    const dups = await findDuplicateImages(processed.sha256, processed.dhash);
    expect(dups[0]?.referenceId).toBe(id);
  });
});

describe("search and organization", () => {
  let a: string;
  let b: string;
  let c: string;

  beforeAll(async () => {
    a = await addReference({ title: "Pet shampoo product page", industry: "Pet Care", pageType: "Product Detail Page", components: ["Sticky CTA", "Product Gallery"], visualStyles: ["Minimalist"] }, "#227744");
    b = await addReference({ title: "Dark SaaS analytics dashboard", industry: "SaaS", pageType: "Dashboard", layouts: ["Bento Grid"], capturedTheme: "dark", visualStyles: ["Futuristic"] }, "#111111");
    c = await addReference({ title: "Luxury fashion product page", industry: "Fashion", pageType: "Product Detail Page", components: ["Product Gallery"], visualStyles: ["Luxury", "Minimalist"] }, "#ccbbaa");
  });

  it("searches by keyword across metadata", async () => {
    expect((await listReferences({ q: "shampoo" })).items.map((r) => r.id)).toEqual([a]);
    expect((await listReferences({ q: "bento" })).items.map((r) => r.id)).toEqual([b]);
    expect((await listReferences({ q: "product gallery" })).total).toBe(2);
  });

  it("combines filters (OR within a classification, AND across)", async () => {
    const pdp = await listReferences({ pageType: ["product-detail-page"] });
    expect(pdp.total).toBe(2);
    const pdpMinimalPet = await listReferences({ pageType: ["product-detail-page"], visualStyle: ["minimalist"], industry: ["pet-care"] });
    expect(pdpMinimalPet.items.map((r) => r.id)).toEqual([a]);
    const either = await listReferences({ industry: ["pet-care", "fashion"] });
    expect(either.total).toBe(2);
    const dark = await listReferences({ theme: ["dark"], pageType: ["dashboard"] });
    expect(dark.items.map((r) => r.id)).toEqual([b]);
  });

  it("finds related references by shared metadata only", async () => {
    const related = await findRelated(a);
    expect(related.map((r) => r.reference.id)).toContain(c);
    expect(related.map((r) => r.reference.id)).not.toContain(b);
  });

  it("creates collections and adds/removes references without duplicating images", async () => {
    const before = storedFiles().length;
    const col = await createCollection({ name: "Product pages", kind: "moodboard", brief: "Premium pet shampoo site" });
    await addToCollection(col, [a, c], "Strong gallery proportions");
    let detail = await getCollection(col);
    expect(detail!.items.map((i) => i.reference.id)).toEqual([a, c]);
    expect(detail!.items[0].note).toBe("Strong gallery proportions");
    expect(storedFiles().length).toBe(before);
    expect((await listReferences({ collection: col })).total).toBe(2);
    await removeFromCollection(col, a);
    detail = await getCollection(col);
    expect(detail!.items.map((i) => i.reference.id)).toEqual([c]);
  });

  it("deletes a reference and its files", async () => {
    const before = storedFiles().length;
    await deleteReference(b);
    expect(await getReference(b)).toBeNull();
    expect(storedFiles().length).toBe(before - 3);
  });
});

describe("video references", () => {
  it("stores MP4s alongside screenshots, uses the chosen cover and cleans up files", async () => {
    const mp4 = fs.readFileSync(path.join(__dirname, "../fixtures/sample.mp4"));
    const video = await processVideo(mp4, await makePng(640, 480, "#222222"), { width: 640, height: 480, durationMs: 2000 }, 200 * 1024 * 1024);
    const image = await processImage(await makePng(1200, 1600, "#eeeeee"), 25 * 1024 * 1024);
    const before = storedFiles().length;
    // Video first = chosen cover.
    const id = await createReference(referenceInputSchema.parse({ title: "Animated hero", industry: "Technology" }), [
      { processed: video, meta: { label: "Hover", viewport: "desktop", theme: "dark", screenshotType: "viewport" } },
      { processed: image, meta: { label: null, viewport: "desktop", theme: "light", screenshotType: "full_page" } },
    ]);
    const ref = await getReference(id);
    expect(ref!.cover?.mediaType).toBe("video");
    expect(ref!.cover?.durationMs).toBe(2000);
    expect(ref!.videoCount).toBe(1);
    expect(ref!.images.map((i) => i.mediaType)).toEqual(["video", "image"]);
    expect(ref!.images[0].mimeType).toBe("video/mp4");
    expect(storedFiles().filter((f) => f.endsWith(".mp4"))).toHaveLength(1);

    expect((await listReferences({ media: ["video"] })).items.map((r) => r.id)).toEqual([id]);
    expect((await listReferences({ q: "video" })).items.map((r) => r.id)).toContain(id);

    // Choosing the screenshot as cover = moving it first.
    await reorderImages(id, [ref!.images[1].id, ref!.images[0].id]);
    expect((await getReference(id))!.cover?.mediaType).toBe("image");

    await deleteReference(id);
    expect(storedFiles().length).toBe(before);
  });
});

describe("deletes leave no orphaned rows (hosted libSQL doesn't enforce foreign keys)", () => {
  it("removes related rows for references, collections and terms", async () => {
    const termId = await createTerm("tag", "Orphan check tag").then((t) => t.id);
    const refId = await addReference({ title: "Orphan check", tags: ["Orphan check tag"], analysis: { observations: "Observed" } });
    const colId = await createCollection({ name: "Orphan check collection", kind: "collection" });
    await addToCollection(colId, [refId], "note");
    const count = async (sql: string, ...params: string[]) => Number((await rawAll<{ n: number }>(sql, params))[0].n);

    await deleteTerm(termId);
    expect(await count(`select count(*) as n from reference_terms where term_id = ?`, termId)).toBe(0);

    await deleteReference(refId);
    for (const table of ["reference_terms", "reference_images", "design_analyses", "collection_references"]) {
      expect(await count(`select count(*) as n from ${table} where reference_id = ?`, refId)).toBe(0);
    }

    await deleteCollection(colId);
    expect(await count(`select count(*) as n from collection_references where collection_id = ?`, colId)).toBe(0);
  });
});

describe("taxonomy", () => {
  it("prevents case-insensitive duplicate terms", async () => {
    await createTerm("tag", "Glassmorphism");
    await expect(createTerm("tag", "glassmorphism")).rejects.toBeInstanceOf(DuplicateTermError);
    await expect(createTerm("industry", "pet care")).rejects.toBeInstanceOf(DuplicateTermError);
  });

  it("reuses existing terms when creating references with different casing", async () => {
    await addReference({ title: "Case test", industry: "pet CARE", tags: ["GLASSMORPHISM"] });
    const tags = (await listTerms("tag")).filter((t) => t.slug === "glassmorphism");
    expect(tags).toHaveLength(1);
    expect(tags[0].count).toBe(1);
  });
});

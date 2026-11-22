/**
 * Design Vault database schema (SQLite via Drizzle ORM).
 *
 * All classification systems (industry, page type, components, visual style,
 * layout, interaction, free tags) live in a single `terms` table keyed by
 * `kind`. This keeps taxonomy management uniform while preserving independent
 * classification systems. Uniqueness is enforced on (kind, slug) where slug is
 * a lower-cased normalized name, which prevents case-insensitive duplicates.
 *
 * To move to PostgreSQL later, port this file to `drizzle-orm/pg-core`; the
 * repositories in `src/server/repositories` are the only consumers.
 */
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const TERM_KINDS = [
  "industry",
  "page_type",
  "component",
  "visual_style",
  "layout",
  "interaction",
  "tag",
] as const;
export type TermKind = (typeof TERM_KINDS)[number];

export const SCREENSHOT_TYPES = ["full_page", "viewport", "section", "component"] as const;
export const CAPTURED_THEMES = ["light", "dark", "mixed", "unknown"] as const;
export const DARK_MODE_SUPPORT = ["yes", "no", "unknown"] as const;
export const VIEWPORTS = ["desktop", "tablet", "mobile", "custom"] as const;
export const REFERENCE_STATUSES = ["to_review", "curated", "archived"] as const;
export const COLLECTION_KINDS = ["collection", "moodboard"] as const;

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

export const terms = sqliteTable(
  "terms",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: TERM_KINDS }).notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    isBuiltIn: integer("is_built_in", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("terms_kind_slug_unique").on(t.kind, t.slug),
    index("terms_kind_idx").on(t.kind),
  ],
);

export const references = sqliteTable(
  "references",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    siteName: text("site_name"),
    sourceUrl: text("source_url"),
    sourceDomain: text("source_domain"),
    description: text("description"),
    industryId: text("industry_id").references(() => terms.id, { onDelete: "set null" }),
    pageTypeId: text("page_type_id").references(() => terms.id, { onDelete: "set null" }),
    screenshotType: text("screenshot_type", { enum: SCREENSHOT_TYPES }).notNull().default("full_page"),
    capturedTheme: text("captured_theme", { enum: CAPTURED_THEMES }).notNull().default("unknown"),
    supportsDarkMode: text("supports_dark_mode", { enum: DARK_MODE_SUPPORT }).notNull().default("unknown"),
    capturedViewport: text("captured_viewport", { enum: VIEWPORTS }).notNull().default("desktop"),
    status: text("status", { enum: REFERENCE_STATUSES }).notNull().default("to_review"),
    isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
    /** Clearly separates bundled sample content from real user records. */
    isSample: integer("is_sample", { mode: "boolean" }).notNull().default(false),
    attribution: text("attribution"),
    licenseNotes: text("license_notes"),
    capturedAt: text("captured_at"),
    /** Denormalized lower-case text used for metadata search. */
    searchText: text("search_text").notNull().default(""),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [
    index("references_created_idx").on(t.createdAt),
    index("references_updated_idx").on(t.updatedAt),
    index("references_title_idx").on(t.title),
    index("references_industry_idx").on(t.industryId),
    index("references_page_type_idx").on(t.pageTypeId),
    index("references_favorite_idx").on(t.isFavorite),
    index("references_domain_idx").on(t.sourceDomain),
  ],
);

/** Many-to-many relationships between references and classification terms. */
export const referenceTerms = sqliteTable(
  "reference_terms",
  {
    referenceId: text("reference_id")
      .notNull()
      .references(() => references.id, { onDelete: "cascade" }),
    termId: text("term_id")
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    /** For interaction terms: true only when observed live or documented. */
    verified: integer("verified", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.referenceId, t.termId] }),
    index("reference_terms_term_idx").on(t.termId),
  ],
);

export const referenceImages = sqliteTable(
  "reference_images",
  {
    id: text("id").primaryKey(),
    referenceId: text("reference_id")
      .notNull()
      .references(() => references.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    label: text("label"),
    originalKey: text("original_key").notNull(),
    previewKey: text("preview_key").notNull(),
    thumbKey: text("thumb_key").notNull(),
    mimeType: text("mime_type").notNull(),
    /** "video" items keep the MP4 as original; preview/thumb are generated from a poster frame. */
    mediaType: text("media_type", { enum: ["image", "video"] }).notNull().default("image"),
    durationMs: integer("duration_ms"),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    previewWidth: integer("preview_width").notNull(),
    previewHeight: integer("preview_height").notNull(),
    thumbWidth: integer("thumb_width").notNull(),
    thumbHeight: integer("thumb_height").notNull(),
    bytes: integer("bytes").notNull(),
    sha256: text("sha256").notNull(),
    dhash: text("dhash").notNull(),
    viewport: text("viewport", { enum: VIEWPORTS }).notNull().default("desktop"),
    viewportWidth: integer("viewport_width"),
    viewportHeight: integer("viewport_height"),
    theme: text("theme", { enum: CAPTURED_THEMES }).notNull().default("unknown"),
    screenshotType: text("screenshot_type", { enum: SCREENSHOT_TYPES }).notNull().default("full_page"),
    source: text("source", { enum: ["upload", "capture"] }).notNull().default("upload"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [
    index("reference_images_ref_idx").on(t.referenceId, t.position),
    index("reference_images_sha_idx").on(t.sha256),
  ],
);

/**
 * Structured analysis. Provenance is explicit:
 *  - observed*: facts visible in the screenshot or verified from the source
 *  - curator notes: the owner's assessment and interpretation
 *  - aiSuggestions: machine-generated observations that require review
 */
export const designAnalyses = sqliteTable("design_analyses", {
  referenceId: text("reference_id")
    .primaryKey()
    .references(() => references.id, { onDelete: "cascade" }),
  observations: text("observations"),
  interesting: text("interesting"),
  typographyNotes: text("typography_notes"),
  colorNotes: text("color_notes"),
  layoutNotes: text("layout_notes"),
  interactionNotes: text("interaction_notes"),
  uxStrengths: text("ux_strengths"),
  limitations: text("limitations"),
  usageIdeas: text("usage_ideas"),
  aiSuggestions: text("ai_suggestions"),
  aiSuggestionsReviewed: integer("ai_suggestions_reviewed", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull().default(now),
});

export const collections = sqliteTable(
  "collections",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    kind: text("kind", { enum: COLLECTION_KINDS }).notNull().default("collection"),
    /** For project moodboards: the website brief this board supports. */
    brief: text("brief"),
    coverImageId: text("cover_image_id").references(() => referenceImages.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [index("collections_updated_idx").on(t.updatedAt)],
);

export const collectionReferences = sqliteTable(
  "collection_references",
  {
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    referenceId: text("reference_id")
      .notNull()
      .references(() => references.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    /** Why this reference was selected (moodboard commentary). */
    note: text("note"),
    addedAt: text("added_at").notNull().default(now),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.referenceId] }),
    index("collection_references_ref_idx").on(t.referenceId),
  ],
);

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(now),
});

/** Explicit table map passed to Drizzle (avoids namespace-import interop differences across runtimes). */
export const tables = {
  terms,
  references,
  referenceTerms,
  referenceImages,
  designAnalyses,
  collections,
  collectionReferences,
  appSettings,
};

export type TermRow = typeof terms.$inferSelect;
export type ReferenceRow = typeof references.$inferSelect;
export type ReferenceImageRow = typeof referenceImages.$inferSelect;
export type DesignAnalysisRow = typeof designAnalyses.$inferSelect;
export type CollectionRow = typeof collections.$inferSelect;

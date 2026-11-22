/**
 * Shared domain vocabulary and validation schemas used by the UI, the server
 * mutations, the REST API and the MCP server.
 */
import { z } from "zod";

export const TERM_KINDS = ["industry", "page_type", "component", "visual_style", "layout", "interaction", "tag"] as const;
export type TermKind = (typeof TERM_KINDS)[number];

export const TERM_KIND_LABELS: Record<TermKind, { singular: string; plural: string }> = {
  industry: { singular: "Industry", plural: "Industries" },
  page_type: { singular: "Page type", plural: "Page types" },
  component: { singular: "UI component", plural: "UI components" },
  visual_style: { singular: "Visual style", plural: "Visual styles" },
  layout: { singular: "Layout", plural: "Layout characteristics" },
  interaction: { singular: "Interaction", plural: "Interaction & motion" },
  tag: { singular: "Tag", plural: "Tags" },
};

export const SCREENSHOT_TYPES = ["full_page", "viewport", "section", "component"] as const;
export const CAPTURED_THEMES = ["light", "dark", "mixed", "unknown"] as const;
export const DARK_MODE_SUPPORT = ["yes", "no", "unknown"] as const;
export const VIEWPORTS = ["desktop", "tablet", "mobile", "custom"] as const;
export const REFERENCE_STATUSES = ["to_review", "curated", "archived"] as const;
export const SORTS = ["newest", "oldest", "title", "updated"] as const;
export const MEDIA_TYPES = ["image", "video"] as const;

export type ScreenshotType = (typeof SCREENSHOT_TYPES)[number];
export type CapturedTheme = (typeof CAPTURED_THEMES)[number];
export type DarkModeSupport = (typeof DARK_MODE_SUPPORT)[number];
export type Viewport = (typeof VIEWPORTS)[number];
export type ReferenceStatus = (typeof REFERENCE_STATUSES)[number];
export type Sort = (typeof SORTS)[number];

export const LABELS = {
  screenshotType: { full_page: "Full page", viewport: "Viewport", section: "Section", component: "UI component" },
  capturedTheme: { light: "Light", dark: "Dark", mixed: "Mixed", unknown: "Unknown" },
  darkMode: { yes: "Yes", no: "No", unknown: "Unknown" },
  viewport: { desktop: "Desktop", tablet: "Tablet", mobile: "Mobile", custom: "Custom" },
  status: { to_review: "To review", curated: "Curated", archived: "Archived" },
  sort: { newest: "Newest", oldest: "Oldest", title: "Title", updated: "Recently updated" },
  media: { image: "Includes images", video: "Includes video" },
} as const;

export const DEFAULT_VIEWPORT_SIZES: Record<Exclude<Viewport, "custom">, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 834, height: 1194 },
  mobile: { width: 390, height: 844 },
};

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => v.trim())
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => {
    if (!v) return true;
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, "Enter a full URL starting with http:// or https://");

const termNames = z.array(z.string().trim().min(1).max(60)).max(40).default([]);

export const analysisSchema = z.object({
  observations: optionalText(8000),
  interesting: optionalText(8000),
  typographyNotes: optionalText(8000),
  colorNotes: optionalText(8000),
  layoutNotes: optionalText(8000),
  interactionNotes: optionalText(8000),
  uxStrengths: optionalText(8000),
  limitations: optionalText(8000),
  usageIdeas: optionalText(8000),
  aiSuggestions: optionalText(8000),
  aiSuggestionsReviewed: z.boolean().default(false),
});

/** Payload for creating or updating a reference (taxonomy by display name). */
export const referenceInputSchema = z.object({
  title: z.string().trim().min(1, "A title is required").max(200),
  siteName: optionalText(200),
  sourceUrl: optionalUrl,
  description: optionalText(8000),
  industry: z.string().trim().min(1, "Choose an industry").max(60),
  additionalIndustries: termNames,
  pageType: optionalText(60),
  visualStyles: termNames,
  layouts: termNames,
  components: termNames,
  interactions: z
    .array(z.object({ name: z.string().trim().min(1).max(60), verified: z.boolean().default(false) }))
    .max(40)
    .default([]),
  tags: termNames,
  screenshotType: z.enum(SCREENSHOT_TYPES).default("full_page"),
  capturedTheme: z.enum(CAPTURED_THEMES).default("unknown"),
  supportsDarkMode: z.enum(DARK_MODE_SUPPORT).default("unknown"),
  capturedViewport: z.enum(VIEWPORTS).default("desktop"),
  status: z.enum(REFERENCE_STATUSES).default("to_review"),
  isFavorite: z.boolean().default(false),
  attribution: optionalText(500),
  licenseNotes: optionalText(2000),
  capturedAt: optionalText(40),
  collectionIds: z.array(z.string().max(40)).max(50).default([]),
  newCollections: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
  analysis: analysisSchema.partial().default({}),
});
export type ReferenceInput = z.input<typeof referenceInputSchema>;
export type ReferenceInputParsed = z.output<typeof referenceInputSchema>;

export const imageMetaSchema = z.object({
  label: optionalText(120),
  viewport: z.enum(VIEWPORTS).default("desktop"),
  viewportWidth: z.coerce.number().int().min(100).max(10000).optional().nullable(),
  viewportHeight: z.coerce.number().int().min(100).max(100000).optional().nullable(),
  theme: z.enum(CAPTURED_THEMES).default("unknown"),
  screenshotType: z.enum(SCREENSHOT_TYPES).default("full_page"),
});
export type ImageMeta = z.output<typeof imageMetaSchema>;

/** Filters shared by the gallery URL, REST API and MCP server. */
export const filtersSchema = z.object({
  q: z.string().trim().max(300).optional(),
  industry: z.array(z.string()).default([]),
  pageType: z.array(z.string()).default([]),
  component: z.array(z.string()).default([]),
  visualStyle: z.array(z.string()).default([]),
  layout: z.array(z.string()).default([]),
  interaction: z.array(z.string()).default([]),
  tag: z.array(z.string()).default([]),
  viewport: z.array(z.enum(VIEWPORTS)).default([]),
  theme: z.array(z.enum(CAPTURED_THEMES)).default([]),
  darkMode: z.array(z.enum(DARK_MODE_SUPPORT)).default([]),
  media: z.array(z.enum(MEDIA_TYPES)).default([]),
  status: z.array(z.enum(REFERENCE_STATUSES)).default([]),
  favorite: z.boolean().optional(),
  collection: z.string().max(40).optional(),
  addedAfter: z.string().max(40).optional(),
  addedBefore: z.string().max(40).optional(),
  sort: z.enum(SORTS).default("newest"),
});
export type Filters = z.output<typeof filtersSchema>;

/** Filter keys whose values are term slugs. */
export const TERM_FILTER_KEYS = {
  industry: "industry",
  pageType: "page_type",
  component: "component",
  visualStyle: "visual_style",
  layout: "layout",
  interaction: "interaction",
  tag: "tag",
} as const satisfies Record<string, TermKind>;

export const ARRAY_FILTER_KEYS = [
  "industry",
  "pageType",
  "component",
  "visualStyle",
  "layout",
  "interaction",
  "tag",
  "viewport",
  "theme",
  "darkMode",
  "media",
  "status",
] as const;

/** Parse filters from URLSearchParams (repeated keys or comma-separated values). */
export function parseFilters(params: URLSearchParams | Record<string, string | string[] | undefined>): Filters {
  const get = (key: string): string[] => {
    let values: string[] = [];
    if (params instanceof URLSearchParams) values = params.getAll(key);
    else {
      const v = params[key];
      values = v === undefined ? [] : Array.isArray(v) ? v : [v];
    }
    return values.flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
  };
  const one = (key: string) => get(key)[0];
  const raw: Record<string, unknown> = {
    q: one("q"),
    sort: one("sort"),
    collection: one("collection"),
    addedAfter: one("addedAfter"),
    addedBefore: one("addedBefore"),
  };
  const fav = one("favorite");
  if (fav === "true" || fav === "1") raw.favorite = true;
  if (fav === "false" || fav === "0") raw.favorite = false;
  for (const key of ARRAY_FILTER_KEYS) raw[key] = get(key);
  const result = filtersSchema.safeParse(raw);
  if (result.success) return result.data;
  // Drop invalid values instead of failing the whole request.
  const cleaned: Record<string, unknown> = { ...raw };
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string") delete cleaned[key];
  }
  return filtersSchema.parse(cleaned);
}

export function filtersToSearchParams(filters: Partial<Filters>): URLSearchParams {
  const sp = new URLSearchParams();
  if (filters.q) sp.set("q", filters.q);
  for (const key of ARRAY_FILTER_KEYS) {
    const values = filters[key] as string[] | undefined;
    if (values?.length) sp.set(key, values.join(","));
  }
  if (filters.favorite !== undefined) sp.set("favorite", String(filters.favorite));
  if (filters.collection) sp.set("collection", filters.collection);
  if (filters.addedAfter) sp.set("addedAfter", filters.addedAfter);
  if (filters.addedBefore) sp.set("addedBefore", filters.addedBefore);
  if (filters.sort && filters.sort !== "newest") sp.set("sort", filters.sort);
  return sp;
}

export function countActiveFilters(filters: Filters) {
  let n = 0;
  for (const key of ARRAY_FILTER_KEYS) n += (filters[key] as string[]).length;
  if (filters.favorite !== undefined) n++;
  if (filters.collection) n++;
  if (filters.addedAfter) n++;
  if (filters.addedBefore) n++;
  return n;
}

export const collectionInputSchema = z.object({
  name: z.string().trim().min(1, "A name is required").max(120),
  description: optionalText(2000),
  kind: z.enum(["collection", "moodboard"]).default("collection"),
  brief: optionalText(8000),
  coverImageId: z.string().max(40).optional().nullable(),
});
export type CollectionInput = z.input<typeof collectionInputSchema>;

import type {
  CapturedTheme,
  DarkModeSupport,
  ReferenceStatus,
  ScreenshotType,
  TermKind,
  Viewport,
} from "./domain";

export interface TermRef {
  name: string;
  slug: string;
}

export interface TermOption extends TermRef {
  id: string;
  kind: TermKind;
  isBuiltIn: boolean;
  count: number;
}

export interface ImageDTO {
  id: string;
  referenceId: string;
  position: number;
  label: string | null;
  mimeType: string;
  mediaType: "image" | "video";
  /** Video length; null for images. */
  durationMs: number | null;
  width: number;
  height: number;
  previewWidth: number;
  previewHeight: number;
  thumbWidth: number;
  thumbHeight: number;
  bytes: number;
  viewport: Viewport;
  viewportWidth: number | null;
  viewportHeight: number | null;
  theme: CapturedTheme;
  screenshotType: ScreenshotType;
  source: "upload" | "capture";
  createdAt: string;
  /** Relative URLs served by this app. Agents must send their API key. */
  urls: { thumb: string; preview: string; original: string };
}

export interface CoverDTO {
  id: string;
  width: number;
  height: number;
  thumbWidth: number;
  thumbHeight: number;
  screenshotType: ScreenshotType;
  mediaType: "image" | "video";
  durationMs: number | null;
}

export interface ReferenceSummary {
  id: string;
  title: string;
  siteName: string | null;
  sourceUrl: string | null;
  sourceDomain: string | null;
  industry: TermRef | null;
  pageType: TermRef | null;
  visualStyles: TermRef[];
  isFavorite: boolean;
  isSample: boolean;
  status: ReferenceStatus;
  capturedTheme: CapturedTheme;
  capturedViewport: Viewport;
  createdAt: string;
  updatedAt: string;
  imageCount: number;
  videoCount: number;
  cover: CoverDTO | null;
}

export interface AnalysisDTO {
  observations: string | null;
  interesting: string | null;
  typographyNotes: string | null;
  colorNotes: string | null;
  layoutNotes: string | null;
  interactionNotes: string | null;
  uxStrengths: string | null;
  limitations: string | null;
  usageIdeas: string | null;
  aiSuggestions: string | null;
  aiSuggestionsReviewed: boolean;
  updatedAt: string;
}

export interface ReferenceDetail extends ReferenceSummary {
  description: string | null;
  additionalIndustries: TermRef[];
  components: TermRef[];
  layouts: TermRef[];
  interactions: (TermRef & { verified: boolean })[];
  tags: TermRef[];
  screenshotType: ScreenshotType;
  supportsDarkMode: DarkModeSupport;
  attribution: string | null;
  licenseNotes: string | null;
  capturedAt: string | null;
  images: ImageDTO[];
  analysis: AnalysisDTO | null;
  collections: { id: string; name: string }[];
}

export interface CollectionSummary {
  id: string;
  name: string;
  description: string | null;
  kind: "collection" | "moodboard";
  brief: string | null;
  referenceCount: number;
  covers: CoverDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface CollectionItem {
  reference: ReferenceSummary;
  position: number;
  note: string | null;
  addedAt: string;
}

export interface CollectionDetail extends CollectionSummary {
  coverImageId: string | null;
  items: CollectionItem[];
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

import type { ImageDTO, ReferenceDetail, ReferenceSummary } from "@/lib/types";

/** Turns relative image URLs into absolute ones for agents calling the REST API. */
export function absolutize(origin: string, urls: ImageDTO["urls"]) {
  return {
    thumb: `${origin}${urls.thumb}`,
    preview: `${origin}${urls.preview}`,
    original: `${origin}${urls.original}`,
  };
}

export function originOf(req: Request) {
  return new URL(req.url).origin;
}

export function summaryForApi(origin: string, s: ReferenceSummary) {
  return {
    id: s.id,
    title: s.title,
    siteName: s.siteName,
    sourceUrl: s.sourceUrl,
    sourceDomain: s.sourceDomain,
    industry: s.industry?.name ?? null,
    pageType: s.pageType?.name ?? null,
    visualStyles: s.visualStyles.map((t) => t.name),
    capturedTheme: s.capturedTheme,
    capturedViewport: s.capturedViewport,
    status: s.status,
    isFavorite: s.isFavorite,
    isSample: s.isSample,
    imageCount: s.imageCount,
    cover: s.cover
      ? {
          imageId: s.cover.id,
          width: s.cover.width,
          height: s.cover.height,
          thumbUrl: `${origin}/api/images/${s.cover.id}/thumb`,
        }
      : null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    links: {
      self: `${origin}/api/references/${s.id}`,
      context: `${origin}/api/references/${s.id}/context`,
      images: `${origin}/api/references/${s.id}/images`,
      app: `${origin}/references/${s.id}`,
    },
  };
}

export function imageForApi(origin: string, img: ImageDTO) {
  const { urls, ...rest } = img;
  return { ...rest, urls: absolutize(origin, urls) };
}

export function detailForApi(origin: string, d: ReferenceDetail) {
  const names = (list: { name: string }[]) => list.map((t) => t.name);
  return {
    ...summaryForApi(origin, d),
    description: d.description,
    classification: {
      industry: d.industry?.name ?? null,
      additionalIndustries: names(d.additionalIndustries),
      pageType: d.pageType?.name ?? null,
      visualStyles: names(d.visualStyles),
      layouts: names(d.layouts),
      components: names(d.components),
      interactions: d.interactions.map((i) => ({ name: i.name, verified: i.verified })),
      tags: names(d.tags),
    },
    capture: {
      screenshotType: d.screenshotType,
      capturedTheme: d.capturedTheme,
      supportsDarkMode: d.supportsDarkMode,
      capturedViewport: d.capturedViewport,
      capturedAt: d.capturedAt,
    },
    source: {
      url: d.sourceUrl,
      domain: d.sourceDomain,
      attribution: d.attribution,
      licenseNotes: d.licenseNotes,
    },
    analysis: d.analysis
      ? {
          observed: { observations: d.analysis.observations },
          curatorNotes: {
            interesting: d.analysis.interesting,
            typography: d.analysis.typographyNotes,
            color: d.analysis.colorNotes,
            layout: d.analysis.layoutNotes,
            interaction: d.analysis.interactionNotes,
            uxStrengths: d.analysis.uxStrengths,
            limitations: d.analysis.limitations,
            usageIdeas: d.analysis.usageIdeas,
          },
          aiSuggestions: d.analysis.aiSuggestions
            ? { text: d.analysis.aiSuggestions, reviewed: d.analysis.aiSuggestionsReviewed, verified: false }
            : null,
        }
      : null,
    images: d.images.map((img) => imageForApi(origin, img)),
    collections: d.collections,
  };
}

export function parsePaging(url: URL, defaults = { limit: 20, max: 100 }) {
  const limit = Math.min(defaults.max, Math.max(1, Number(url.searchParams.get("limit") ?? defaults.limit) || defaults.limit));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
  return { limit, offset };
}

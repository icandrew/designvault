import {
  CAPTURED_THEMES,
  DARK_MODE_SUPPORT,
  REFERENCE_STATUSES,
  SCREENSHOT_TYPES,
  SORTS,
  TERM_KIND_LABELS,
  TERM_KINDS,
  VIEWPORTS,
} from "@/lib/domain";
import { handle, ok, requireAgentAuth } from "@/server/http";
import { listTerms } from "@/server/repositories/taxonomy";

export const dynamic = "force-dynamic";

/** GET /api/taxonomy — supported classifications (use `slug` values as filter parameters). */
export const GET = handle(async (req: Request) => {
  await requireAgentAuth(req);
  const terms = await listTerms();
  const filterParam: Record<string, string> = {
    industry: "industry",
    page_type: "pageType",
    component: "component",
    visual_style: "visualStyle",
    layout: "layout",
    interaction: "interaction",
    tag: "tag",
  };
  return ok({
    classifications: TERM_KINDS.map((kind) => ({
      kind,
      label: TERM_KIND_LABELS[kind].plural,
      filterParam: filterParam[kind],
      terms: terms.filter((t) => t.kind === kind).map((t) => ({ name: t.name, slug: t.slug, count: t.count })),
    })),
    enums: {
      viewport: VIEWPORTS,
      theme: CAPTURED_THEMES,
      darkMode: DARK_MODE_SUPPORT,
      status: REFERENCE_STATUSES,
      screenshotType: SCREENSHOT_TYPES,
      sort: SORTS,
    },
  });
});

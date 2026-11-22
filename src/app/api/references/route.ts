import { parseFilters } from "@/lib/domain";
import { originOf, parsePaging, summaryForApi } from "@/server/api-format";
import { handle, paged, requireAgentAuth } from "@/server/http";
import { listReferences } from "@/server/repositories/references";

export const dynamic = "force-dynamic";

/** GET /api/references — list and filter references (compact summaries). */
export const GET = handle(async (req: Request) => {
  await requireAgentAuth(req);
  const url = new URL(req.url);
  const { limit, offset } = parsePaging(url);
  const page = await listReferences(parseFilters(url.searchParams), { limit, offset });
  const origin = originOf(req);
  return paged(
    page.items.map((s) => summaryForApi(origin, s)),
    { total: page.total, limit, offset },
  );
});

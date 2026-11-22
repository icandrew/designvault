import { parseFilters } from "@/lib/domain";
import { searchForAgent } from "@/server/agent";
import { parsePaging } from "@/server/api-format";
import { handle, requireAgentAuth } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=<brief>&industry=pet-care&limit=8
 * Ranked metadata search with relevance explanations. `q` may be a natural
 * language brief; structured filters (same as /api/references) narrow results.
 */
export const GET = handle(async (req: Request) => {
  await requireAgentAuth(req);
  const url = new URL(req.url);
  const { limit, offset } = parsePaging(url, { limit: 8, max: 50 });
  const filters = parseFilters(url.searchParams);
  const result = await searchForAgent({ query: filters.q, filters, limit, offset });
  const hasMore = offset + result.results.length < result.total;
  return Response.json({
    data: result.results,
    meta: {
      total: result.total,
      limit,
      offset,
      hasMore,
      nextOffset: hasMore ? offset + result.results.length : null,
      matchedTerms: result.matchedTerms,
    },
  });
});

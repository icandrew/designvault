import { getReferenceContext, getSimilarForAgent } from "@/server/agent";
import { handle, HttpError, ok, requireAgentAuth } from "@/server/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/references/:id/context — compact, agent-friendly design analysis
 * separating observed facts, curator notes and unverified AI suggestions.
 * Add `?similar=true` to include related reference IDs.
 */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  await requireAgentAuth(req);
  const { id } = await params;
  const context = await getReferenceContext(id);
  if (!context) throw new HttpError(404, "Reference not found.", "not_found");
  const similar = new URL(req.url).searchParams.get("similar") === "true" ? await getSimilarForAgent(id) : undefined;
  return ok({ ...context, ...(similar ? { similar } : {}) });
});

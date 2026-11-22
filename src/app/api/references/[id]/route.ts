import { detailForApi, originOf } from "@/server/api-format";
import { handle, HttpError, ok, requireAgentAuth } from "@/server/http";
import { getReference } from "@/server/repositories/references";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** GET /api/references/:id — full metadata for one reference. */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  await requireAgentAuth(req);
  const ref = await getReference((await params).id);
  if (!ref) throw new HttpError(404, "Reference not found.", "not_found");
  return ok(detailForApi(originOf(req), ref));
});

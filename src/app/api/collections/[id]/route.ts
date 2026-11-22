import { originOf, summaryForApi } from "@/server/api-format";
import { handle, HttpError, ok, requireAgentAuth } from "@/server/http";
import { getCollection } from "@/server/repositories/collections";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** GET /api/collections/:id — collection details with ordered references and selection notes. */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  await requireAgentAuth(req);
  const collection = await getCollection((await params).id);
  if (!collection) throw new HttpError(404, "Collection not found.", "not_found");
  const origin = originOf(req);
  return ok({
    id: collection.id,
    name: collection.name,
    kind: collection.kind,
    description: collection.description,
    brief: collection.brief,
    referenceCount: collection.referenceCount,
    items: collection.items.map((item) => ({
      position: item.position,
      whySelected: item.note,
      reference: summaryForApi(origin, item.reference),
    })),
  });
});

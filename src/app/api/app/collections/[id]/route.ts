import { handle, ok, readJson, requireSameOrigin } from "@/server/http";
import { deleteCollection, updateCollection } from "@/server/repositories/collections";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const PUT = handle(async (req: Request, { params }: Ctx) => {
  requireSameOrigin(req);
  await updateCollection((await params).id, await readJson(req));
  return ok({ updated: true });
});

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  requireSameOrigin(req);
  await deleteCollection((await params).id);
  return ok({ deleted: true });
});

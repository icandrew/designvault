import { z } from "zod";
import { handle, HttpError, ok, readJson, requireSameOrigin } from "@/server/http";
import { deleteReference, getReference, setFavorite } from "@/server/repositories/references";
import { updateFromBody } from "@/server/services";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, { params }: Ctx) => {
  requireSameOrigin(req);
  const ref = await getReference((await params).id);
  if (!ref) throw new HttpError(404, "Reference not found.", "not_found");
  return ok(ref);
});

export const PUT = handle(async (req: Request, { params }: Ctx) => {
  requireSameOrigin(req);
  const { id } = await params;
  await updateFromBody(id, await readJson(req));
  return ok({ id });
});

/** Partial updates used by quick actions (favorite). */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  requireSameOrigin(req);
  const { id } = await params;
  const body = z.object({ isFavorite: z.boolean() }).parse(await readJson(req));
  await setFavorite(id, body.isFavorite);
  return ok({ id, isFavorite: body.isFavorite });
});

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  requireSameOrigin(req);
  await deleteReference((await params).id);
  return ok({ deleted: true });
});

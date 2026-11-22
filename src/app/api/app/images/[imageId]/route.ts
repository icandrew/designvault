import { imageMetaSchema } from "@/lib/domain";
import { handle, ok, readJson, requireSameOrigin } from "@/server/http";
import { deleteImage, updateImageMeta } from "@/server/repositories/references";
import { replaceWithStaged } from "@/server/services";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ imageId: string }> };

/** Update screenshot metadata (label, viewport, theme...). */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  requireSameOrigin(req);
  const meta = imageMetaSchema.partial().parse(await readJson(req));
  await updateImageMeta((await params).imageId, meta);
  return ok({ updated: true });
});

/** Replace the screenshot file, keeping its ID and position. */
export const PUT = handle(async (req: Request, { params }: Ctx) => {
  requireSameOrigin(req);
  await replaceWithStaged((await params).imageId, await readJson(req));
  return ok({ replaced: true });
});

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  requireSameOrigin(req);
  await deleteImage((await params).imageId);
  return ok({ deleted: true });
});

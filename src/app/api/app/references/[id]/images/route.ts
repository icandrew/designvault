import { z } from "zod";
import { handle, ok, readJson, requireSameOrigin } from "@/server/http";
import { reorderImages } from "@/server/repositories/references";
import { addStagedImages } from "@/server/services";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Attach additional screenshots (other viewports/themes) to a reference. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  requireSameOrigin(req);
  const ids = await addStagedImages((await params).id, await readJson(req));
  return ok({ imageIds: ids }, { status: 201 });
});

/** Reorder screenshots. */
export const PUT = handle(async (req: Request, { params }: Ctx) => {
  requireSameOrigin(req);
  const { imageIds } = z.object({ imageIds: z.array(z.string().max(40)).max(50) }).parse(await readJson(req));
  await reorderImages((await params).id, imageIds);
  return ok({ reordered: true });
});

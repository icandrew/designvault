import { z } from "zod";
import { handle, ok, readJson, requireSameOrigin } from "@/server/http";
import {
  addToCollection,
  removeFromCollection,
  reorderCollection,
  setCollectionNote,
} from "@/server/repositories/collections";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Add references to a collection. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  requireSameOrigin(req);
  const body = z
    .object({ referenceIds: z.array(z.string().max(40)).min(1).max(200), note: z.string().max(4000).optional() })
    .parse(await readJson(req));
  const added = await addToCollection((await params).id, body.referenceIds, body.note);
  return ok({ added });
});

/** Reorder (full list of reference IDs) or update one item's note. */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  requireSameOrigin(req);
  const { id } = await params;
  const body = z
    .union([
      z.object({ order: z.array(z.string().max(40)).max(1000) }),
      z.object({ referenceId: z.string().max(40), note: z.string().max(4000).nullable() }),
    ])
    .parse(await readJson(req));
  if ("order" in body) await reorderCollection(id, body.order);
  else await setCollectionNote(id, body.referenceId, body.note);
  return ok({ updated: true });
});

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  requireSameOrigin(req);
  const { referenceId } = z.object({ referenceId: z.string().max(40) }).parse(await readJson(req));
  await removeFromCollection((await params).id, referenceId);
  return ok({ removed: true });
});

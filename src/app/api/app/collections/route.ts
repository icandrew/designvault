import { z } from "zod";
import { handle, ok, readJson, requireSameOrigin } from "@/server/http";
import { addToCollection, createCollection, listCollectionOptions } from "@/server/repositories/collections";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  requireSameOrigin(req);
  return ok(await listCollectionOptions());
});

export const POST = handle(async (req: Request) => {
  requireSameOrigin(req);
  const body = await readJson(req);
  const id = await createCollection(body);
  const { referenceIds } = z.object({ referenceIds: z.array(z.string().max(40)).max(200).default([]) }).parse(body);
  if (referenceIds.length) await addToCollection(id, referenceIds);
  return ok({ id }, { status: 201 });
});

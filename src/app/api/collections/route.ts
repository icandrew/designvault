import { handle, ok, requireAgentAuth } from "@/server/http";
import { listCollections } from "@/server/repositories/collections";

export const dynamic = "force-dynamic";

/** GET /api/collections — list collections and project moodboards. */
export const GET = handle(async (req: Request) => {
  await requireAgentAuth(req);
  const collections = await listCollections();
  return ok(
    collections.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      description: c.description,
      brief: c.brief,
      referenceCount: c.referenceCount,
      updatedAt: c.updatedAt,
    })),
  );
});

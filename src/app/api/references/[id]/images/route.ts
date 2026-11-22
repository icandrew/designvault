import { imageForApi, originOf } from "@/server/api-format";
import { handle, HttpError, ok, requireAgentAuth } from "@/server/http";
import { getReference } from "@/server/repositories/references";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/references/:id/images — image metadata and access URLs.
 * Fetch the URLs with the same `Authorization: Bearer <key>` header.
 */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  await requireAgentAuth(req);
  const ref = await getReference((await params).id);
  if (!ref) throw new HttpError(404, "Reference not found.", "not_found");
  const origin = originOf(req);
  return ok({
    referenceId: ref.id,
    images: ref.images.map((img) => imageForApi(origin, img)),
    access: "Send the API key as `Authorization: Bearer <key>` when fetching image URLs. Prefer `preview` (max 1800px wide) over `original` to save bandwidth.",
  });
});

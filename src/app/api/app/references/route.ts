import { parseFilters } from "@/lib/domain";
import { handle, ok, readJson, requireSameOrigin } from "@/server/http";
import { findBySourceUrl, listReferences } from "@/server/repositories/references";
import { createFromStaged } from "@/server/services";

export const dynamic = "force-dynamic";

/** Gallery pagination for the app UI (same-origin only). */
export const GET = handle(async (req: Request) => {
  requireSameOrigin(req);
  const url = new URL(req.url);
  const sourceUrl = url.searchParams.get("sourceUrl");
  if (sourceUrl) return ok(await findBySourceUrl(sourceUrl));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
  const limit = Math.min(96, Math.max(1, Number(url.searchParams.get("limit") ?? 48) || 48));
  return ok(await listReferences(parseFilters(url.searchParams), { offset, limit }));
});

export const POST = handle(async (req: Request) => {
  requireSameOrigin(req);
  const id = await createFromStaged(await readJson(req));
  return ok({ id }, { status: 201 });
});

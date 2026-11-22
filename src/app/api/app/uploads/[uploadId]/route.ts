import { detectFormat, MIME_BY_FORMAT } from "@/server/images";
import { handle, requireImageAccess } from "@/server/http";
import { readStaged } from "@/server/staging";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ uploadId: string }> };

/** Preview of a staged (not yet saved) screenshot, e.g. from URL capture. */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  await requireImageAccess(req);
  const data = await readStaged((await params).uploadId);
  const format = detectFormat(data) ?? "png";
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": MIME_BY_FORMAT[format], "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
});

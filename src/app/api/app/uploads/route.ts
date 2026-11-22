import { getConfig } from "@/server/config";
import { handle, HttpError, ok, rateLimit, readJson, requireSameOrigin } from "@/server/http";
import { stageDirectUpload, stageUpload } from "@/server/staging";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const int = (v: unknown, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 && n <= max ? n : 0;
};

/**
 * Validates and stages one screenshot (PNG/JPEG/WebP) or MP4 video.
 *
 * - Local mode: multipart form with `file`. Videos also send `poster` (a frame
 *   captured by the browser) plus `width`, `height` and `durationMs`.
 * - Hosted mode (Blob storage): the browser uploads the file (and poster)
 *   directly to storage first, then sends JSON `{ uploadId, width, height,
 *   durationMs }` here.
 *
 * Returns dimensions and duplicate matches.
 */
export const POST = handle(async (req: Request) => {
  requireSameOrigin(req);
  rateLimit("uploads", 120, 60_000);
  const { maxVideoBytes, directUploads } = getConfig();

  if (req.headers.get("content-type")?.includes("application/json")) {
    if (!directUploads) throw new HttpError(400, "Direct uploads are not enabled.", "bad_request");
    const body = (await readJson(req)) as Record<string, unknown>;
    if (typeof body.uploadId !== "string") throw new HttpError(400, "Missing uploadId.", "bad_request");
    return ok(
      await stageDirectUpload(body.uploadId, {
        width: int(body.width, 16384),
        height: int(body.height, 16384),
        durationMs: int(body.durationMs, 6 * 60 * 60 * 1000),
      }),
    );
  }

  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > maxVideoBytes + 50 * 1024 * 1024) {
    throw new HttpError(413, `The file is larger than ${Math.round(maxVideoBytes / 1024 / 1024)} MB.`, "too_large");
  }
  const form = await req.formData().catch(() => {
    throw new HttpError(400, "Expected a file upload.", "bad_request");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Expected a file field named `file`.", "bad_request");
  const buffer = Buffer.from(await file.arrayBuffer());
  const poster = form.get("poster");
  const video =
    poster instanceof File
      ? {
          poster: Buffer.from(await poster.arrayBuffer()),
          meta: {
            width: int(form.get("width"), 16384),
            height: int(form.get("height"), 16384),
            durationMs: int(form.get("durationMs"), 6 * 60 * 60 * 1000),
          },
        }
      : undefined;
  return ok(await stageUpload(buffer, video));
});

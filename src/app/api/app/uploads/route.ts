import { getConfig } from "@/server/config";
import { handle, HttpError, ok, rateLimit, requireSameOrigin } from "@/server/http";
import { stageUpload } from "@/server/staging";

export const dynamic = "force-dynamic";

const int = (v: FormDataEntryValue | null, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 && n <= max ? n : 0;
};

/**
 * Validates and stages one screenshot (PNG/JPEG/WebP) or MP4 video. Videos
 * must include `poster` (a frame captured by the browser) plus `width`,
 * `height` and `durationMs`. Returns dimensions and duplicate matches.
 */
export const POST = handle(async (req: Request) => {
  requireSameOrigin(req);
  rateLimit("uploads", 120, 60_000);
  const { maxVideoBytes } = getConfig();
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

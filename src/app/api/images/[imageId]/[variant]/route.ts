import { handle, HttpError, requireImageAccess } from "@/server/http";
import { getImage } from "@/server/repositories/references";
import { getStorage } from "@/server/storage";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ imageId: string; variant: string }> };

const CONTENT_TYPE: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", mp4: "video/mp4" };

/**
 * Serves stored media. Variants: `thumb` (gallery), `preview` (large, never
 * upscaled; a poster frame for videos) and `original` (untouched upload —
 * the MP4 for videos). Supports HTTP Range requests so videos stream and seek.
 * Add `?download=1` to download the original with a readable filename.
 */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  await requireImageAccess(req);
  const { imageId, variant } = await params;
  if (!["thumb", "preview", "original"].includes(variant)) {
    throw new HttpError(404, "Unknown image variant.", "not_found");
  }
  const image = await getImage(imageId);
  if (!image) throw new HttpError(404, "Image not found.", "not_found");
  const key = variant === "thumb" ? image.thumbKey : variant === "preview" ? image.previewKey : image.originalKey;
  const storage = getStorage();
  const size = await storage.size(key);
  if (size === null) throw new HttpError(404, "The file is missing from storage.", "image_missing");
  const ext = key.split(".").pop()!;
  const etag = `"${key.replace(/\W/g, "")}"`;
  const headers: Record<string, string> = {
    "Content-Type": CONTENT_TYPE[ext] ?? "application/octet-stream",
    // Files are immutable per key; replacing an item changes its key.
    "Cache-Control": "private, max-age=31536000, immutable",
    ETag: etag,
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  if (new URL(req.url).searchParams.get("download")) {
    headers["Content-Disposition"] = `attachment; filename="${image.referenceId}-${image.id}.${ext}"`;
  }

  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    end = Math.min(end, size - 1, start + 8 * 1024 * 1024 - 1); // serve at most 8 MB per range request
    start = Math.min(start, end);
    if (start >= size) {
      return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
    }
    if (storage.openStream) {
      const stream = await storage.openStream(key, { start, end });
      if (!stream) throw new HttpError(404, "The file is missing from storage.", "image_missing");
      return new Response(stream, {
        status: 206,
        headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
      });
    }
    const chunk = await storage.getRange(key, start, end);
    if (!chunk) throw new HttpError(404, "The file is missing from storage.", "image_missing");
    return new Response(new Uint8Array(chunk), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${start + chunk.length - 1}/${size}`, "Content-Length": String(chunk.length) },
    });
  }

  if (storage.openStream) {
    // Remote storage: stream through without buffering the whole file.
    const stream = await storage.openStream(key);
    if (!stream) throw new HttpError(404, "The file is missing from storage.", "image_missing");
    return new Response(stream, { headers: { ...headers, "Content-Length": String(size) } });
  }
  const data = await storage.get(key);
  if (!data) throw new HttpError(404, "The file is missing from storage.", "image_missing");
  return new Response(new Uint8Array(data), { headers: { ...headers, "Content-Length": String(data.length) } });
});

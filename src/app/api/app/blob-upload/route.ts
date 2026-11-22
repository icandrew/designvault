import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getConfig } from "@/server/config";
import { handle, HttpError, rateLimit, readJson, requireSameOrigin } from "@/server/http";
import { STAGING_ID } from "@/server/staging";

export const dynamic = "force-dynamic";

const PATHNAME = /^staging\/(up_[A-Za-z0-9_-]{16,40})\.(bin|poster)$/;

/**
 * Hosted mode only: issues short-lived tokens so the browser can upload a
 * screenshot/video (and a video's poster frame) straight to private Blob
 * storage. Each token is limited to one `staging/<uploadId>.<bin|poster>`
 * path, the allowed media types and the size limit, and can't overwrite.
 * The file is validated by signature afterwards (`POST /api/app/uploads`).
 */
export const POST = handle(async (req: Request) => {
  requireSameOrigin(req);
  rateLimit("blob-upload", 240, 60_000);
  const { blobToken, maxUploadBytes, maxVideoBytes } = getConfig();
  if (!blobToken) throw new HttpError(404, "Direct uploads are not enabled.", "not_found");
  const body = (await readJson(req)) as HandleUploadBody;
  if (body?.type !== "blob.generate-client-token") {
    throw new HttpError(400, "Unsupported upload event.", "bad_request");
  }
  const result = await handleUpload({
    body,
    request: req,
    token: blobToken,
    onBeforeGenerateToken: async (pathname) => {
      const match = PATHNAME.exec(pathname);
      if (!match || !STAGING_ID.test(match[1])) throw new HttpError(400, "Invalid upload path.", "bad_request");
      const poster = match[2] === "poster";
      return {
        allowedContentTypes: poster ? ["image/png", "image/jpeg", "image/webp"] : ["image/png", "image/jpeg", "image/webp", "video/mp4"],
        maximumSizeInBytes: poster ? 40 * 1024 * 1024 : Math.max(maxUploadBytes, maxVideoBytes),
        addRandomSuffix: false,
        allowOverwrite: false,
        validUntil: Date.now() + 30 * 60 * 1000,
      };
    },
  });
  return NextResponse.json(result);
});

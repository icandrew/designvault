import { issueSignedToken } from "@vercel/blob";
import { handleUpload, handleUploadPresigned, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getConfig } from "@/server/config";
import { handle, HttpError, rateLimit, readJson, requireSameOrigin } from "@/server/http";
import { STAGING_ID } from "@/server/staging";

export const dynamic = "force-dynamic";

const PATHNAME = /^staging\/(up_[A-Za-z0-9_-]{16,40})\.(bin|poster)$/;
const UPLOAD_WINDOW_MS = 30 * 60 * 1000;

/** Each upload is limited to one staging path, the allowed media types and the size limit. */
function constraintsFor(pathname: string) {
  const match = PATHNAME.exec(pathname);
  if (!match || !STAGING_ID.test(match[1])) throw new HttpError(400, "Invalid upload path.", "bad_request");
  const { maxUploadBytes, maxVideoBytes } = getConfig();
  const poster = match[2] === "poster";
  return {
    allowedContentTypes: poster ? ["image/png", "image/jpeg", "image/webp"] : ["image/png", "image/jpeg", "image/webp", "video/mp4"],
    maximumSizeInBytes: poster ? 40 * 1024 * 1024 : Math.max(maxUploadBytes, maxVideoBytes),
  };
}

/**
 * Hosted mode only: lets the browser upload a screenshot/video (and a video's
 * poster frame) straight to private Blob storage. Two ways, depending on how
 * the Blob store is connected:
 *
 * - Read-write token (`BLOB_READ_WRITE_TOKEN`): issues a short-lived client token.
 * - Vercel's built-in identity (`BLOB_STORE_ID`, no token): issues a short-lived
 *   presigned upload URL, signed with the deployment's OIDC identity.
 *
 * Either way the grant covers one `staging/<uploadId>.<bin|poster>` path, the
 * allowed media types and the size limit, can't overwrite, and expires in 30
 * minutes. The file is validated by signature afterwards (`POST /api/app/uploads`).
 * Upload-completed callbacks are never requested or accepted.
 */
export const POST = handle(async (req: Request) => {
  requireSameOrigin(req);
  rateLimit("blob-upload", 240, 60_000);
  const { blobToken, blobAuth } = getConfig();
  if (!blobAuth) throw new HttpError(404, "Direct uploads are not enabled.", "not_found");
  const body = (await readJson(req)) as { type?: string };

  if (blobAuth === "token" && body?.type === "blob.generate-client-token") {
    const result = await handleUpload({
      body: body as HandleUploadBody,
      request: req,
      token: blobToken!,
      onBeforeGenerateToken: async (pathname) => ({
        ...constraintsFor(pathname),
        addRandomSuffix: false,
        allowOverwrite: false,
        validUntil: Date.now() + UPLOAD_WINDOW_MS,
      }),
    });
    return NextResponse.json(result);
  }

  if (blobAuth === "identity" && body?.type === "blob.generate-presigned-url") {
    const result = await handleUploadPresigned({
      body: body as Parameters<typeof handleUploadPresigned>[0]["body"],
      request: req,
      // Only used to verify upload-completed callbacks, which this route never
      // requests (no onUploadCompleted) and rejects above by event type.
      webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY || "not-used",
      getSignedToken: async (pathname) => {
        const limits = constraintsFor(pathname);
        const validUntil = Date.now() + UPLOAD_WINDOW_MS;
        const token = await issueSignedToken({ pathname, operations: ["put"], validUntil, ...limits });
        return { token, urlOptions: { ...limits, validUntil, addRandomSuffix: false, allowOverwrite: false } };
      },
    });
    return NextResponse.json(result);
  }

  throw new HttpError(400, "Unsupported upload event.", "bad_request");
});

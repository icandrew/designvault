/**
 * Upload staging area. Screenshots and videos are validated and staged as soon
 * as they are dropped into the Add Reference form (real upload progress, early
 * validation and duplicate warnings). Saving the reference consumes the staged
 * files. Stale staged files are removed automatically after 24 hours.
 *
 * Videos are staged together with a poster frame (captured in the browser) and
 * their dimensions/duration.
 */
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getConfig } from "./config";
import { detectFormat, inspectImage, ImageValidationError, isMp4, posterHash, validateVideo, type VideoMeta } from "./images";
import { findDuplicateImages } from "./repositories/references";

const STAGING_ID = /^up_[A-Za-z0-9_-]{16,40}$/;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function stagingDir() {
  return path.join(/*turbopackIgnore: true*/ getConfig().dataDir, "staging");
}

function stagingPath(uploadId: string, suffix: "bin" | "poster" | "json" = "bin") {
  if (!STAGING_ID.test(uploadId)) throw new ImageValidationError("Unknown upload. Please add the file again.");
  return path.join(/*turbopackIgnore: true*/ stagingDir(), `${uploadId}.${suffix}`);
}

export interface StagedVideoInput {
  poster: Buffer;
  meta: VideoMeta;
}

export async function stageUpload(data: Buffer, video?: StagedVideoInput) {
  const { maxUploadBytes, maxVideoBytes } = getConfig();
  const uploadId = `up_${randomBytes(16).toString("base64url")}`;
  await fs.mkdir(stagingDir(), { recursive: true });

  if (isMp4(data)) {
    validateVideo(data, maxVideoBytes);
    if (!video?.poster?.length || !detectFormat(video.poster)) {
      throw new ImageValidationError("The video’s preview frame is missing. Your browser may not be able to play this video — export it as an H.264 MP4.");
    }
    const posterInfo = await inspectImage(video.poster, 40 * 1024 * 1024);
    const width = video.meta.width || posterInfo.width;
    const height = video.meta.height || posterInfo.height;
    const sha256 = createHash("sha256").update(data).digest("hex");
    const dhash = await posterHash(video.poster);
    await fs.writeFile(stagingPath(uploadId), data);
    await fs.writeFile(stagingPath(uploadId, "poster"), video.poster);
    await fs.writeFile(stagingPath(uploadId, "json"), JSON.stringify({ kind: "video", width, height, durationMs: video.meta.durationMs }));
    void cleanupStaging();
    return {
      uploadId,
      mediaType: "video" as const,
      format: "mp4" as const,
      width,
      height,
      bytes: data.length,
      durationMs: video.meta.durationMs,
      sha256,
      dhash,
      duplicates: await findDuplicateImages(sha256, dhash),
    };
  }

  const info = await inspectImage(data, maxUploadBytes);
  await fs.writeFile(stagingPath(uploadId), data);
  void cleanupStaging();
  const duplicates = await findDuplicateImages(info.sha256, info.dhash);
  return { uploadId, mediaType: "image" as const, durationMs: null, ...info, duplicates };
}

export async function readStaged(uploadId: string) {
  try {
    return await fs.readFile(stagingPath(uploadId));
  } catch (error) {
    if (error instanceof ImageValidationError) throw error;
    throw new ImageValidationError("This upload has expired. Please add the file again.");
  }
}

/** Staged item including the poster and metadata for videos. */
export async function readStagedItem(uploadId: string): Promise<{ data: Buffer; video?: StagedVideoInput }> {
  const data = await readStaged(uploadId);
  if (!isMp4(data)) return { data };
  try {
    const poster = await fs.readFile(stagingPath(uploadId, "poster"));
    const meta = JSON.parse(await fs.readFile(stagingPath(uploadId, "json"), "utf8")) as VideoMeta;
    return { data, video: { poster, meta } };
  } catch {
    throw new ImageValidationError("This video upload is incomplete or expired. Please add it again.");
  }
}

export async function discardStaged(uploadIds: string[]) {
  await Promise.all(
    uploadIds.flatMap((id) =>
      (["bin", "poster", "json"] as const).map((s) => fs.rm(stagingPath(id, s), { force: true }).catch(() => undefined)),
    ),
  );
}

async function cleanupStaging() {
  try {
    const dir = stagingDir();
    for (const name of await fs.readdir(dir)) {
      const full = path.join(/*turbopackIgnore: true*/ dir, name);
      const stat = await fs.stat(full);
      if (Date.now() - stat.mtimeMs > MAX_AGE_MS) await fs.rm(full, { force: true });
    }
  } catch {
    // ignore
  }
}

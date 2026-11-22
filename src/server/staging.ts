/**
 * Upload staging area. Screenshots and videos are validated and staged as soon
 * as they are dropped into the Add Reference form (real upload progress, early
 * validation and duplicate warnings). Saving the reference consumes the staged
 * files. Stale staged files are removed automatically after 24 hours.
 *
 * Videos are staged together with a poster frame (captured in the browser) and
 * their dimensions/duration.
 *
 * Where staged files live:
 *  - Local: `<data>/staging/` on disk. The browser posts the file to the app.
 *  - Hosted: private Vercel Blob objects under `staging/`. The browser uploads
 *    straight to Blob storage (no 4.5 MB request limit), then asks the app to
 *    validate the staged object (`stageDirectUpload`). Serverless instances
 *    share nothing on disk, so staging must be in shared storage.
 */
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getConfig } from "./config";
import { detectFormat, inspectImage, ImageValidationError, isMp4, posterHash, validateVideo, type VideoMeta } from "./images";
import { findDuplicateImages } from "./repositories/references";
import { isBlobNotFound } from "./storage";

export const STAGING_ID = /^up_[A-Za-z0-9_-]{16,40}$/;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
type Suffix = "bin" | "poster" | "json";
const SUFFIXES: Suffix[] = ["bin", "poster", "json"];

interface StagingStore {
  write(id: string, suffix: Suffix, data: Buffer): Promise<void>;
  read(id: string, suffix: Suffix): Promise<Buffer | null>;
  remove(id: string): Promise<void>;
  cleanup(): Promise<void>;
}

function checkId(uploadId: string) {
  if (!STAGING_ID.test(uploadId)) throw new ImageValidationError("Unknown upload. Please add the file again.");
}

/** Blob pathname of a staged object (also used by the direct-upload token route). */
export function stagingPathname(uploadId: string, suffix: Suffix) {
  checkId(uploadId);
  return `staging/${uploadId}.${suffix}`;
}

class LocalStagingStore implements StagingStore {
  private dir() {
    return path.join(/*turbopackIgnore: true*/ getConfig().dataDir, "staging");
  }
  private file(id: string, suffix: Suffix) {
    checkId(id);
    return path.join(/*turbopackIgnore: true*/ this.dir(), `${id}.${suffix}`);
  }
  async write(id: string, suffix: Suffix, data: Buffer) {
    await fs.mkdir(this.dir(), { recursive: true });
    await fs.writeFile(this.file(id, suffix), data);
  }
  async read(id: string, suffix: Suffix) {
    try {
      return await fs.readFile(this.file(id, suffix));
    } catch {
      return null;
    }
  }
  async remove(id: string) {
    await Promise.all(SUFFIXES.map((s) => fs.rm(this.file(id, s), { force: true }).catch(() => undefined)));
  }
  async cleanup() {
    try {
      const dir = this.dir();
      for (const name of await fs.readdir(dir)) {
        const full = path.join(/*turbopackIgnore: true*/ dir, name);
        const stat = await fs.stat(full);
        if (Date.now() - stat.mtimeMs > MAX_AGE_MS) await fs.rm(full, { force: true });
      }
    } catch {
      // ignore
    }
  }
}

class BlobStagingStore implements StagingStore {
  constructor(private readonly token: string | null = null) {}

  /** Read-write token when available; otherwise the SDK uses BLOB_STORE_ID + Vercel's OIDC identity. */
  private auth() {
    return this.token ? { token: this.token } : {};
  }
  async write(id: string, suffix: Suffix, data: Buffer) {
    const { put } = await import("@vercel/blob");
    await put(stagingPathname(id, suffix), data, {
      access: "private",
      ...this.auth(),
      addRandomSuffix: false,
      allowOverwrite: true,
      multipart: data.length > 20 * 1024 * 1024,
    });
  }
  async read(id: string, suffix: Suffix) {
    const { get } = await import("@vercel/blob");
    try {
      const result = await get(stagingPathname(id, suffix), { access: "private", ...this.auth(), useCache: false });
      return result?.stream ? Buffer.from(await new Response(result.stream).arrayBuffer()) : null;
    } catch (error) {
      if (isBlobNotFound(error)) return null;
      throw error;
    }
  }
  async remove(id: string) {
    const { del } = await import("@vercel/blob");
    await del(SUFFIXES.map((s) => stagingPathname(id, s)), { ...this.auth() }).catch(() => undefined);
  }
  async cleanup() {
    const { list, del } = await import("@vercel/blob");
    try {
      const page = await list({ prefix: "staging/", ...this.auth(), limit: 1000 });
      const stale = page.blobs.filter((b) => Date.now() - new Date(b.uploadedAt).getTime() > MAX_AGE_MS).map((b) => b.pathname);
      if (stale.length) await del(stale, { ...this.auth() });
    } catch {
      // ignore
    }
  }
}

function store(): StagingStore {
  const { blobToken, blobEnabled } = getConfig();
  return blobEnabled ? new BlobStagingStore(blobToken) : new LocalStagingStore();
}

function maybeCleanup(s: StagingStore) {
  // Listing remote storage on every upload would be wasteful; do it now and then.
  if (getConfig().blobEnabled && Math.random() > 0.05) return;
  void s.cleanup();
}

export interface StagedVideoInput {
  poster: Buffer;
  meta: VideoMeta;
}

/** Validates staged bytes, records video metadata and finds duplicates. */
async function analyze(s: StagingStore, uploadId: string, data: Buffer, video?: StagedVideoInput) {
  const { maxUploadBytes, maxVideoBytes } = getConfig();
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
    await s.write(uploadId, "json", Buffer.from(JSON.stringify({ kind: "video", width, height, durationMs: video.meta.durationMs })));
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
  const duplicates = await findDuplicateImages(info.sha256, info.dhash);
  return { uploadId, mediaType: "image" as const, durationMs: null, ...info, duplicates };
}

/** Local mode: the file arrives in the request body. */
export async function stageUpload(data: Buffer, video?: StagedVideoInput) {
  const s = store();
  const uploadId = `up_${randomBytes(16).toString("base64url")}`;
  // Cheap checks before writing anything.
  if (isMp4(data)) validateVideo(data, getConfig().maxVideoBytes);
  else if (!detectFormat(data)) await inspectImage(data, getConfig().maxUploadBytes);
  try {
    await s.write(uploadId, "bin", data);
    if (isMp4(data) && video?.poster?.length) await s.write(uploadId, "poster", video.poster);
    const result = await analyze(s, uploadId, data, video);
    maybeCleanup(s);
    return result;
  } catch (error) {
    await s.remove(uploadId);
    throw error;
  }
}

/**
 * Hosted mode: the browser already uploaded `staging/<id>.bin` (and, for
 * videos, `staging/<id>.poster`) to Blob storage. Validate and analyse it.
 */
export async function stageDirectUpload(uploadId: string, meta?: VideoMeta) {
  checkId(uploadId);
  const s = store();
  const data = await s.read(uploadId, "bin");
  if (!data) throw new ImageValidationError("The upload didn’t arrive. Please add the file again.");
  try {
    let video: StagedVideoInput | undefined;
    if (isMp4(data)) {
      const poster = await s.read(uploadId, "poster");
      video = poster ? { poster, meta: meta ?? { width: 0, height: 0, durationMs: 0 } } : undefined;
    }
    const result = await analyze(s, uploadId, data, video);
    maybeCleanup(s);
    return result;
  } catch (error) {
    await s.remove(uploadId);
    throw error;
  }
}

export async function readStaged(uploadId: string) {
  checkId(uploadId);
  const data = await store().read(uploadId, "bin");
  if (!data) throw new ImageValidationError("This upload has expired. Please add the file again.");
  return data;
}

/** Staged item including the poster and metadata for videos. */
export async function readStagedItem(uploadId: string): Promise<{ data: Buffer; video?: StagedVideoInput }> {
  const data = await readStaged(uploadId);
  if (!isMp4(data)) return { data };
  const s = store();
  const [poster, json] = await Promise.all([s.read(uploadId, "poster"), s.read(uploadId, "json")]);
  if (!poster || !json) throw new ImageValidationError("This video upload is incomplete or expired. Please add it again.");
  return { data, video: { poster, meta: JSON.parse(json.toString("utf8")) as VideoMeta } };
}

export async function discardStaged(uploadIds: string[]) {
  const s = store();
  await Promise.all(uploadIds.filter((id) => STAGING_ID.test(id)).map((id) => s.remove(id).catch(() => undefined)));
}

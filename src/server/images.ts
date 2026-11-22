/**
 * Image validation and derivative generation.
 *
 *  - Validates file signatures (magic bytes), never trusting names or MIME headers.
 *  - Keeps the original bytes untouched.
 *  - Generates a gallery thumbnail (cropped from the top to at most 1:2 for very
 *    tall full-page captures) and a large preview that is never upscaled.
 *  - Computes a SHA-256 (exact duplicate detection) and a 64-bit difference
 *    hash (near-duplicate detection).
 */
import { createHash } from "node:crypto";
import sharp, { type Metadata } from "sharp";

export type ImageFormat = "png" | "jpg" | "webp";

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageValidationError";
  }
}

export function detectFormat(buf: Buffer): ImageFormat | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

export const MIME_BY_FORMAT: Record<ImageFormat, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

const THUMB_WIDTH = 720;
const THUMB_MAX_RATIO = 2; // height / width
const PREVIEW_WIDTH = 1800;
const WEBP_MAX = 16383;

export interface ProcessedImage {
  format: ImageFormat | "mp4";
  mimeType: string;
  mediaType: "image" | "video";
  durationMs: number | null;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  dhash: string;
  original: Buffer;
  preview: { data: Buffer; ext: "webp" | "jpg"; width: number; height: number };
  thumb: { data: Buffer; width: number; height: number };
}

export async function processImage(input: Buffer, maxBytes: number): Promise<ProcessedImage> {
  if (input.length === 0) throw new ImageValidationError("The file is empty.");
  if (input.length > maxBytes) {
    throw new ImageValidationError(`The file is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }
  const format = detectFormat(input);
  if (!format) throw new ImageValidationError("Only PNG, JPEG and WebP screenshots are supported.");

  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 120_000_000 }).metadata();
  } catch {
    throw new ImageValidationError("The image could not be read. It may be corrupted.");
  }
  // Respect EXIF orientation for dimensions.
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = rotated ? meta.height : meta.width;
  const height = rotated ? meta.width : meta.height;
  if (!width || !height) throw new ImageValidationError("The image has no readable dimensions.");
  if (width < 16 || height < 16) throw new ImageValidationError("The image is too small to be a useful reference.");

  const base = () => sharp(input, { limitInputPixels: 120_000_000 }).rotate();

  // Thumbnail: scale to THUMB_WIDTH (never enlarge), then crop from top to max ratio.
  const thumbW = Math.min(THUMB_WIDTH, width);
  const scaledH = Math.round((height * thumbW) / width);
  const thumbH = Math.min(scaledH, Math.round(thumbW * THUMB_MAX_RATIO));
  const thumbData = await base()
    .resize({ width: thumbW, height: thumbH, fit: "cover", position: "top", withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();

  // Preview: never upscale. WebP cannot exceed 16383px, so very tall pages use JPEG.
  const previewW = Math.min(PREVIEW_WIDTH, width);
  const previewH = Math.round((height * previewW) / width);
  const previewExt = previewH > WEBP_MAX ? "jpg" : "webp";
  const previewPipeline = base().resize({ width: previewW, withoutEnlargement: true });
  const previewData =
    previewExt === "webp"
      ? await previewPipeline.webp({ quality: 85 }).toBuffer()
      : await previewPipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer();

  return {
    format,
    mimeType: MIME_BY_FORMAT[format],
    mediaType: "image",
    durationMs: null,
    width,
    height,
    bytes: input.length,
    sha256: createHash("sha256").update(input).digest("hex"),
    dhash: await differenceHash(input),
    original: input,
    preview: { data: previewData, ext: previewExt, width: previewW, height: previewH },
    thumb: { data: thumbData, width: thumbW, height: thumbH },
  };
}

// ---------------------------------------------------------------------------
// MP4 video
// ---------------------------------------------------------------------------

const NON_VIDEO_BRANDS = new Set(["M4A ", "M4B ", "M4P ", "qt  ", "heic", "heix", "mif1", "msf1", "avif", "avis"]);

/** MP4 signature: an `ftyp` box at offset 4 with a video-capable major brand. */
export function isMp4(buf: Buffer) {
  if (buf.length < 16 || buf.toString("ascii", 4, 8) !== "ftyp") return false;
  return !NON_VIDEO_BRANDS.has(buf.toString("latin1", 8, 12));
}

export interface VideoMeta {
  width: number;
  height: number;
  durationMs: number;
}

export function validateVideo(input: Buffer, maxBytes: number) {
  if (input.length === 0) throw new ImageValidationError("The file is empty.");
  if (input.length > maxBytes) {
    throw new ImageValidationError(`The video is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }
  if (!isMp4(input)) throw new ImageValidationError("Only MP4 videos are supported.");
}

/**
 * The MP4 is stored untouched as the original. The browser extracts a poster
 * frame at upload time (no server-side video tooling needed); the gallery
 * thumbnail, preview and duplicate hash are generated from that poster.
 */
export async function processVideo(video: Buffer, poster: Buffer, meta: VideoMeta, maxVideoBytes: number): Promise<ProcessedImage> {
  validateVideo(video, maxVideoBytes);
  const posterProcessed = await processImage(poster, 40 * 1024 * 1024).catch(() => {
    throw new ImageValidationError("The video’s preview frame could not be read. Try uploading the video again.");
  });
  return {
    ...posterProcessed,
    format: "mp4",
    mimeType: "video/mp4",
    mediaType: "video",
    durationMs: meta.durationMs,
    width: meta.width || posterProcessed.width,
    height: meta.height || posterProcessed.height,
    bytes: video.length,
    sha256: createHash("sha256").update(video).digest("hex"),
    original: video,
  };
}

export async function posterHash(poster: Buffer) {
  return differenceHash(poster);
}

/** Cheap validation + hashing used at upload time (before the reference is saved). */
export async function inspectImage(input: Buffer, maxBytes: number) {
  if (input.length === 0) throw new ImageValidationError("The file is empty.");
  if (input.length > maxBytes) {
    throw new ImageValidationError(`The file is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }
  const format = detectFormat(input);
  if (!format) throw new ImageValidationError("Only PNG, JPEG and WebP screenshots are supported.");
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 120_000_000 }).metadata();
  } catch {
    throw new ImageValidationError("The image could not be read. It may be corrupted.");
  }
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = (rotated ? meta.height : meta.width) ?? 0;
  const height = (rotated ? meta.width : meta.height) ?? 0;
  if (width < 16 || height < 16) throw new ImageValidationError("The image is too small to be a useful reference.");
  return {
    format,
    width,
    height,
    bytes: input.length,
    sha256: createHash("sha256").update(input).digest("hex"),
    dhash: await differenceHash(input),
  };
}

/** 64-bit dHash on the top region (full-page screenshots differ mostly below the fold). */
async function differenceHash(input: Buffer): Promise<string> {
  const img = sharp(input, { limitInputPixels: 120_000_000 }).rotate();
  const meta = await img.metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const regionH = Math.min(h, Math.round(w * 1.2));
  const raw = await sharp(input, { limitInputPixels: 120_000_000 })
    .rotate()
    .extract({ left: 0, top: 0, width: w, height: regionH })
    .greyscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer();
  let bits = "";
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits += raw[y * 9 + x] > raw[y * 9 + x + 1] ? "1" : "0";
    }
  }
  return BigInt(`0b${bits}`).toString(16).padStart(16, "0");
}

export function hammingDistance(a: string, b: string) {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (x) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

import { captureVideoPoster, mediaKind, type VideoPoster } from "./media";

/** Small fetch wrapper for the app's same-origin endpoints. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

export async function api<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError("Could not reach the Design Vault server. Is it still running?", 0, "network_error");
  }
  let body: { data?: T; error?: { message: string; code?: string; details?: { path: string; message: string }[] } } = {};
  try {
    body = await res.json();
  } catch {
    // non-JSON response
  }
  if (!res.ok) {
    throw new ApiError(body.error?.message ?? `Request failed (${res.status}).`, res.status, body.error?.code, body.error?.details);
  }
  return body.data as T;
}

export interface UploadResult {
  uploadId: string;
  format: "png" | "jpg" | "webp" | "mp4";
  mediaType: "image" | "video";
  durationMs: number | null;
  width: number;
  height: number;
  bytes: number;
  duplicates: { referenceId: string; title: string; imageId: string; kind: "exact" | "similar"; distance: number }[];
}

/**
 * Uploads a screenshot or MP4 with progress. For videos, a poster frame,
 * dimensions and duration are captured in the browser first and sent along.
 */
export async function uploadFile(file: File, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<UploadResult> {
  const video = mediaKind(file) === "video" ? await captureVideoPoster(file).catch((e: Error) => Promise.reject(new ApiError(e.message, 0))) : null;
  if (typeof document !== "undefined" && document.documentElement.dataset.uploads === "direct") {
    return directUpload(file, video, onProgress, signal);
  }
  return sendUpload(file, video, onProgress, signal);
}

function newUploadId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `up_${btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

/**
 * Hosted mode: upload straight to private Blob storage (no 4.5 MB request
 * limit), then ask the app to validate the staged file.
 */
async function directUpload(file: File, video: VideoPoster | null, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<UploadResult> {
  // Stores connected via Vercel's built-in identity use presigned upload URLs; token stores use client tokens.
  const { upload: tokenUpload, uploadPresigned } = await import("@vercel/blob/client");
  const upload = document.documentElement.dataset.blobAuth === "identity" ? uploadPresigned : tokenUpload;
  const uploadId = newUploadId();
  const options = { access: "private" as const, handleUploadUrl: "/api/app/blob-upload", abortSignal: signal };
  try {
    if (video) await upload(`staging/${uploadId}.poster`, video.poster, { ...options, contentType: video.poster.type || "image/png" });
    await upload(`staging/${uploadId}.bin`, file, {
      ...options,
      contentType: file.type || (mediaKind(file) === "video" ? "video/mp4" : "application/octet-stream"),
      multipart: file.size > 20 * 1024 * 1024,
      onUploadProgress: (p) => onProgress(Math.min(0.99, p.percentage / 100)),
    });
  } catch (error) {
    if (signal?.aborted) throw new ApiError("Upload cancelled.", 0, "aborted");
    const message = error instanceof Error ? error.message : "";
    throw new ApiError(
      /content type|contentType/i.test(message)
        ? "Unsupported file type. Use PNG, JPEG, WebP or MP4."
        : /size|too large/i.test(message)
          ? "The file is too large."
          : "Upload failed. Check your connection and try again.",
      0,
    );
  }
  onProgress(1);
  return api<UploadResult>("/api/app/uploads", {
    method: "POST",
    signal,
    json: { uploadId, width: video?.width, height: video?.height, durationMs: video?.durationMs },
  });
}

function sendUpload(file: File, video: VideoPoster | null, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/app/uploads");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      const body = xhr.response as { data?: UploadResult; error?: { message: string } } | null;
      if (xhr.status >= 200 && xhr.status < 300 && body?.data) resolve(body.data);
      else reject(new ApiError(body?.error?.message ?? `Upload failed (${xhr.status}).`, xhr.status));
    };
    xhr.onerror = () => reject(new ApiError("Upload failed. Check that the server is running.", 0));
    xhr.onabort = () => reject(new ApiError("Upload cancelled.", 0, "aborted"));
    signal?.addEventListener("abort", () => xhr.abort());
    const form = new FormData();
    form.append("file", file);
    if (video) {
      form.append("poster", video.poster, "poster.png");
      form.append("width", String(video.width));
      form.append("height", String(video.height));
      form.append("durationMs", String(video.durationMs));
    }
    xhr.send(form);
  });
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
}

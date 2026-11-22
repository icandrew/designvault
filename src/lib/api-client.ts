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
  return sendUpload(file, video, onProgress, signal);
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

"use client";

import { isSupportedImageFile } from "./clipboard";

export const MAX_IMAGE_MB = 25;
export const MAX_VIDEO_MB = 200;
/** For <input type="file" accept>. */
export const ACCEPT_MEDIA = "image/png,image/jpeg,image/webp,video/mp4,.png,.jpg,.jpeg,.webp,.mp4,.m4v";

export type MediaKind = "image" | "video";

export function mediaKind(file: File): MediaKind | null {
  if (isSupportedImageFile(file)) return "image";
  if (file.type === "video/mp4" || file.type === "video/x-m4v") return "video";
  if ((!file.type || file.type === "application/octet-stream") && /\.(mp4|m4v)$/i.test(file.name)) return "video";
  return null;
}

/** Client-side validation message, or undefined when the file is acceptable. */
export function validateMediaFile(file: File) {
  const kind = mediaKind(file);
  if (!kind) return "Unsupported file type. Use PNG, JPEG, WebP or MP4.";
  const max = kind === "video" ? MAX_VIDEO_MB : MAX_IMAGE_MB;
  if (file.size > max * 1024 * 1024) return `File is larger than ${max} MB.`;
  return undefined;
}

export interface VideoPoster {
  poster: Blob;
  width: number;
  height: number;
  durationMs: number;
}

function once(el: HTMLMediaElement, event: string, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    const ok = () => {
      clearTimeout(timer);
      el.removeEventListener("error", fail);
      resolve();
    };
    const fail = () => {
      clearTimeout(timer);
      el.removeEventListener(event, ok);
      reject(new Error("error"));
    };
    el.addEventListener(event, ok, { once: true });
    el.addEventListener("error", fail, { once: true });
  });
}

/**
 * Reads dimensions and duration and captures a poster frame (≈1 s in, or 10 %
 * for short clips) using the browser's own video decoder.
 */
export async function captureVideoPoster(file: Blob): Promise<VideoPoster> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await once(video, "loadedmetadata", 15000);
    let duration = video.duration;
    if (!Number.isFinite(duration)) {
      // Some recorders omit the duration; seeking far ahead makes the browser compute it.
      video.currentTime = 1e7;
      await once(video, "seeked", 15000).catch(() => undefined);
      duration = Number.isFinite(video.duration) ? video.duration : 0;
    }
    if (!video.videoWidth || !video.videoHeight) throw new Error("no video track");
    const target = duration > 0 ? Math.min(1, duration * 0.1) : 0;
    video.currentTime = target;
    await once(video, "seeked", 15000).catch(() => undefined);
    if (video.readyState < 2) await once(video, "loadeddata", 10000);

    const scale = Math.min(1, 2400 / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    const poster = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!poster) throw new Error("no poster");
    return { poster, width: video.videoWidth, height: video.videoHeight, durationMs: Math.round(duration * 1000) };
  } catch {
    throw new Error("This video can’t be played in your browser, so no preview could be made. Export it as an H.264 MP4 and try again.");
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

export function formatDuration(ms: number | null | undefined) {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { uploadFile, type UploadResult } from "@/lib/api-client";
import { ACCEPT_MEDIA, mediaKind, validateMediaFile } from "@/lib/media";
import type { CapturedTheme, ScreenshotType, Viewport } from "@/lib/domain";

export interface StagedImage {
  key: string;
  name: string;
  previewUrl: string;
  status: "uploading" | "ready" | "error";
  progress: number;
  error?: string;
  file?: File;
  uploadId?: string;
  width?: number;
  height?: number;
  bytes?: number;
  mediaType: "image" | "video";
  durationMs?: number | null;
  duplicates: UploadResult["duplicates"];
  source: "upload" | "capture";
  meta: {
    label: string | null;
    viewport: Viewport;
    theme: CapturedTheme;
    screenshotType: ScreenshotType;
    viewportWidth?: number | null;
    viewportHeight?: number | null;
  };
}

/** Value for <input accept>: screenshots and MP4 videos. */
export const ACCEPTED_TYPES = [ACCEPT_MEDIA];
const CONCURRENCY = 2;

let counter = 0;
const nextKey = () => `img-${Date.now().toString(36)}-${counter++}`;

function guessMeta(width?: number, height?: number): Partial<StagedImage["meta"]> {
  if (!width || !height) return {};
  const viewport: Viewport = width <= 500 ? "mobile" : width <= 1024 ? "tablet" : "desktop";
  const ratio = height / width;
  const screenshotType: ScreenshotType = (ratio > 1.4 && viewport === "desktop") || ratio > 2.4 ? "full_page" : "viewport";
  return { viewport, screenshotType };
}

const validate = validateMediaFile;

type Patch = (key: string, update: Partial<StagedImage>) => void;

/** Small upload queue (outside React state) with limited concurrency. */
function createUploadQueue(patch: Patch) {
  const queue: { key: string; file: File }[] = [];
  let active = 0;
  const pump = () => {
    while (active < CONCURRENCY && queue.length) {
      const { key, file } = queue.shift()!;
      active++;
      uploadFile(file, (p) => patch(key, { progress: p }))
        .then((res) =>
          patch(key, {
            status: "ready",
            progress: 1,
            uploadId: res.uploadId,
            width: res.width,
            height: res.height,
            bytes: res.bytes,
            mediaType: res.mediaType,
            durationMs: res.durationMs,
            duplicates: res.duplicates,
            meta: guessMeta(res.width, res.height) as StagedImage["meta"],
          }),
        )
        .catch((e: Error) => patch(key, { status: "error", error: e.message }))
        .finally(() => {
          active--;
          pump();
        });
    }
  };
  return {
    enqueue(key: string, file: File) {
      queue.push({ key, file });
      pump();
    },
  };
}

/** Client-side state for screenshots staged in the Add Reference form. */
export function useStagedImages(defaults: { theme: CapturedTheme }) {
  const [images, setImages] = useState<StagedImage[]>([]);
  const blobUrls = useRef(new Set<string>());
  const [uploader] = useState(() =>
    createUploadQueue((key, update) =>
      setImages((list) => list.map((img) => (img.key === key ? { ...img, ...update, meta: { ...img.meta, ...update.meta } } : img))),
    ),
  );

  const patch = useCallback<Patch>((key, update) => {
    setImages((list) => list.map((img) => (img.key === key ? { ...img, ...update, meta: { ...img.meta, ...update.meta } } : img)));
  }, []);

  const revoke = (url: string) => {
    if (url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
      blobUrls.current.delete(url);
    }
  };
  const objectUrl = (file: File) => {
    const url = URL.createObjectURL(file);
    blobUrls.current.add(url);
    return url;
  };

  const addFiles = useCallback(
    (files: File[]) => {
      const added: StagedImage[] = files.map((file) => {
        const error = validate(file);
        return {
          key: nextKey(),
          name: file.name,
          previewUrl: objectUrl(file),
          status: error ? "error" : "uploading",
          error,
          progress: 0,
          file,
          mediaType: mediaKind(file) === "video" ? "video" : "image",
          duplicates: [],
          source: "upload",
          meta: { label: null, viewport: "desktop", theme: defaults.theme, screenshotType: mediaKind(file) === "video" ? "viewport" : "full_page" },
        };
      });
      setImages((list) => [...list, ...added]);
      for (const a of added) if (a.status === "uploading" && a.file) uploader.enqueue(a.key, a.file);
    },
    [defaults.theme, uploader],
  );

  const addCaptured = useCallback(
    (items: { uploadId: string; width: number; height: number; bytes: number; name: string; duplicates: UploadResult["duplicates"]; meta: StagedImage["meta"] }[]) => {
      setImages((list) => [
        ...list,
        ...items.map((it) => ({
          key: nextKey(),
          name: it.name,
          previewUrl: `/api/app/uploads/${it.uploadId}`,
          status: "ready" as const,
          progress: 1,
          uploadId: it.uploadId,
          width: it.width,
          height: it.height,
          bytes: it.bytes,
          mediaType: "image" as const,
          duplicates: it.duplicates,
          source: "capture" as const,
          meta: it.meta,
        })),
      ]);
    },
    [],
  );

  const remove = useCallback((key: string) => {
    setImages((list) => {
      const img = list.find((i) => i.key === key);
      if (img) revoke(img.previewUrl);
      return list.filter((i) => i.key !== key);
    });
  }, []);

  const replace = useCallback(
    (key: string, file: File) => {
      const error = validate(file);
      const previewUrl = objectUrl(file);
      setImages((list) =>
        list.map((i) => {
          if (i.key !== key) return i;
          revoke(i.previewUrl);
          return { ...i, file, name: file.name, previewUrl, mediaType: mediaKind(file) === "video" ? "video" : "image", status: error ? "error" : "uploading", error, progress: 0, uploadId: undefined, duplicates: [], source: "upload" };
        }),
      );
      if (!error) uploader.enqueue(key, file);
    },
    [uploader],
  );

  const retry = useCallback(
    (key: string, file?: File) => {
      if (!file) return;
      patch(key, { status: "uploading", error: undefined, progress: 0 });
      uploader.enqueue(key, file);
    },
    [patch, uploader],
  );

  const move = useCallback((key: string, dir: -1 | 1) => {
    setImages((list) => {
      const i = list.findIndex((x) => x.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const copy = [...list];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }, []);

  /** The first item is the reference's cover (gallery thumbnail). */
  const makeCover = useCallback((key: string) => {
    setImages((list) => {
      const item = list.find((x) => x.key === key);
      return item ? [item, ...list.filter((x) => x.key !== key)] : list;
    });
  }, []);

  const clear = useCallback(() => {
    for (const url of blobUrls.current) URL.revokeObjectURL(url);
    blobUrls.current.clear();
    setImages([]);
  }, []);

  // Revoke previews on real unmount only (React dev mode simulates unmount/remount).
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const urls = blobUrls.current;
    return () => {
      mounted.current = false;
      setTimeout(() => {
        if (mounted.current) return;
        for (const url of urls) URL.revokeObjectURL(url);
      }, 0);
    };
  }, []);

  return {
    images,
    addFiles,
    addCaptured,
    remove,
    replace,
    retry: (key: string) => retry(key, images.find((i) => i.key === key)?.file),
    move,
    makeCover,
    clear,
    updateMeta: (key: string, meta: Partial<StagedImage["meta"]>) => patch(key, { meta } as Partial<StagedImage>),
  };
}

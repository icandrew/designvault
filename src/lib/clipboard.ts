"use client";

/**
 * Clipboard image support: Ctrl/⌘+V anywhere in the app, or the "Paste" button
 * (async Clipboard API). Formats other than PNG/JPEG/WebP (e.g. GIF, BMP, AVIF
 * copied from some sites) are converted to PNG in the browser first.
 */
export const SUPPORTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Accepts by MIME type, or by extension when the OS reports no type (common for .webp on Windows). */
export function isSupportedImageFile(file: File) {
  if (SUPPORTED_IMAGE_TYPES.includes(file.type)) return true;
  return !file.type && /\.(png|jpe?g|webp)$/i.test(file.name);
}

function pastedName(type: string, index: number) {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
  return `Pasted image ${stamp}${index ? ` (${index + 1})` : ""}.${EXTENSIONS[type] ?? "png"}`;
}

async function toPng(blob: Blob): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    bitmap.close();
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  } catch {
    return null;
  }
}

/** Normalizes clipboard blobs into uploadable Files with readable names. */
async function normalize(blobs: Blob[]): Promise<File[]> {
  const files: File[] = [];
  for (const [i, blob] of blobs.entries()) {
    let data: Blob | null = blob;
    let type = blob.type;
    if (!SUPPORTED_IMAGE_TYPES.includes(type)) {
      data = await toPng(blob);
      type = "image/png";
    }
    if (!data) continue;
    // Browsers name clipboard images generically ("image.png"); keep only meaningful names.
    const original = blob instanceof File && blob.name && !/^image\.\w+$/i.test(blob.name) ? blob.name : null;
    files.push(new File([data], original && SUPPORTED_IMAGE_TYPES.includes(blob.type) ? original : pastedName(type, i), { type }));
  }
  return files;
}

/** Images from a paste event (synchronous access to the data is required). */
export function imageBlobsFromPaste(event: ClipboardEvent): Blob[] {
  const items = event.clipboardData?.items;
  if (!items) return [];
  const blobs: Blob[] = [];
  for (const item of items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) blobs.push(file);
    }
  }
  return blobs;
}

export async function filesFromPasteEvent(event: ClipboardEvent) {
  return normalize(imageBlobsFromPaste(event));
}

/** Reads images via the async Clipboard API (for a "Paste" button). */
export async function readClipboardImages(): Promise<{ files: File[]; error?: string }> {
  if (!navigator.clipboard?.read) {
    return { files: [], error: "Your browser can’t read the clipboard from a button. Press Ctrl+V (⌘V on Mac) instead." };
  }
  try {
    const items = await navigator.clipboard.read();
    const blobs: Blob[] = [];
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith("image/"));
      if (type) blobs.push(await item.getType(type));
    }
    if (!blobs.length) return { files: [], error: "There’s no image on your clipboard. Copy an image first (right-click → Copy image)." };
    return { files: await normalize(blobs) };
  } catch {
    return { files: [], error: "Clipboard access was blocked. Press Ctrl+V (⌘V on Mac) instead." };
  }
}

/**
 * Images pasted on a page without an uploader (e.g. the gallery) are handed to
 * the Add Reference page through this in-memory hand-off during client navigation.
 */
let pending: File[] = [];
export function stashPendingImages(files: File[]) {
  pending = files;
}
export function takePendingImages() {
  const files = pending;
  pending = [];
  return files;
}

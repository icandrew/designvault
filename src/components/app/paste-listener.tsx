"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { filesFromPasteEvent, imageBlobsFromPaste, stashPendingImages } from "@/lib/clipboard";

/** Pages that handle pasted images themselves. */
const HANDLED = [/^\/references\/new$/, /^\/references\/[^/]+\/edit$/];

export type PasteHandler = (files: File[]) => void;

/**
 * Ctrl/⌘+V an image anywhere: on pages with an uploader the page's handler
 * receives it; elsewhere it opens Add reference with the image attached.
 * Text pastes into inputs are left alone.
 */
export function usePasteImages(onFiles: PasteHandler, enabled = true) {
  const handler = useRef(onFiles);
  useEffect(() => {
    handler.current = onFiles;
  });
  useEffect(() => {
    if (!enabled) return;
    const onPaste = async (event: ClipboardEvent) => {
      if (!imageBlobsFromPaste(event).length) return;
      event.preventDefault();
      const files = await filesFromPasteEvent(event);
      if (files.length) handler.current(files);
      else toast.error("That image format couldn’t be read. Try copying it again or save and upload the file.");
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [enabled]);
}

export function GlobalPasteListener() {
  const pathname = usePathname();
  const router = useRouter();
  const handled = HANDLED.some((r) => r.test(pathname));
  usePasteImages((files) => {
    stashPendingImages(files);
    toast.success(files.length === 1 ? "Image pasted — add its details" : `${files.length} images pasted — add their details`);
    router.push("/references/new");
  }, !handled);
  return null;
}

"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Film, Loader2, Replace, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, formatBytes, uploadFile } from "@/lib/api-client";
import { CAPTURED_THEMES, LABELS, SCREENSHOT_TYPES, VIEWPORTS } from "@/lib/domain";
import type { ImageDTO } from "@/lib/types";
import { usePasteImages } from "@/components/app/paste-listener";
import { formatDuration, mediaKind } from "@/lib/media";
import { DropZone } from "./screenshot-uploader";
import { ACCEPTED_TYPES } from "./use-staged-images";

/**
 * Manages the screenshots of an existing reference. Changes here apply
 * immediately (separately from the metadata form below).
 */
export function ImageManager({ referenceId, images }: { referenceId: string; images: ImageDTO[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{ name: string; progress: number }[]>([]);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(success);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const addFiles = async (files: File[]) => {
    const valid = files.filter((f) => mediaKind(f) !== null);
    if (valid.length < files.length) toast.error("Some files were skipped: only PNG, JPEG, WebP and MP4 are supported.");
    if (!valid.length) return;
    setUploading(valid.map((f) => ({ name: f.name, progress: 0 })));
    try {
      const staged = [];
      for (const [i, file] of valid.entries()) {
        const res = await uploadFile(file, (p) => setUploading((u) => u.map((x, j) => (j === i ? { ...x, progress: p } : x))));
        const viewport = res.width <= 500 ? "mobile" : res.width <= 1024 ? "tablet" : "desktop";
        staged.push({ uploadId: res.uploadId, meta: { label: null, viewport, theme: "unknown", screenshotType: res.mediaType === "image" && res.height / res.width > 1.4 ? "full_page" : "viewport" } });
      }
      await api(`/api/app/references/${referenceId}/images`, { method: "POST", json: { images: staged } });
      toast.success(`Added ${staged.length} item${staged.length === 1 ? "" : "s"}`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading([]);
    }
  };

  // Ctrl/⌘+V attaches clipboard images to this reference.
  usePasteImages((files) => void addFiles(files), uploading.length === 0);

  const makeCover = (index: number) => {
    const ids = images.map((i) => i.id);
    const [cover] = ids.splice(index, 1);
    void run(`cover-${index}`, () => api(`/api/app/references/${referenceId}/images`, { method: "PUT", json: { imageIds: [cover, ...ids] } }), "Cover updated");
  };

  const move = (index: number, dir: -1 | 1) => {
    const ids = images.map((i) => i.id);
    const j = index + dir;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    void run(`move-${index}`, () => api(`/api/app/references/${referenceId}/images`, { method: "PUT", json: { imageIds: ids } }), "Order updated");
  };

  return (
    <section aria-labelledby="images-title" className="mb-8 grid gap-x-10 gap-y-5 border-b pb-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div>
        <h2 id="images-title" className="text-title font-medium">
          Screenshots & videos
        </h2>
        <p className="mt-1 text-meta text-muted-foreground">
          Attach screenshots or MP4 videos (other viewports or themes), pick the cover with the star, reorder, replace or remove. Changes here save immediately.
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,380px),1fr))]">
          {images.map((img, index) => (
            <li key={img.id} className="flex gap-3 rounded-xl border bg-card p-3">
              <div className="dv-canvas relative h-36 w-20 shrink-0 overflow-hidden rounded-md ring-1 ring-border sm:w-24">
                {img.mediaType === "video" ? (
                  <video src={img.urls.original} poster={img.urls.thumb} muted loop autoPlay playsInline preload="metadata" aria-label={img.label ?? `Video ${index + 1}`} className="h-full w-full object-cover object-top" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- stored thumbnail
                  <img src={img.urls.thumb} alt={img.label ?? `Screenshot ${index + 1}`} className="h-full w-full object-cover object-top" />
                )}
                {img.mediaType === "video" && (
                  <span className="absolute top-1 right-1 flex items-center gap-1 rounded bg-background/90 px-1.5 py-0.5 text-micro font-medium">
                    <Film className="size-3" /> {formatDuration(img.durationMs) || "Video"}
                  </span>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 text-micro text-subtle-foreground">
                    {index === 0 && <span className="mr-1.5 rounded bg-accent px-1.5 py-0.5 font-medium text-foreground">Cover</span>}
                    {img.mediaType === "video" ? "Video · " : ""}
                    {img.width} × {img.height} · {formatBytes(img.bytes)}
                  </p>
                  <div className="flex shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={index === 0 ? "This is the cover" : `Use ${img.mediaType === "video" ? "video" : "screenshot"} ${index + 1} as cover`}
                      title={index === 0 ? "Cover — shown as the gallery thumbnail" : "Use as cover (gallery thumbnail)"}
                      disabled={index === 0 || !!busy}
                      onClick={() => makeCover(index)}
                    >
                      <Star className={index === 0 ? "fill-current" : undefined} />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Move earlier" disabled={index === 0 || !!busy} onClick={() => move(index, -1)}>
                      <ArrowUp />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Move later" disabled={index === images.length - 1 || !!busy} onClick={() => move(index, 1)}>
                      <ArrowDown />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Replace screenshot"
                      disabled={!!busy}
                      onClick={() => {
                        replaceTarget.current = img.id;
                        replaceInput.current?.click();
                      }}
                    >
                      {busy === `replace-${img.id}` ? <Loader2 className="animate-spin" /> : <Replace />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete screenshot"
                      disabled={!!busy || images.length <= 1}
                      title={images.length <= 1 ? "A reference needs at least one screenshot. Replace it instead." : undefined}
                      onClick={() => {
                        if (window.confirm("Delete this screenshot permanently?")) {
                          void run(`del-${img.id}`, () => api(`/api/app/images/${img.id}`, { method: "DELETE" }), "Screenshot deleted");
                        }
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["viewport", "Viewport", VIEWPORTS, LABELS.viewport],
                      ["theme", "Theme", CAPTURED_THEMES, LABELS.capturedTheme],
                      ["screenshotType", "Type", SCREENSHOT_TYPES, LABELS.screenshotType],
                    ] as const
                  ).map(([key, label, options, labels]) => (
                    <label key={key} className="flex min-w-0 flex-col gap-1">
                      <span className="text-micro text-subtle-foreground">{label}</span>
                      <Select
                        value={img[key]}
                        onValueChange={(v) => void run(`meta-${img.id}`, () => api(`/api/app/images/${img.id}`, { method: "PATCH", json: { [key]: v } }), "Screenshot updated")}
                      >
                        <SelectTrigger className="h-8 w-full gap-1 px-2 text-meta" aria-label={label}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {options.map((o) => (
                            <SelectItem key={o} value={o}>
                              {(labels as Record<string, string>)[o]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                  ))}
                </div>
                <Input
                  defaultValue={img.label ?? ""}
                  placeholder="Label (optional)"
                  aria-label="Screenshot label"
                  className="h-8 text-meta"
                  maxLength={120}
                  onBlur={(e) => {
                    const label = e.target.value.trim() || null;
                    if (label !== img.label) void run(`label-${img.id}`, () => api(`/api/app/images/${img.id}`, { method: "PATCH", json: { label } }), "Label saved");
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
        {uploading.length > 0 ? (
          <div className="rounded-xl border bg-card p-4 text-meta" aria-live="polite">
            {uploading.map((u) => (
              <div key={u.name} className="flex items-center gap-3 py-1">
                <Loader2 className="size-4 animate-spin" />
                <span className="flex-1 truncate">{u.name}</span>
                <span className="tabular-nums text-subtle-foreground">{Math.round(u.progress * 100)}%</span>
              </div>
            ))}
          </div>
        ) : (
          <DropZone compact onFiles={addFiles} label="Attach more screenshots or videos" />
        )}
        <input
          ref={replaceInput}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose replacement screenshot"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            const target = replaceTarget.current;
            if (!file || !target) return;
            await run(
              `replace-${target}`,
              async () => {
                const res = await uploadFile(file, () => undefined);
                await api(`/api/app/images/${target}`, { method: "PUT", json: { uploadId: res.uploadId } });
              },
              "Screenshot replaced",
            );
          }}
        />
      </div>
    </section>
  );
}

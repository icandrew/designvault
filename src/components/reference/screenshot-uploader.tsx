"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { readClipboardImages } from "@/lib/clipboard";
import { AlertTriangle, ArrowDown, ArrowUp, ClipboardPaste, Film, ImageUp, Loader2, RefreshCw, Replace, Star, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBytes } from "@/lib/api-client";
import { CAPTURED_THEMES, LABELS, SCREENSHOT_TYPES, VIEWPORTS } from "@/lib/domain";
import { ACCEPT_MEDIA, formatDuration } from "@/lib/media";
import { cn } from "@/lib/utils";
import type { StagedImage } from "./use-staged-images";

export function DropZone({ onFiles, compact, label }: { onFiles: (files: File[]) => void; compact?: boolean; label?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const files = [...e.dataTransfer.files];
        if (files.length) onFiles(files);
      }}
      className={cn(
        "relative flex flex-col items-center justify-center rounded-xl border border-dashed text-center transition-colors duration-150",
        compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-12",
        dragging ? "border-highlight bg-highlight-soft" : "border-border-strong bg-card hover:bg-accent/40",
      )}
    >
      <div className="grid size-10 place-items-center rounded-lg border bg-background text-muted-foreground">
        <ImageUp className="size-5" />
      </div>
      <div>
        <p className="text-body font-medium">{label ?? "Drop screenshots or videos here"}</p>
        <p className="mt-0.5 text-meta text-muted-foreground">
          PNG, JPEG, WebP (25 MB) or MP4 video (200 MB) · press <kbd className="rounded border bg-background px-1 font-mono text-micro">Ctrl</kbd>+
          <kbd className="rounded border bg-background px-1 font-mono text-micro">V</kbd> to paste a copied image
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <Upload /> Choose files
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={async () => {
            const { files, error } = await readClipboardImages();
            if (files.length) onFiles(files);
            else if (error) toast.error(error);
          }}
        >
          <ClipboardPaste /> Paste image
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_MEDIA}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose screenshot files or videos"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function MetaSelect<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-micro text-subtle-foreground">{label}</span>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger className="h-8 w-full gap-1 px-2 text-meta" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {labels[o]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

export function StagedImageList({
  images,
  onRemove,
  onReplace,
  onRetry,
  onMove,
  onMeta,
  onMakeCover,
}: {
  images: StagedImage[];
  onMakeCover: (key: string) => void;
  onRemove: (key: string) => void;
  onReplace: (key: string, file: File) => void;
  onRetry: (key: string) => void;
  onMove: (key: string, dir: -1 | 1) => void;
  onMeta: (key: string, meta: Partial<StagedImage["meta"]>) => void;
}) {
  const replaceInput = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<string | null>(null);
  if (!images.length) return null;
  return (
    <>
      <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,380px),1fr))]" aria-label="Screenshots to save">
        {images.map((img, index) => (
          <li key={img.key} className="flex gap-3 rounded-xl border bg-card p-3">
            <div className="dv-canvas relative h-36 w-20 shrink-0 overflow-hidden rounded-md ring-1 ring-border sm:w-24">
              {img.mediaType === "video" ? (
                <video
                  src={img.previewUrl}
                  muted
                  loop
                  autoPlay
                  playsInline
                  aria-label={`Preview of ${img.name}`}
                  className="h-full w-full object-cover object-top"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- local preview
                <img src={img.previewUrl} alt={`Preview of ${img.name}`} className="h-full w-full object-cover object-top" />
              )}
              {img.mediaType === "video" && (
                <span className="absolute top-1 right-1 flex items-center gap-1 rounded bg-background/90 px-1.5 py-0.5 text-micro font-medium">
                  <Film className="size-3" /> {formatDuration(img.durationMs) || "Video"}
                </span>
              )}
              {img.status === "uploading" && (
                <div className="absolute inset-0 grid place-items-center bg-background/60 backdrop-blur-[1px]">
                  <Loader2 className="size-5 animate-spin text-foreground" />
                </div>
              )}
              {index === 0 && (
                <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-background/90 px-1.5 py-0.5 text-micro font-medium">
                  <Star className="size-3 fill-current" /> Cover
                </span>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-meta font-medium" title={img.name}>
                    {img.name}
                  </p>
                  <p className="text-micro text-subtle-foreground" aria-live="polite">
                    {img.status === "uploading" && `Uploading… ${Math.round(img.progress * 100)}%`}
                    {img.status === "uploading" && img.mediaType === "video" && img.progress === 0 && " (reading video)"}
                    {img.status === "ready" && img.width && `${img.mediaType === "video" ? "Video · " : ""}${img.width} × ${img.height}${img.durationMs ? ` · ${formatDuration(img.durationMs)}` : ""} · ${formatBytes(img.bytes ?? 0)}${img.source === "capture" ? " · captured" : ""}`}
                    {img.status === "error" && <span className="text-destructive">{img.error}</span>}
                  </p>
                </div>
                <div className="flex shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={index === 0 ? "This is the cover" : `Use ${img.name} as cover`}
                    title={index === 0 ? "Cover — shown as the gallery thumbnail" : "Use as cover (gallery thumbnail)"}
                    disabled={index === 0}
                    onClick={() => onMakeCover(img.key)}
                  >
                    <Star className={cn(index === 0 && "fill-current")} />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Move earlier" disabled={index === 0} onClick={() => onMove(img.key, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Move later" disabled={index === images.length - 1} onClick={() => onMove(img.key, 1)}>
                    <ArrowDown />
                  </Button>
                  {img.status === "error" && img.file && (
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Retry upload" onClick={() => onRetry(img.key)}>
                      <RefreshCw />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Replace screenshot"
                    onClick={() => {
                      setReplacing(img.key);
                      replaceInput.current?.click();
                    }}
                  >
                    <Replace />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove screenshot" onClick={() => onRemove(img.key)}>
                    <Trash2 />
                  </Button>
                </div>
              </div>
              {img.status === "uploading" && (
                <div className="h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(img.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${img.name}`}>
                  <div className="h-full bg-foreground transition-[width] duration-150" style={{ width: `${img.progress * 100}%` }} />
                </div>
              )}
              {img.duplicates.length > 0 && (
                <div className="flex gap-2 rounded-md bg-warning/10 px-2 py-1.5 text-micro text-foreground">
                  <AlertTriangle className="mt-px size-3.5 shrink-0 text-warning" />
                  <span>
                    {img.duplicates[0].kind === "exact" ? "Already in your vault:" : "Looks similar to:"}{" "}
                    <Link href={`/references/${img.duplicates[0].referenceId}`} target="_blank" className="underline underline-offset-2">
                      {img.duplicates[0].title}
                    </Link>
                  </span>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                <MetaSelect label="Viewport" value={img.meta.viewport} options={VIEWPORTS} labels={LABELS.viewport} onChange={(v) => onMeta(img.key, { viewport: v })} />
                <MetaSelect label="Theme" value={img.meta.theme} options={CAPTURED_THEMES} labels={LABELS.capturedTheme} onChange={(v) => onMeta(img.key, { theme: v })} />
                <MetaSelect label="Type" value={img.meta.screenshotType} options={SCREENSHOT_TYPES} labels={LABELS.screenshotType} onChange={(v) => onMeta(img.key, { screenshotType: v })} />
              </div>
              <Input
                value={img.meta.label ?? ""}
                onChange={(e) => onMeta(img.key, { label: e.target.value || null })}
                placeholder="Label (optional), e.g. “Mobile menu open”"
                aria-label={`Label for ${img.name}`}
                className="h-8 text-meta"
                maxLength={120}
              />
            </div>
          </li>
        ))}
      </ul>
      <input
        ref={replaceInput}
        type="file"
        accept={ACCEPT_MEDIA}
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose replacement screenshot or video"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && replacing) onReplace(replacing, file);
          setReplacing(null);
          e.target.value = "";
        }}
      />
    </>
  );
}

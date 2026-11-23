"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Download, Maximize2, Minimize2, MoveHorizontal, Scan, ZoomIn, ZoomOut } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LABELS } from "@/lib/domain";
import type { ImageDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ScreenshotImage } from "./screenshot-image";

/**
 * Continuous, editorial presentation of every screenshot in a reference: all
 * images stacked vertically in the page's own scroll (no carousel, no inner
 * scrollbar), with a small floating toolbar.
 *
 * - Fit width (default): each image fills the column but is never upscaled
 *   beyond its real size, so narrow mobile captures stay sharp and centred.
 * - Zoom / original size apply to every image; wide results scroll sideways
 *   inside the gallery only.
 * - The image most in view is tracked for "Download" and the position counter.
 * - Shortcuts (when not typing): + / − zoom, 0 fit width, 1 original size, F fullscreen.
 */
type Mode = { kind: "width" } | { kind: "zoom"; scale: number };
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2];

function ToolButton({
  label,
  onClick,
  children,
  disabled,
  pressed,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={pressed}
          className={cn(
            "grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40 sm:size-8",
            pressed && "bg-accent text-foreground",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function describe(img: ImageDTO, title: string, index: number) {
  const kind = img.mediaType === "video" ? "video" : "screenshot";
  return `${title} — ${img.label ?? `${kind} ${index + 1}`} (${LABELS.viewport[img.viewport]}, ${LABELS.capturedTheme[img.theme]} theme)`;
}

/** One item in the stack. Memoised so scrolling (active-image tracking) doesn't re-render images. */
const GalleryItem = memo(function GalleryItem({
  img,
  index,
  title,
  fixedWidth,
  shownWidth,
}: {
  img: ImageDTO;
  index: number;
  title: string;
  /** Pixel width when zoomed; null = fit to width (pure CSS, correct from the first paint). */
  fixedWidth: number | null;
  /** Approximate on-screen width, used to pick preview vs original. */
  shownWidth: number;
}) {
  // Load the original only when shown larger than the preview (zoomed in).
  const useOriginal = shownWidth > img.previewWidth * 1.02;
  const eager = index === 0;
  return (
    <figure
      data-index={index}
      className="relative mx-auto shrink-0"
      style={
        fixedWidth === null
          ? { width: "100%", maxWidth: img.width, aspectRatio: `${img.width} / ${img.height}` }
          : { width: fixedWidth, maxWidth: "none", aspectRatio: `${img.width} / ${img.height}` }
      }
    >
      {img.mediaType === "video" ? (
        <video
          src={img.urls.original}
          poster={img.urls.preview}
          controls
          muted
          loop
          playsInline
          autoPlay={eager}
          preload={eager ? "auto" : "metadata"}
          aria-label={describe(img, title, index)}
          className="block h-full w-full bg-muted/40 object-contain"
        />
      ) : (
        <div className="h-full w-full bg-muted/40">
          <ScreenshotImage
            key={useOriginal ? "o" : "p"}
            src={useOriginal ? img.urls.original : img.urls.preview}
            alt={describe(img, title, index)}
            width={img.width}
            height={img.height}
            fit="contain"
            eager={eager}
            className="block select-none"
          />
        </div>
      )}
      {img.label && <figcaption className="sr-only">{img.label}</figcaption>}
    </figure>
  );
});

export function ReferenceGallery({ images, title }: { images: ImageDTO[]; title: string }) {
  const [mode, setMode] = useState<Mode>({ kind: "width" });
  const [columnWidth, setColumnWidth] = useState(0);
  const [active, setActive] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);

  // Column width drives fit-to-width sizing (and stays correct across resizes).
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setColumnWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Track which image is most in view (for Download and the counter).
  useEffect(() => {
    const stack = stackRef.current;
    if (!stack || images.length < 2) return;
    const ratios = new Map<number, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) ratios.set(Number((e.target as HTMLElement).dataset.index), e.intersectionRatio * e.boundingClientRect.height);
        let best = 0;
        let bestVisible = -1;
        for (const [i, visible] of ratios) {
          if (visible > bestVisible) {
            best = i;
            bestVisible = visible;
          }
        }
        setActive(best);
      },
      { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
    );
    stack.querySelectorAll("figure[data-index]").forEach((f) => io.observe(f));
    return () => io.disconnect();
  }, [images.length]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const widthFor = useCallback(
    (img: ImageDTO) => {
      if (mode.kind === "width") return columnWidth ? Math.min(columnWidth, img.width) : 0;
      return Math.round(img.width * mode.scale);
    },
    [columnWidth, mode],
  );

  const current = images[Math.min(active, images.length - 1)];
  // Zoom steps are relative to the active image's real size.
  const scale = current ? widthFor(current) / current.width : 1;

  const zoom = useCallback(
    (dir: 1 | -1) => {
      const next = dir > 0 ? ZOOM_STEPS.find((s) => s > scale + 0.01) : [...ZOOM_STEPS].reverse().find((s) => s < scale - 0.01);
      if (next) setMode({ kind: "zoom", scale: next });
    },
    [scale],
  );

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await rootRef.current?.requestFullscreen().catch(() => undefined);
  }, []);

  const download = useCallback(() => {
    if (!current) return;
    const a = document.createElement("a");
    a.href = `${current.urls.original}?download=1`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [current]);

  // Keyboard shortcuts, unless the user is typing or using a menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true], [role=menu], [role=dialog]")) return;
      if (e.key === "+" || e.key === "=") zoom(1);
      else if (e.key === "-") zoom(-1);
      else if (e.key === "0") setMode({ kind: "width" });
      else if (e.key === "1") setMode({ kind: "zoom", scale: 1 });
      else if (e.key.toLowerCase() === "f") void toggleFullscreen();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom, toggleFullscreen]);

  if (!current) {
    return <div className="grid h-80 place-items-center text-meta text-muted-foreground">No screenshots</div>;
  }

  const zoomed = mode.kind === "zoom";
  const kind = current.mediaType === "video" ? "video" : "image";

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label="Screenshots"
      className={cn("relative w-full min-w-0", fullscreen && "overflow-y-auto bg-background p-4 sm:p-8")}
    >
      {/* Floating toolbar: takes no layout space and stays in view while scrolling. */}
      <div className="pointer-events-none sticky top-[4.25rem] z-20 flex h-0 justify-end">
        <div
          role="toolbar"
          aria-label="Viewing controls"
          className="pointer-events-auto mt-3 mr-3 flex items-center gap-0.5 rounded-full bg-background/95 p-1 shadow-md ring-1 ring-border backdrop-blur-md supports-[backdrop-filter]:bg-background/85"
        >
          {images.length > 1 && (
            <span className="hidden px-2 text-micro tabular-nums text-subtle-foreground sm:inline" aria-live="polite">
              {active + 1} / {images.length}
            </span>
          )}
          <ToolButton label="Zoom out (−)" onClick={() => zoom(-1)} disabled={scale <= ZOOM_STEPS[0] + 0.01}>
            <ZoomOut className="size-4" />
          </ToolButton>
          <span className="hidden w-10 text-center text-micro tabular-nums text-muted-foreground sm:inline">{Math.round(scale * 100)}%</span>
          <ToolButton label="Zoom in (+)" onClick={() => zoom(1)} disabled={scale >= ZOOM_STEPS[ZOOM_STEPS.length - 1] - 0.01}>
            <ZoomIn className="size-4" />
          </ToolButton>
          <ToolButton label="Fit to width (0)" onClick={() => setMode({ kind: "width" })} pressed={mode.kind === "width"}>
            <MoveHorizontal className="size-4" />
          </ToolButton>
          <ToolButton label="Original size (1)" onClick={() => setMode({ kind: "zoom", scale: 1 })} pressed={zoomed && mode.scale === 1}>
            <Scan className="size-4" />
          </ToolButton>
          <ToolButton label={fullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"} onClick={toggleFullscreen}>
            {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </ToolButton>
          <ToolButton label={images.length > 1 ? `Download ${kind} ${active + 1}` : `Download original ${kind}`} onClick={download}>
            <Download className="size-4" />
          </ToolButton>
        </div>
      </div>

      {/* The stack itself uses the page scroll; only zoomed-in images scroll sideways. */}
      <div ref={stackRef} className={cn("flex flex-col gap-1", zoomed && "scrollbar-thin overflow-x-auto")}>
        {images.map((img, i) => (
          <GalleryItem
            key={img.id}
            img={img}
            index={i}
            title={title}
            fixedWidth={mode.kind === "zoom" ? widthFor(img) : null}
            shownWidth={widthFor(img)}
          />
        ))}
      </div>
    </div>
  );
}

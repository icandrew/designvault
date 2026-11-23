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
            "relative grid size-10 place-items-center rounded-full text-white/80 transition-[background-color,color,transform] duration-200 hover:bg-white/15 hover:text-white active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/70 disabled:pointer-events-none disabled:opacity-35 sm:size-9",
            pressed && "bg-white/20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]",
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
  // Toolbar visibility. Mouse/trackpad: shown while hovering the images (or
  // focusing a control). Phones/touch: hidden while scrolling down, shown on scroll up.
  const [touchMode, setTouchMode] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [scrolledUp, setScrolledUp] = useState(true);
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
    const mq = window.matchMedia("(hover: none), (pointer: coarse), (max-width: 767px)");
    const update = () => setTouchMode(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!touchMode) return;
    let last = window.scrollY;
    // Cheap per-event check; React skips re-rendering when the value doesn't change.
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 80) setScrolledUp(true);
      // Small dead zone so tiny jitters (e.g. iOS bounce) don't flicker the toolbar.
      else if (y < last - 6) setScrolledUp(true);
      else if (y > last + 6) setScrolledUp(false);
      else return;
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [touchMode]);

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
  const toolbarVisible = fullscreen || focused || (touchMode ? scrolledUp : hovered);
  const kind = current.mediaType === "video" ? "video" : "image";

  const toolbar = (
    <div
      role="toolbar"
      aria-label="Viewing controls"
      data-visible={toolbarVisible || undefined}
      className={cn(
        // Frosted glass: dark translucent tint, strong blur, hairline highlight and soft depth.
        "relative flex items-center gap-0.5 overflow-hidden rounded-full p-1.5 text-white",
      touchMode ? "mb-0" : "mt-3 mr-3",
        "bg-neutral-950/45 shadow-[0_10px_40px_-8px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(255,255,255,0.05)] ring-1 ring-white/15 backdrop-blur-2xl backdrop-saturate-150",
        "before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-b before:from-white/18 before:via-white/5 before:to-transparent",
        "transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        toolbarVisible
        ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
        : cn("pointer-events-none scale-95 opacity-0", touchMode ? "translate-y-4" : "-translate-y-2"),
      )}
    >
      {images.length > 1 && !touchMode && (
        <span className="relative px-2.5 text-micro font-medium tabular-nums text-white/70" aria-live="polite">
          {active + 1} / {images.length}
        </span>
      )}
      <ToolButton label="Zoom out (−)" onClick={() => zoom(-1)} disabled={scale <= ZOOM_STEPS[0] + 0.01}>
        <ZoomOut className="size-4" />
      </ToolButton>
      {!touchMode && <span className="relative w-10 text-center text-micro font-medium tabular-nums text-white/75">{Math.round(scale * 100)}%</span>}
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
  );
  return (
    <div
      ref={rootRef}
      role="region"
      aria-label="Screenshots"
      className={cn("relative w-full min-w-0", fullscreen && "overflow-y-auto bg-background p-4 sm:p-8")}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      {/* Desktop: floats at the top-right of the images; takes no layout space and stays in view while scrolling. */}
      {!touchMode && (
        <div className="pointer-events-none sticky top-[4.25rem] z-20 flex h-0 items-start justify-end">{toolbar}</div>
      )}

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

      {/* Mobile: icon-only bar, centred and stuck to the bottom of the screen while the images are in view. */}
      {touchMode && (
        <div className="pointer-events-none sticky bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 flex h-0 items-end justify-center">{toolbar}</div>
      )}
    </div>
  );
}

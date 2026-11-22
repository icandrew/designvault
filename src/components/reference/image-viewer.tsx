"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Play, ExternalLink, Expand, Maximize2, Minimize2, MoveHorizontal, ZoomIn, ZoomOut } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LABELS } from "@/lib/domain";
import type { ImageDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/media";
import { ScreenshotImage } from "./screenshot-image";

type Mode = { kind: "width" } | { kind: "screen" } | { kind: "zoom"; scale: number };
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2];

function ToolButton({ label, onClick, children, disabled, pressed }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean; pressed?: boolean }) {
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
            "grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
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

/**
 * Screenshot viewer: fit-to-width (default, never upscales), fit-to-screen,
 * explicit zoom levels, drag-to-pan, fullscreen, variant navigation.
 * Keyboard: ←/→ switch screenshots, +/− zoom, 0 fit width, F fullscreen.
 */
export function ImageViewer({ images, title }: { images: ImageDTO[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<Mode>({ kind: "width" });
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const img = images[Math.min(index, images.length - 1)];

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const displayWidth = !img || box.w === 0
    ? 0
    : mode.kind === "width"
      ? Math.min(box.w, img.width)
      : mode.kind === "screen"
        ? Math.min(box.w, img.width, (box.h * img.width) / img.height)
        : img.width * mode.scale;
  const effectiveScale = img && displayWidth ? displayWidth / img.width : 1;
  const useOriginal = img ? displayWidth > img.previewWidth * 1.02 : false;
  const src = img ? (useOriginal ? img.urls.original : img.urls.preview) : "";

  const zoom = useCallback(
    (dir: 1 | -1) => {
      const current = effectiveScale;
      const next = dir > 0 ? ZOOM_STEPS.find((s) => s > current + 0.01) : [...ZOOM_STEPS].reverse().find((s) => s < current - 0.01);
      if (next) setMode({ kind: "zoom", scale: next });
    },
    [effectiveScale],
  );

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await rootRef.current?.requestFullscreen().catch(() => undefined);
  }, []);

  const select = (i: number) => {
    setIndex(i);
    stageRef.current?.scrollTo({ top: 0, left: 0 });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input,textarea,select")) return;
    if (e.key === "ArrowRight" && index < images.length - 1) select(index + 1);
    else if (e.key === "ArrowLeft" && index > 0) select(index - 1);
    else if (e.key === "+" || e.key === "=") zoom(1);
    else if (e.key === "-") zoom(-1);
    else if (e.key === "0") setMode({ kind: "width" });
    else if (e.key.toLowerCase() === "f") void toggleFullscreen();
    else return;
    e.preventDefault();
  };

  if (!img) {
    return <div className="dv-canvas grid h-80 place-items-center rounded-xl text-meta text-muted-foreground">No screenshots</div>;
  }

  const isVideo = img.mediaType === "video";
  const overflowing = displayWidth > box.w + 1 || (displayWidth * img.height) / img.width > box.h + 1;

  return (
    <div
      ref={rootRef}
      className={cn("flex flex-col overflow-hidden rounded-xl border bg-card", fullscreen && "h-screen rounded-none border-0")}
      onKeyDown={onKeyDown}
      role="region"
      aria-label="Screenshot viewer"
      tabIndex={0}
    >
      <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
        <ToolButton label="Previous screenshot (←)" onClick={() => select(index - 1)} disabled={index === 0}>
          <ChevronLeft className="size-4" />
        </ToolButton>
        <span className="min-w-12 text-center text-meta tabular-nums text-muted-foreground" aria-live="polite">
          {index + 1} / {images.length}
        </span>
        <ToolButton label="Next screenshot (→)" onClick={() => select(index + 1)} disabled={index === images.length - 1}>
          <ChevronRight className="size-4" />
        </ToolButton>
        <span className="mx-1 hidden truncate text-meta text-muted-foreground sm:inline">
          {img.label ? `${img.label} · ` : ""}
          {isVideo ? `Video ${formatDuration(img.durationMs)} · ` : ""}
          {LABELS.viewport[img.viewport]} · {LABELS.capturedTheme[img.theme]} · {img.width}×{img.height}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <ToolButton label="Zoom out (−)" onClick={() => zoom(-1)} disabled={effectiveScale <= ZOOM_STEPS[0] + 0.01}>
            <ZoomOut className="size-4" />
          </ToolButton>
          <span className="w-11 text-center text-meta tabular-nums text-muted-foreground">{Math.round(effectiveScale * 100)}%</span>
          <ToolButton label="Zoom in (+)" onClick={() => zoom(1)} disabled={effectiveScale >= ZOOM_STEPS[ZOOM_STEPS.length - 1] - 0.01}>
            <ZoomIn className="size-4" />
          </ToolButton>
          <ToolButton label="Fit width (0) — never upscales" onClick={() => setMode({ kind: "width" })} pressed={mode.kind === "width"}>
            <MoveHorizontal className="size-4" />
          </ToolButton>
          <ToolButton label="Fit to screen" onClick={() => setMode({ kind: "screen" })} pressed={mode.kind === "screen"}>
            <Expand className="size-4" />
          </ToolButton>
          <ToolButton label={fullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"} onClick={toggleFullscreen}>
            {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </ToolButton>
          <ToolButton label="Open original in new tab" onClick={() => window.open(img.urls.original, "_blank", "noopener")}>
            <ExternalLink className="size-4" />
          </ToolButton>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={`${img.urls.original}?download=1`}
                download
                aria-label="Download original"
                className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Download className="size-4" />
              </a>
            </TooltipTrigger>
            <TooltipContent>Download original</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div
        ref={stageRef}
        className={cn(
          "dv-canvas relative overflow-auto overscroll-contain",
          fullscreen ? "flex-1" : "h-[min(78dvh,1100px)] min-h-[320px]",
          overflowing && "cursor-grab active:cursor-grabbing",
        )}
        onPointerDown={(e) => {
          if (isVideo || !overflowing || e.button !== 0 || e.pointerType === "touch") return;
          const el = stageRef.current!;
          drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
          el.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const el = stageRef.current!;
          el.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
          el.scrollTop = drag.current.top - (e.clientY - drag.current.y);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {displayWidth > 0 && (
          <div className="mx-auto" style={{ width: displayWidth, minWidth: displayWidth }}>
            {isVideo ? (
              <video
                key={img.id}
                src={img.urls.original}
                poster={img.urls.preview}
                controls
                autoPlay
                muted
                loop
                playsInline
                aria-label={`${title} — ${img.label ?? `video ${index + 1}`} (${LABELS.viewport[img.viewport]}, ${LABELS.capturedTheme[img.theme]} theme)`}
                className="block h-auto w-full"
                style={{ aspectRatio: `${img.width} / ${img.height}` }}
              />
            ) : (
              <ScreenshotImage
                key={`${img.id}-${useOriginal ? "o" : "p"}`}
                src={src}
                alt={`${title} — ${img.label ?? `screenshot ${index + 1}`} (${LABELS.viewport[img.viewport]}, ${LABELS.capturedTheme[img.theme]} theme)`}
                width={img.width}
                height={img.height}
                fit="contain"
                eager
                className="block h-auto w-full select-none"
              />
            )}
          </div>
        )}
      </div>

      {images.length > 1 && (
        <div className="scrollbar-none flex gap-2 overflow-x-auto border-t p-2" role="tablist" aria-label="Screenshots">
          {images.map((im, i) => (
            <button
              key={im.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`${im.label ?? `${im.mediaType === "video" ? "Video" : "Screenshot"} ${i + 1}`}: ${LABELS.viewport[im.viewport]}, ${LABELS.capturedTheme[im.theme]}`}
              onClick={() => select(i)}
              className={cn(
                "group flex shrink-0 flex-col gap-1 rounded-md p-1 text-left transition-colors",
                i === index ? "bg-accent" : "hover:bg-accent/60",
              )}
            >
              <span className="dv-canvas relative block h-16 w-24 overflow-hidden rounded ring-1 ring-border">
                {/* eslint-disable-next-line @next/next/no-img-element -- stored thumbnail */}
                <img src={im.urls.thumb} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
                {im.mediaType === "video" && (
                  <span className="absolute inset-0 grid place-items-center">
                    <span className="grid size-6 place-items-center rounded-full bg-background/90 shadow-sm">
                      <Play className="size-3 fill-current" />
                    </span>
                  </span>
                )}
              </span>
              <span className="w-24 truncate text-micro text-muted-foreground">
                {LABELS.viewport[im.viewport]} · {LABELS.capturedTheme[im.theme]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

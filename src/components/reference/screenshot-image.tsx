"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Renders a stored screenshot with explicit dimensions (no layout shift) and a
 * designed fallback when the file is missing or corrupted.
 */
export function ScreenshotImage({
  src,
  alt,
  width,
  height,
  className,
  eager,
  fit = "cover",
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  eager?: boolean;
  fit?: "cover" | "contain";
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (failed) {
    return (
      <div className={cn("flex h-full w-full flex-col items-center justify-center gap-2 text-subtle-foreground", className)}>
        <ImageOff className="size-5" />
        <span className="text-micro">Image unavailable</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- stored screenshots are pre-optimized and access-controlled
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      decoding="async"
      draggable={false}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
      className={cn(
        "h-full w-full transition-opacity duration-300",
        fit === "cover" ? "object-cover object-top" : "object-contain",
        loaded ? "opacity-100" : "opacity-0",
        className,
      )}
      ref={(el) => {
        if (el?.complete && el.naturalWidth > 0 && !loaded) setLoaded(true);
      }}
    />
  );
}

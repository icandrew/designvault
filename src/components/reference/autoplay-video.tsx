"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Muted, looping video that plays only while it is on screen (saves CPU and
 * bandwidth with many videos in the gallery). With "reduce motion" enabled in
 * the OS, it shows the poster and plays only while hovered or focused.
 */
export function AutoplayVideo({
  src,
  poster,
  label,
  className,
  hoverTarget,
}: {
  src: string;
  poster: string;
  label: string;
  className?: string;
  /** Element whose hover/focus plays the video when reduced motion is on. */
  hoverTarget?: React.RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    let hovered = false;
    const sync = () => {
      const shouldPlay = visible && (!reduced.matches || hovered);
      if (shouldPlay) {
        video.play().catch(() => undefined);
      } else if (!video.paused) {
        video.pause();
      }
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting && entry.intersectionRatio >= 0.35;
        if (entry.isIntersecting) setInView(true);
        sync();
      },
      { threshold: [0, 0.35, 0.7] },
    );
    io.observe(video);
    const target = hoverTarget?.current ?? video;
    const enter = () => {
      hovered = true;
      sync();
    };
    const leave = () => {
      hovered = false;
      sync();
    };
    target.addEventListener("pointerenter", enter);
    target.addEventListener("pointerleave", leave);
    target.addEventListener("focusin", enter);
    target.addEventListener("focusout", leave);
    reduced.addEventListener("change", sync);
    // The source is attached lazily (after first becoming visible), so retry once data arrives.
    video.addEventListener("loadeddata", sync);
    video.addEventListener("canplay", sync);
    return () => {
      io.disconnect();
      video.removeEventListener("loadeddata", sync);
      video.removeEventListener("canplay", sync);
      target.removeEventListener("pointerenter", enter);
      target.removeEventListener("pointerleave", leave);
      target.removeEventListener("focusin", enter);
      target.removeEventListener("focusout", leave);
      reduced.removeEventListener("change", sync);
    };
  }, [hoverTarget]);

  if (failed) {
    // eslint-disable-next-line @next/next/no-img-element -- poster fallback when the video cannot play
    return <img src={poster} alt={label} className={cn("h-full w-full object-cover object-top", className)} />;
  }

  return (
    <video
      ref={ref}
      src={inView ? src : undefined}
      poster={poster}
      muted
      loop
      playsInline
      preload={inView ? "auto" : "none"}
      aria-label={label}
      disablePictureInPicture
      onError={() => setFailed(true)}
      className={cn("h-full w-full object-cover object-top", className)}
    />
  );
}

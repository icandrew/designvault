"use client";

import Link from "next/link";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { LABELS } from "@/lib/domain";
import type { ReferenceSummary } from "@/lib/types";
import { ScreenshotImage } from "./screenshot-image";

export function QuickPreviewDialog({
  reference,
  open,
  onOpenChange,
}: {
  reference: ReferenceSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const r = reference;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <div className="dv-canvas min-h-0 flex-1 overflow-y-auto">
          {r.cover?.mediaType === "video" ? (
            <video
              src={`/api/images/${r.cover.id}/original`}
              poster={`/api/images/${r.cover.id}/preview`}
              controls
              autoPlay
              muted
              loop
              playsInline
              aria-label={`Video of ${r.title}`}
              className="mx-auto block h-auto max-h-[78dvh] w-auto max-w-full"
            />
          ) : r.cover ? (
            <div className="mx-auto" style={{ maxWidth: Math.min(r.cover.width, 1600) }}>
              <ScreenshotImage
                src={`/api/images/${r.cover.id}/preview`}
                alt={`Screenshot of ${r.title}`}
                width={r.cover.width}
                height={r.cover.height}
                fit="contain"
                eager
                className="h-auto"
              />
            </div>
          ) : (
            <div className="grid h-64 place-items-center text-meta text-muted-foreground">No screenshot</div>
          )}
        </div>
        <div className="flex flex-col gap-3 border-t bg-popover p-4 sm:flex-row sm:items-center sm:gap-6">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-title">{r.title}</DialogTitle>
            <DialogDescription className="mt-0.5 truncate text-meta">
              {[r.siteName ?? r.sourceDomain, r.industry?.name, r.pageType?.name, LABELS.capturedTheme[r.capturedTheme] + " theme"]
                .filter(Boolean)
                .join(" · ")}
            </DialogDescription>
          </div>
          <div className="flex shrink-0 gap-2">
            {r.sourceUrl && (
              <Button variant="outline" asChild>
                <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink /> Source
                </a>
              </Button>
            )}
            <Button asChild>
              <Link href={`/references/${r.id}`}>
                Open reference <ArrowUpRight />
              </Link>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

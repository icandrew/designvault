"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Copy, Eye, FolderPlus, Layers, MoreHorizontal, Pencil, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddToCollectionDialog } from "@/components/reference/add-to-collection-dialog";
import { DeleteReferenceDialog } from "@/components/reference/delete-reference-dialog";
import { FavoriteButton } from "@/components/reference/favorite-button";
import { QuickPreviewDialog } from "@/components/reference/quick-preview-dialog";
import { AutoplayVideo } from "@/components/reference/autoplay-video";
import { ScreenshotImage } from "@/components/reference/screenshot-image";
import { formatDuration } from "@/lib/media";
import type { ReferenceSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ReferenceCard({
  reference: r,
  density,
  view,
  eager,
  className,
  style,
  footer,
  onRemoved,
}: {
  reference: ReferenceSummary;
  density: "comfortable" | "compact";
  view: "masonry" | "grid";
  eager?: boolean;
  className?: string;
  style?: React.CSSProperties;
  footer?: React.ReactNode;
  onRemoved?: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [collect, setCollect] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const meta = [r.siteName ?? r.sourceDomain, r.industry?.name].filter(Boolean).join(" · ");
  const titleId = `ref-title-${r.id}`;
  const cardRef = useRef<HTMLElement>(null);

  return (
    <article ref={cardRef} className={cn("dv-card group/card relative", className)} style={style} aria-labelledby={titleId}>
      <div
        className={cn(
          "dv-thumb dv-canvas relative overflow-hidden rounded-lg ring-1 ring-border transition-[box-shadow,ring-color] duration-200",
          "group-hover/card:ring-border-strong group-hover/card:shadow-[0_8px_28px_-12px_hsl(var(--shadow-color)/0.28)]",
          "group-focus-within/card:ring-2 group-focus-within/card:ring-ring",
          view === "grid" && "aspect-[4/3]",
        )}
      >
        {r.cover?.mediaType === "video" ? (
          <AutoplayVideo
            src={`/api/images/${r.cover.id}/original`}
            poster={`/api/images/${r.cover.id}/thumb`}
            label={`Video of ${r.title}`}
            hoverTarget={cardRef}
          />
        ) : r.cover ? (
          <ScreenshotImage
            src={`/api/images/${r.cover.id}/thumb`}
            alt={`Screenshot of ${r.title}`}
            width={r.cover.thumbWidth}
            height={r.cover.thumbHeight}
            eager={eager}
            className="transition-transform duration-500 ease-[var(--ease-out-soft)] group-hover/card:scale-[1.012]"
          />
        ) : (
          <div className="grid h-full place-items-center text-micro text-subtle-foreground">No screenshot</div>
        )}

        {/* Bottom fade hints that tall full-page captures continue beyond the card. */}
        {r.cover && r.cover.height / r.cover.width > 2.05 && view === "masonry" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/20 to-transparent" />
        )}

        <div className="pointer-events-none absolute top-2 left-2 flex gap-1">
          {r.isSample && (
            <span className="rounded bg-background/90 px-1.5 py-0.5 text-micro font-medium text-muted-foreground ring-1 ring-black/5 backdrop-blur dark:ring-white/10">
              Sample
            </span>
          )}
          {r.cover?.mediaType === "video" && (
            <span className="flex items-center gap-1 rounded bg-background/90 px-1.5 py-0.5 text-micro font-medium text-muted-foreground ring-1 ring-black/5 backdrop-blur dark:ring-white/10">
              <Play className="size-3 fill-current" /> {formatDuration(r.cover.durationMs) || "Video"}
            </span>
          )}
          {r.imageCount > 1 && (
            <span className="flex items-center gap-1 rounded bg-background/90 px-1.5 py-0.5 text-micro font-medium text-muted-foreground ring-1 ring-black/5 backdrop-blur dark:ring-white/10">
              <Layers className="size-3" /> {r.imageCount}
            </span>
          )}
        </div>

        <div className="dv-card-actions absolute top-2 right-2 z-10 flex gap-1.5" data-open={menuOpen || undefined}>
          <button
            type="button"
            onClick={() => setPreview(true)}
            aria-label={`Quick preview of ${r.title}`}
            className="grid size-8 place-items-center rounded-md bg-background/90 shadow-sm ring-1 ring-black/5 backdrop-blur transition-colors hover:bg-background dark:ring-white/10"
          >
            <Eye className="size-4" />
          </button>
          <FavoriteButton id={r.id} initial={r.isFavorite} />
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`More actions for ${r.title}`}
                className="grid size-8 place-items-center rounded-md bg-background/90 shadow-sm ring-1 ring-black/5 backdrop-blur transition-colors hover:bg-background dark:ring-white/10"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link href={`/references/${r.id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setCollect(true)}>
                <FolderPlus /> Add to collection
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={async () => {
                  await navigator.clipboard.writeText(r.id);
                  toast.success("Reference ID copied");
                }}
              >
                <Copy /> Copy reference ID
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className={cn("flex flex-col justify-center px-0.5", density === "compact" ? "h-9" : "h-14")}>
        <h3 id={titleId} className="truncate text-title font-medium text-foreground">
          <Link
            href={`/references/${r.id}`}
            className="outline-none after:absolute after:inset-0 after:z-0 after:rounded-lg after:content-['']"
          >
            {r.title}
          </Link>
        </h3>
        {density === "comfortable" && (
          <p className="truncate text-meta text-muted-foreground">
            {meta || "Unclassified"}
            {r.visualStyles.length > 0 && <span className="text-subtle-foreground"> · {r.visualStyles.map((s) => s.name).slice(0, 2).join(", ")}</span>}
          </p>
        )}
      </div>
      {footer}

      {preview && <QuickPreviewDialog reference={r} open={preview} onOpenChange={setPreview} />}
      {collect && <AddToCollectionDialog referenceId={r.id} title={r.title} open={collect} onOpenChange={setCollect} />}
      {confirmDelete && (
        <DeleteReferenceDialog
          referenceId={r.id}
          title={r.title}
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          onDeleted={() => onRemoved?.(r.id)}
        />
      )}
    </article>
  );
}

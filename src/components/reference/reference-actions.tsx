"use client";

import Link from "next/link";
import { useState } from "react";
import { ClipboardList, Copy, Download, FolderPlus, Hash, Link2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { referenceSummaryText } from "@/lib/summary";
import type { ReferenceDetail } from "@/lib/types";
import { AddToCollectionDialog } from "./add-to-collection-dialog";
import { DeleteReferenceDialog } from "./delete-reference-dialog";
import { FavoriteButton } from "./favorite-button";

async function copy(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast.error("Could not access the clipboard.");
  }
}

export function ReferenceActions({ reference: r }: { reference: ReferenceDetail }) {
  const [collect, setCollect] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cover = r.images[0];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FavoriteButton id={r.id} initial={r.isFavorite} variant="plain" />
      <Button variant="outline" onClick={() => setCollect(true)} className="h-9">
        <FolderPlus /> Collect
      </Button>
      <Button variant="outline" asChild className="h-9">
        <Link href={`/references/${r.id}/edit`}>
          <Pencil /> Edit
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="size-9" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem disabled={!r.sourceUrl} onSelect={() => r.sourceUrl && copy(r.sourceUrl, "Source URL copied")}>
            <Link2 /> Copy source URL
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => copy(r.id, "Reference ID copied")}>
            <Hash /> Copy reference ID
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => copy(referenceSummaryText(r, window.location.origin), "Structured summary copied")}>
            <ClipboardList /> Copy structured summary
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => copy(`${window.location.origin}/references/${r.id}`, "Link copied")}>
            <Copy /> Copy vault link
          </DropdownMenuItem>
          {cover && (
            <DropdownMenuItem asChild>
              <a href={`${cover.urls.original}?download=1`} download>
                <Download /> Download original image
              </a>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            <Trash2 /> Delete reference
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {collect && <AddToCollectionDialog referenceId={r.id} title={r.title} open={collect} onOpenChange={setCollect} />}
      {confirmDelete && (
        <DeleteReferenceDialog referenceId={r.id} title={r.title} open={confirmDelete} onOpenChange={setConfirmDelete} redirectTo="/" />
      )}
    </div>
  );
}

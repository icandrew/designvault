"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ImageIcon, Loader2, MoreHorizontal, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScreenshotImage } from "@/components/reference/screenshot-image";
import { api } from "@/lib/api-client";
import type { CollectionDetail, Page, ReferenceSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CollectionDialog } from "./collection-dialog";

export function CollectionHeaderActions({ collection }: { collection: CollectionDetail }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [add, setAdd] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return (
    <>
      <Button onClick={() => setAdd(true)} className="h-9">
        <Plus /> Add references
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="size-9" aria-label="Collection actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEdit(true)}>
            <Pencil /> Edit details
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
            <Trash2 /> Delete collection
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {edit && <CollectionDialog open={edit} onOpenChange={setEdit} initial={collection} />}
      {add && <AddReferencesDialog open={add} onOpenChange={setAdd} collectionId={collection.id} existing={collection.items.map((i) => i.reference.id)} />}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{collection.name}”?</AlertDialogTitle>
            <AlertDialogDescription>The collection and its selection notes are removed. The references themselves stay in your vault.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  await api(`/api/app/collections/${collection.id}`, { method: "DELETE" });
                  toast.success("Collection deleted");
                  router.push("/collections");
                  router.refresh();
                } catch (e) {
                  toast.error((e as Error).message);
                  setDeleting(false);
                }
              }}
            >
              {deleting && <Loader2 className="animate-spin" />} Delete collection
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function AddReferencesDialog({
  open,
  onOpenChange,
  collectionId,
  existing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  collectionId: string;
  existing: string[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ReferenceSummary[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      api<Page<ReferenceSummary>>(`/api/app/references?limit=60${q ? `&q=${encodeURIComponent(q)}` : ""}`)
        .then((p) => setResults(p.items))
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const add = async () => {
    setBusy(true);
    try {
      const { added } = await api<{ added: number }>(`/api/app/collections/${collectionId}/items`, {
        method: "POST",
        json: { referenceIds: [...selected] },
      });
      toast.success(`Added ${added} reference${added === 1 ? "" : "s"}`);
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88dvh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add references</DialogTitle>
          <DialogDescription>Select references to add. Images are shared, never duplicated.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your vault" className="pl-9" aria-label="Search references" autoFocus />
        </div>
        <div className="-mx-1 min-h-48 flex-1 overflow-y-auto px-1">
          {!results ? (
            <div className="flex items-center gap-2 py-6 text-meta text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : results.length === 0 ? (
            <p className="py-6 text-meta text-muted-foreground">No references found.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {results.map((r) => {
                const already = existing.includes(r.id);
                const on = selected.has(r.id);
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      disabled={already}
                      aria-pressed={on}
                      onClick={() => setSelected((s) => {
                        const n = new Set(s);
                        if (n.has(r.id)) n.delete(r.id);
                        else n.add(r.id);
                        return n;
                      })}
                      className="group w-full text-left disabled:opacity-50"
                    >
                      <div className={cn("dv-canvas aspect-[4/3] overflow-hidden rounded-md ring-1 ring-border transition", on && "ring-2 ring-highlight")}>
                        {r.cover && <ScreenshotImage src={`/api/images/${r.cover.id}/thumb`} alt="" width={r.cover.thumbWidth} height={r.cover.thumbHeight} />}
                      </div>
                      <p className="mt-1.5 truncate text-meta font-medium">{r.title}</p>
                      <p className="text-micro text-subtle-foreground">{already ? "Already in collection" : on ? "Selected" : r.industry?.name ?? ""}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <span className="text-meta text-muted-foreground">{selected.size} selected</span>
          <Button onClick={add} disabled={selected.size === 0 || busy}>
            {busy && <Loader2 className="animate-spin" />} Add to collection
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Ordered collection items with selection notes, reordering and removal. */
export function CollectionItems({ collection }: { collection: CollectionDetail }) {
  const router = useRouter();
  const [items, setItems] = useState(collection.items);
  const [lastProp, setLastProp] = useState(collection.items);
  if (collection.items !== lastProp) {
    setLastProp(collection.items);
    setItems(collection.items);
  }
  const isMoodboard = collection.kind === "moodboard";

  const persistOrder = async (next: typeof items) => {
    setItems(next);
    try {
      await api(`/api/app/collections/${collection.id}/items`, { method: "PATCH", json: { order: next.map((i) => i.reference.id) } });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setItems(collection.items);
    }
  };

  const move = (index: number, dir: -1 | 1) => {
    const next = [...items];
    [next[index], next[index + dir]] = [next[index + dir], next[index]];
    void persistOrder(next);
  };

  const remove = async (referenceId: string) => {
    const prev = items;
    setItems(items.filter((i) => i.reference.id !== referenceId));
    try {
      await api(`/api/app/collections/${collection.id}/items`, { method: "DELETE", json: { referenceId } });
      toast.success("Removed from collection");
      router.refresh();
    } catch (e) {
      setItems(prev);
      toast.error((e as Error).message);
    }
  };

  const setCover = async (imageId: string) => {
    try {
      await api(`/api/app/collections/${collection.id}`, {
        method: "PUT",
        json: { name: collection.name, description: collection.description, kind: collection.kind, brief: collection.brief, coverImageId: imageId },
      });
      toast.success("Cover updated");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <ol className="dv-grid">
      {items.map((item, index) => {
        const r = item.reference;
        return (
          <li key={r.id} className="group flex flex-col gap-2">
            <div className="relative">
              <Link href={`/references/${r.id}`} className="dv-canvas block aspect-[4/3] overflow-hidden rounded-lg ring-1 ring-border transition group-hover:ring-border-strong">
                {r.cover ? (
                  <ScreenshotImage src={`/api/images/${r.cover.id}/thumb`} alt={`Screenshot of ${r.title}`} width={r.cover.thumbWidth} height={r.cover.thumbHeight} />
                ) : (
                  <span className="grid h-full place-items-center text-micro text-subtle-foreground">No screenshot</span>
                )}
              </Link>
              <span className="absolute top-2 left-2 rounded bg-background/90 px-1.5 py-0.5 text-micro font-medium tabular-nums">{index + 1}</span>
              <div className="dv-card-actions absolute top-2 right-2 flex gap-1 opacity-100">
                <Button variant="secondary" size="icon-sm" aria-label="Move earlier" disabled={index === 0} onClick={() => move(index, -1)} className="bg-background/90">
                  <ArrowUp />
                </Button>
                <Button variant="secondary" size="icon-sm" aria-label="Move later" disabled={index === items.length - 1} onClick={() => move(index, 1)} className="bg-background/90">
                  <ArrowDown />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="icon-sm" aria-label={`More actions for ${r.title}`} className="bg-background/90">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {r.cover && (
                      <DropdownMenuItem onSelect={() => setCover(r.cover!.id)}>
                        <ImageIcon /> Use as collection cover
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem variant="destructive" onSelect={() => remove(r.id)}>
                      <X /> Remove from collection
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-title font-medium">
                <Link href={`/references/${r.id}`} className="hover:underline">
                  {r.title}
                </Link>
              </h3>
              <p className="truncate text-meta text-muted-foreground">{[r.siteName ?? r.sourceDomain, r.industry?.name].filter(Boolean).join(" · ")}</p>
            </div>
            <NoteEditor collectionId={collection.id} referenceId={r.id} initial={item.note} label={isMoodboard ? "Why this reference?" : "Note"} />
          </li>
        );
      })}
    </ol>
  );
}

function NoteEditor({ collectionId, referenceId, initial, label }: { collectionId: string; referenceId: string; initial: string | null; label: string }) {
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if ((initial ?? "") === value.trim()) return;
    setSaving(true);
    try {
      await api(`/api/app/collections/${collectionId}/items`, { method: "PATCH", json: { referenceId, note: value.trim() || null } });
      toast.success("Note saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-micro text-subtle-foreground">
        {label} {saving && <Loader2 className="size-3 animate-spin" />}
      </span>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        rows={2}
        maxLength={4000}
        placeholder="Explain what this reference contributes…"
        className="min-h-14 resize-y text-meta"
      />
    </label>
  );
}

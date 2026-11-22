"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export interface CollectionDraft {
  id?: string;
  name: string;
  description: string | null;
  kind: "collection" | "moodboard";
  brief: string | null;
  coverImageId?: string | null;
}

export function CollectionDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: CollectionDraft;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<CollectionDraft>(initial ?? { name: "", description: "", kind: "collection", brief: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = Boolean(initial?.id);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return setError("A name is required.");
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await api(`/api/app/collections/${initial!.id}`, { method: "PUT", json: draft });
        toast.success("Collection updated");
        router.refresh();
      } else {
        const { id } = await api<{ id: string }>("/api/app/collections", { method: "POST", json: draft });
        toast.success(`Created ${draft.name}`);
        router.push(`/collections/${id}`);
        router.refresh();
      }
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit collection" : "New collection"}</DialogTitle>
            <DialogDescription>Group references for a project, research topic or visual direction.</DialogDescription>
          </DialogHeader>
          <div role="radiogroup" aria-label="Collection type" className="grid grid-cols-2 gap-2">
            {(
              [
                ["collection", "Collection", "A curated group of references"],
                ["moodboard", "Project moodboard", "References for a website brief, with notes on why each was chosen"],
              ] as const
            ).map(([kind, label, hint]) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={draft.kind === kind}
                onClick={() => setDraft((d) => ({ ...d, kind }))}
                className={cn("rounded-lg border p-3 text-left transition-colors", draft.kind === kind ? "border-foreground bg-accent" : "hover:bg-accent/50")}
              >
                <span className="block text-meta font-medium">{label}</span>
                <span className="mt-0.5 block text-micro text-muted-foreground">{hint}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="col-name">Name</Label>
            <Input id="col-name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="e.g. Premium e-commerce" maxLength={120} autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="col-desc">
              Description <span className="font-normal text-subtle-foreground">Optional</span>
            </Label>
            <Textarea id="col-desc" value={draft.description ?? ""} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} rows={2} />
          </div>
          {draft.kind === "moodboard" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="col-brief">Website brief</Label>
              <Textarea
                id="col-brief"
                value={draft.brief ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, brief: e.target.value }))}
                rows={4}
                placeholder="e.g. A premium website for a pet care brand selling conditioning shampoo for dogs and cats."
              />
              <p className="text-micro text-subtle-foreground">Claude Code can read this brief together with your selection notes.</p>
            </div>
          )}
          {error && (
            <p className="text-meta text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewCollectionButton({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "outline" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)} className="h-9">
        {children}
      </Button>
      {open && <CollectionDialog open={open} onOpenChange={setOpen} />}
    </>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, FolderClosed, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import type { ReferenceDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Option {
  id: string;
  name: string;
  kind: "collection" | "moodboard";
}

export function AddToCollectionDialog({
  referenceId,
  title,
  open,
  onOpenChange,
}: {
  referenceId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [options, setOptions] = useState<Option[] | null>(null);
  const [member, setMember] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      api<Option[]>("/api/app/collections"),
      api<ReferenceDetail>(`/api/app/references/${referenceId}`),
    ])
      .then(([opts, ref]) => {
        if (cancelled) return;
        setOptions(opts);
        setMember(new Set(ref.collections.map((c) => c.id)));
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [open, referenceId]);

  const toggle = async (opt: Option) => {
    setBusy(opt.id);
    const isMember = member.has(opt.id);
    try {
      if (isMember) {
        await api(`/api/app/collections/${opt.id}/items`, { method: "DELETE", json: { referenceId } });
        member.delete(opt.id);
        toast.success(`Removed from ${opt.name}`);
      } else {
        await api(`/api/app/collections/${opt.id}/items`, { method: "POST", json: { referenceIds: [referenceId] } });
        member.add(opt.id);
        toast.success(`Added to ${opt.name}`);
      }
      setMember(new Set(member));
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy("new");
    try {
      const { id } = await api<{ id: string }>("/api/app/collections", {
        method: "POST",
        json: { name: newName.trim(), referenceIds: [referenceId] },
      });
      setOptions((o) => [{ id, name: newName.trim(), kind: "collection" }, ...(o ?? [])]);
      setMember((m) => new Set(m).add(id));
      toast.success(`Created ${newName.trim()}`);
      setNewName("");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to collection</DialogTitle>
          <DialogDescription className="truncate">{title}</DialogDescription>
        </DialogHeader>
        <form onSubmit={create} className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New collection name"
            aria-label="New collection name"
            maxLength={120}
          />
          <Button type="submit" variant="outline" disabled={!newName.trim() || busy === "new"}>
            {busy === "new" ? <Loader2 className="animate-spin" /> : <Plus />}
            Create
          </Button>
        </form>
        <div className="-mx-1 max-h-72 overflow-y-auto">
          {error && <p className="px-1 text-meta text-destructive">{error}</p>}
          {!options && !error && (
            <div className="flex items-center gap-2 px-1 py-3 text-meta text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading collections…
            </div>
          )}
          {options?.length === 0 && (
            <p className="px-1 py-3 text-meta text-muted-foreground">No collections yet. Create your first one above.</p>
          )}
          <ul className="flex flex-col">
            {options?.map((opt) => {
              const checked = member.has(opt.id);
              return (
                <li key={opt.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    disabled={busy === opt.id}
                    onClick={() => toggle(opt)}
                    className="flex h-10 w-full items-center gap-3 rounded-md px-2 text-left text-body hover:bg-accent disabled:opacity-60"
                  >
                    <FolderClosed className="size-4 text-subtle-foreground" />
                    <span className="flex-1 truncate">{opt.name}</span>
                    {opt.kind === "moodboard" && <span className="text-micro text-subtle-foreground">Moodboard</span>}
                    <span
                      className={cn(
                        "grid size-5 place-items-center rounded border transition-colors",
                        checked ? "border-primary bg-primary text-primary-foreground" : "border-border-strong",
                      )}
                    >
                      {busy === opt.id ? <Loader2 className="size-3 animate-spin" /> : checked && <Check className="size-3.5" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

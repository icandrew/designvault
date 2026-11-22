"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TERM_KIND_LABELS, TERM_KINDS, type TermKind } from "@/lib/domain";
import { api } from "@/lib/api-client";
import type { TermOption } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TaxonomyManager({ terms }: { terms: TermOption[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<TermKind>("industry");
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const list = terms.filter((t) => t.kind === kind && t.name.toLowerCase().includes(filter.toLowerCase()));

  const run = async (key: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(success);
      router.refresh();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Classification" className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1">
        {TERM_KINDS.map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={kind === k}
            onClick={() => {
              setKind(k);
              setEditing(null);
            }}
            className={cn(
              "h-8 shrink-0 rounded-full px-3 text-meta transition-colors",
              kind === k ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {TERM_KIND_LABELS[k].plural}
            <span className="ml-1.5 tabular-nums opacity-60">{terms.filter((t) => t.kind === k).length}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <form
          className="flex flex-1 gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            const ok = await run("new", () => api("/api/app/terms", { method: "POST", json: { kind, name: newName } }), `Added “${newName.trim()}”`);
            if (ok) setNewName("");
          }}
        >
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={`New ${TERM_KIND_LABELS[kind].singular.toLowerCase()}`} aria-label={`New ${TERM_KIND_LABELS[kind].singular}`} maxLength={60} />
          <Button type="submit" variant="outline" disabled={!newName.trim() || busy === "new"} className="h-9">
            {busy === "new" ? <Loader2 className="animate-spin" /> : <Plus />} Add
          </Button>
        </form>
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…" aria-label="Filter terms" className="sm:w-48" />
      </div>
      <ul className="divide-y rounded-xl border bg-card">
        {list.length === 0 && <li className="px-4 py-6 text-center text-meta text-muted-foreground">No terms.</li>}
        {list.map((t) => (
          <li key={t.id} className="flex min-h-11 items-center gap-3 px-4 py-1.5">
            {editing?.id === t.id ? (
              <form
                className="flex flex-1 items-center gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const ok = await run(t.id, () => api("/api/app/terms", { method: "PATCH", json: { id: t.id, name: editing.name } }), "Renamed");
                  if (ok) setEditing(null);
                }}
              >
                <Input value={editing.name} onChange={(e) => setEditing({ id: t.id, name: e.target.value })} className="h-8" autoFocus aria-label="New name" maxLength={60} />
                <Button type="submit" size="icon-sm" variant="ghost" aria-label="Save name" disabled={busy === t.id}>
                  {busy === t.id ? <Loader2 className="animate-spin" /> : <Check />}
                </Button>
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Cancel rename" onClick={() => setEditing(null)}>
                  <X />
                </Button>
              </form>
            ) : (
              <>
                <span className="flex-1 truncate text-body">{t.name}</span>
                {t.isBuiltIn && <span className="hidden text-micro text-subtle-foreground sm:inline">Built-in</span>}
                <span className="w-20 text-right text-meta tabular-nums text-muted-foreground">
                  {t.count} {t.count === 1 ? "use" : "uses"}
                </span>
                <Button size="icon-sm" variant="ghost" aria-label={`Rename ${t.name}`} onClick={() => setEditing({ id: t.id, name: t.name })}>
                  <Pencil />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Delete ${t.name}`}
                  disabled={busy === t.id}
                  onClick={() => {
                    const msg = t.count
                      ? `Delete “${t.name}”? It will be removed from ${t.count} reference(s). The references themselves are kept.`
                      : `Delete “${t.name}”?`;
                    if (window.confirm(msg)) void run(t.id, () => api("/api/app/terms", { method: "DELETE", json: { id: t.id } }), `Deleted “${t.name}”`);
                  }}
                >
                  <Trash2 />
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

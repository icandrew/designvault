"use client";

import { useState } from "react";
import { Check, Loader2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  CAPTURED_THEMES,
  countActiveFilters,
  DARK_MODE_SUPPORT,
  LABELS,
  REFERENCE_STATUSES,
  TERM_FILTER_KEYS,
  TERM_KIND_LABELS,
  VIEWPORTS,
  type Filters,
} from "@/lib/domain";
import type { TermOption } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useFilterNavigation } from "./use-filters";

export interface FilterOptions {
  terms: TermOption[];
  collections: { id: string; name: string }[];
}

function Chip({
  selected,
  onClick,
  children,
  count,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-meta transition-colors duration-150",
        selected
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-foreground hover:border-border-strong hover:bg-accent",
      )}
    >
      {selected && <Check className="size-3.5" />}
      {children}
      {count !== undefined && <span className={cn("tabular-nums", selected ? "text-background/70" : "text-subtle-foreground")}>{count}</span>}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-b py-5 last:border-b-0">
      <legend className="mb-3 text-meta font-medium text-foreground">{title}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

const DATE_PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last year", days: 365 },
];

export function FilterSheet({
  filters,
  options,
  total,
  fixed,
}: {
  filters: Filters;
  options: FilterOptions;
  total: number;
  fixed?: Partial<Filters>;
}) {
  const { setFilters, toggleValue, clearAll, pending } = useFilterNavigation(filters, fixed);
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const [now] = useState(() => Date.now());
  const active = countActiveFilters(filters) - (fixed?.favorite !== undefined ? 1 : 0);

  const termSection = (key: keyof typeof TERM_FILTER_KEYS) => {
    const kind = TERM_FILTER_KEYS[key];
    const selected = (filters[key] as string[]) ?? [];
    const all = options.terms.filter((t) => t.kind === kind);
    const used = all.filter((t) => t.count > 0 || selected.includes(t.slug));
    const list = showAll[kind] ? all : used;
    if (all.length === 0) return null;
    return (
      <Section key={key} title={TERM_KIND_LABELS[kind].plural}>
        {list.length === 0 && <p className="text-meta text-subtle-foreground">None used yet.</p>}
        {list.map((t) => (
          <Chip key={t.slug} selected={selected.includes(t.slug)} onClick={() => toggleValue(key, t.slug)} count={t.count}>
            {t.name}
          </Chip>
        ))}
        {all.length > used.length && (
          <button
            type="button"
            className="h-8 px-1 text-meta text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => setShowAll((s) => ({ ...s, [kind]: !s[kind] }))}
          >
            {showAll[kind] ? "Show used only" : `Show all ${all.length}`}
          </button>
        )}
      </Section>
    );
  };

  const addedAfterDays = filters.addedAfter
    ? Math.round((now - new Date(filters.addedAfter).getTime()) / 86_400_000)
    : null;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="h-9 gap-2">
          <SlidersHorizontal className="size-4" />
          Filters
          {active > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-foreground px-1.5 text-micro font-medium text-background tabular-nums">
              {active}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="text-heading">Filters</SheetTitle>
          <SheetDescription>Combine filters across classifications. Results update as you choose.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5">
          {termSection("industry")}
          {termSection("pageType")}
          {termSection("component")}
          {termSection("visualStyle")}
          {termSection("layout")}
          {termSection("interaction")}
          {termSection("tag")}
          <Section title="Media">
            <Chip selected={filters.media.includes("video")} onClick={() => toggleValue("media", "video")}>
              Includes video
            </Chip>
          </Section>
          <Section title="Captured viewport">
            {VIEWPORTS.map((v) => (
              <Chip key={v} selected={filters.viewport.includes(v)} onClick={() => toggleValue("viewport", v)}>
                {LABELS.viewport[v]}
              </Chip>
            ))}
          </Section>
          <Section title="Captured theme">
            {CAPTURED_THEMES.map((v) => (
              <Chip key={v} selected={filters.theme.includes(v)} onClick={() => toggleValue("theme", v)}>
                {LABELS.capturedTheme[v]}
              </Chip>
            ))}
          </Section>
          <Section title="Source supports dark mode">
            {DARK_MODE_SUPPORT.map((v) => (
              <Chip key={v} selected={filters.darkMode.includes(v)} onClick={() => toggleValue("darkMode", v)}>
                {LABELS.darkMode[v]}
              </Chip>
            ))}
          </Section>
          <Section title="Status">
            {REFERENCE_STATUSES.map((v) => (
              <Chip key={v} selected={filters.status.includes(v)} onClick={() => toggleValue("status", v)}>
                {LABELS.status[v]}
              </Chip>
            ))}
          </Section>
          {fixed?.favorite === undefined && (
            <Section title="Favorites">
              <Chip selected={filters.favorite === true} onClick={() => setFilters({ favorite: filters.favorite ? undefined : true })}>
                Favorites only
              </Chip>
            </Section>
          )}
          {options.collections.length > 0 && (
            <Section title="Collection">
              {options.collections.map((c) => (
                <Chip
                  key={c.id}
                  selected={filters.collection === c.id}
                  onClick={() => setFilters({ collection: filters.collection === c.id ? undefined : c.id })}
                >
                  {c.name}
                </Chip>
              ))}
            </Section>
          )}
          <Section title="Date added">
            {DATE_PRESETS.map((p) => (
              <Chip
                key={p.days}
                selected={addedAfterDays !== null && Math.abs(addedAfterDays - p.days) <= 1}
                onClick={() =>
                  setFilters({
                    addedAfter:
                      addedAfterDays !== null && Math.abs(addedAfterDays - p.days) <= 1
                        ? undefined
                        : new Date(now - p.days * 86_400_000).toISOString().slice(0, 10),
                  })
                }
              >
                {p.label}
              </Chip>
            ))}
          </Section>
        </div>
        <SheetFooter className="flex-row items-center justify-between border-t px-5 py-3">
          <Button variant="ghost" onClick={clearAll} disabled={active === 0}>
            Clear all
          </Button>
          <p className="flex items-center gap-2 text-meta text-muted-foreground" aria-live="polite">
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            {total} {total === 1 ? "result" : "results"}
          </p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

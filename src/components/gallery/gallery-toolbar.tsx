"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Grid2x2, LayoutDashboard, Rows3, StretchHorizontal, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LABELS, SORTS, TERM_FILTER_KEYS, type Filters, type Sort } from "@/lib/domain";
import { DENSITY_COOKIE, setPrefCookie, VIEW_COOKIE, type DensityPref, type ViewPref } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { FilterSheet, type FilterOptions } from "./filter-sheet";
import { useFilterNavigation } from "./use-filters";

function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon: React.ComponentType<{ className?: string }> }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex h-9 items-center rounded-md border bg-background p-0.5">
      {options.map((o) => (
        <Tooltip key={o.value}>
          <TooltipTrigger asChild>
            <button
              type="button"
              role="radio"
              aria-checked={value === o.value}
              aria-label={o.label}
              onClick={() => onChange(o.value)}
              className={cn(
                "grid h-full w-8 place-items-center rounded-[5px] text-subtle-foreground transition-colors duration-150 hover:text-foreground",
                value === o.value && "bg-accent text-foreground",
              )}
            >
              <o.icon className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{o.label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

export function GalleryToolbar({
  filters,
  options,
  total,
  view,
  density,
  fixed,
  showSort = true,
}: {
  filters: Filters;
  options: FilterOptions;
  total: number;
  view: ViewPref;
  density: DensityPref;
  fixed?: Partial<Filters>;
  showSort?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { setFilters, toggleValue, clearAll } = useFilterNavigation(filters, fixed);

  const setPref = (cookie: string, value: string) => {
    setPrefCookie(cookie, value);
    startTransition(() => router.refresh());
  };

  // Active filter chips
  const termName = (kind: string, slug: string) => options.terms.find((t) => t.kind === kind && t.slug === slug)?.name ?? slug;
  const chips: { key: string; label: string; remove: () => void }[] = [];
  for (const [key, kind] of Object.entries(TERM_FILTER_KEYS) as [keyof typeof TERM_FILTER_KEYS, string][]) {
    for (const slug of filters[key]) chips.push({ key: `${key}:${slug}`, label: termName(kind, slug), remove: () => toggleValue(key, slug) });
  }
  for (const v of filters.viewport) chips.push({ key: `vp:${v}`, label: LABELS.viewport[v], remove: () => toggleValue("viewport", v) });
  for (const v of filters.theme) chips.push({ key: `th:${v}`, label: `${LABELS.capturedTheme[v]} theme`, remove: () => toggleValue("theme", v) });
  for (const v of filters.darkMode) chips.push({ key: `dm:${v}`, label: `Dark mode: ${LABELS.darkMode[v]}`, remove: () => toggleValue("darkMode", v) });
  for (const v of filters.media) chips.push({ key: `md:${v}`, label: LABELS.media[v], remove: () => toggleValue("media", v) });
  for (const v of filters.status) chips.push({ key: `st:${v}`, label: LABELS.status[v], remove: () => toggleValue("status", v) });
  if (filters.favorite !== undefined && fixed?.favorite === undefined)
    chips.push({ key: "fav", label: "Favorites", remove: () => setFilters({ favorite: undefined }) });
  if (filters.collection)
    chips.push({
      key: "col",
      label: options.collections.find((c) => c.id === filters.collection)?.name ?? "Collection",
      remove: () => setFilters({ collection: undefined }),
    });
  if (filters.addedAfter) chips.push({ key: "after", label: `Added since ${filters.addedAfter}`, remove: () => setFilters({ addedAfter: undefined }) });
  if (filters.addedBefore) chips.push({ key: "before", label: `Added before ${filters.addedBefore}`, remove: () => setFilters({ addedBefore: undefined }) });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSheet filters={filters} options={options} total={total} fixed={fixed} />
        <div className="ml-auto flex items-center gap-2">
          {showSort && (
            <Select value={filters.sort} onValueChange={(v) => setFilters({ sort: v as Sort })}>
              <SelectTrigger className="h-9 w-[150px] sm:w-[170px]" aria-label="Sort references">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {SORTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {LABELS.sort[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Segmented
            label="Gallery layout"
            value={view}
            onChange={(v) => setPref(VIEW_COOKIE, v)}
            options={[
              { value: "masonry", label: "Masonry", icon: LayoutDashboard },
              { value: "grid", label: "Grid", icon: Grid2x2 },
            ]}
          />
          <div className="hidden sm:block">
            <Segmented
              label="Density"
              value={density}
              onChange={(v) => setPref(DENSITY_COOKIE, v)}
              options={[
                { value: "comfortable", label: "Comfortable", icon: StretchHorizontal },
                { value: "compact", label: "Compact", icon: Rows3 },
              ]}
            />
          </div>
        </div>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
          <AnimatePresence initial={false}>
            {chips.map((c) => (
              <motion.span
                key={c.key}
                layout
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.15 }}
                className="inline-flex h-7 items-center gap-1 rounded-full bg-accent pr-1 pl-3 text-meta text-foreground"
              >
                {c.label}
                <button
                  type="button"
                  onClick={c.remove}
                  aria-label={`Remove filter ${c.label}`}
                  className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </motion.span>
            ))}
          </AnimatePresence>
          <button type="button" onClick={clearAll} className="h-7 px-2 text-meta text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

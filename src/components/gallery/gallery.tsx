"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { filtersToSearchParams, type Filters } from "@/lib/domain";
import { computeMasonry, containerStyle, coverRatio, placementStyle } from "@/lib/masonry";
import type { Page, ReferenceSummary } from "@/lib/types";
import type { DensityPref, ViewPref } from "@/lib/prefs";
import { ReferenceCard } from "./reference-card";

const PAGE_SIZE = 48;

export function Gallery({
  initial,
  filters,
  view,
  density,
  label = "References",
}: {
  initial: Page<ReferenceSummary>;
  filters: Partial<Filters>;
  view: ViewPref;
  density: DensityPref;
  label?: string;
}) {
  const [items, setItems] = useState(initial.items);
  const [total, setTotal] = useState(initial.total);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = items.length < total;

  // Server re-render with the same filters (e.g. after favoriting) refreshes the first page.
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setItems((prev) => {
      const fresh = new Map(initial.items.map((i) => [i.id, i]));
      const merged = initial.items.concat(prev.slice(initial.items.length).filter((i) => !fresh.has(i.id)));
      return merged;
    });
    setTotal(initial.total);
  }

  const loadMore = async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(null);
    try {
      const params = filtersToSearchParams(filters);
      params.set("offset", String(items.length));
      params.set("limit", String(PAGE_SIZE));
      const page = await api<Page<ReferenceSummary>>(`/api/app/references?${params}`);
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return prev.concat(page.items.filter((i) => !seen.has(i.id)));
      });
      setTotal(page.total);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || error) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void loadMore(), {
      rootMargin: "800px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, items.length, error]);

  const ratios = useMemo(() => items.map((i) => coverRatio(i.cover)), [items]);
  const layout = useMemo(() => (view === "masonry" ? computeMasonry(ratios, density) : null), [ratios, density, view]);
  const remove = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setTotal((t) => t - 1);
  };

  return (
    <section aria-label={label} className="dv-gallery">
      {layout ? (
        <div className="dv-masonry" data-density={density} style={containerStyle(layout)}>
          {items.map((item, i) => (
            <ReferenceCard
              key={item.id}
              reference={item}
              density={density}
              view="masonry"
              eager={i < 8}
              className="dv-item"
              style={placementStyle(layout.items[i], ratios[i]) as React.CSSProperties}
              onRemoved={remove}
            />
          ))}
        </div>
      ) : (
        <div className="dv-grid" data-density={density}>
          {items.map((item, i) => (
            <ReferenceCard key={item.id} reference={item} density={density} view="grid" eager={i < 8} onRemoved={remove} />
          ))}
        </div>
      )}

      <div ref={sentinel} aria-hidden className="h-px" />
      <div className="flex min-h-16 items-center justify-center py-6" aria-live="polite">
        {loading && (
          <span className="flex items-center gap-2 text-meta text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading more references…
          </span>
        )}
        {error && (
          <div className="flex items-center gap-3 text-meta text-destructive">
            {error}
            <Button variant="outline" size="sm" onClick={loadMore}>
              Try again
            </Button>
          </div>
        )}
        {!loading && !error && hasMore && (
          <Button variant="outline" onClick={loadMore}>
            Load more
          </Button>
        )}
        {!hasMore && items.length > PAGE_SIZE && (
          <span className="text-meta text-subtle-foreground">You’ve reached the end · {total} references</span>
        )}
      </div>
    </section>
  );
}

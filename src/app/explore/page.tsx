import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/gallery/empty-state";
import { TERM_FILTER_KEYS, TERM_KIND_LABELS, type TermKind } from "@/lib/domain";
import { exploreTaxonomy } from "@/server/repositories/taxonomy";

export const metadata: Metadata = { title: "Explore" };

const ORDER: TermKind[] = ["industry", "page_type", "component", "layout", "visual_style", "interaction", "tag"];
const FILTER_PARAM = Object.fromEntries(Object.entries(TERM_FILTER_KEYS).map(([k, v]) => [v, k])) as Record<TermKind, string>;

export default async function ExplorePage() {
  const terms = await exploreTaxonomy();
  const groups = ORDER.map((kind) => ({ kind, terms: terms.filter((t) => t.kind === kind) })).filter((g) => g.terms.length);

  return (
    <PageContainer>
      <PageHeader title="Explore" description="Browse your vault by industry, page type, component, layout, style and interaction pattern." />
      {groups.length === 0 ? (
        <EmptyState icon={Compass} title="Nothing to explore yet" description="Classify references with industries, page types and patterns, and they will be organized here." />
      ) : (
        <div className="flex flex-col gap-14">
          {groups.map((g) => (
            <section key={g.kind} aria-labelledby={`explore-${g.kind}`}>
              <div className="mb-4 flex items-baseline justify-between">
                <h2 id={`explore-${g.kind}`} className="text-heading font-medium">
                  {TERM_KIND_LABELS[g.kind].plural}
                </h2>
                <span className="text-meta text-subtle-foreground">{g.terms.length}</span>
              </div>
              <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr))]">
                {g.terms.map((t) => (
                  <li key={t.slug}>
                    <Link
                      href={`/?${FILTER_PARAM[g.kind]}=${encodeURIComponent(t.slug)}`}
                      className="group flex flex-col gap-2.5 rounded-xl border bg-card p-2.5 transition-colors hover:border-border-strong"
                    >
                      <div className="dv-canvas relative grid h-28 grid-cols-3 gap-0.5 overflow-hidden rounded-lg">
                        {t.covers.map((id, i) => (
                          // eslint-disable-next-line @next/next/no-img-element -- stored thumbnails
                          <img
                            key={id}
                            src={`/api/images/${id}/thumb`}
                            alt=""
                            loading="lazy"
                            className={
                              t.covers.length === 1
                                ? "col-span-3 h-full w-full object-cover object-top"
                                : t.covers.length === 2 && i === 0
                                  ? "col-span-2 h-full w-full object-cover object-top"
                                  : "h-full w-full object-cover object-top"
                            }
                          />
                        ))}
                      </div>
                      <div className="flex items-baseline justify-between gap-2 px-1 pb-0.5">
                        <span className="truncate text-title font-medium">{t.name}</span>
                        <span className="text-meta tabular-nums text-subtle-foreground">{t.count}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </PageContainer>
  );
}

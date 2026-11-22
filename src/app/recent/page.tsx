import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Clock3 } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/gallery/empty-state";
import { Gallery } from "@/components/gallery/gallery";
import { Button } from "@/components/ui/button";
import { asDensity, asView, DENSITY_COOKIE, VIEW_COOKIE } from "@/lib/prefs";
import type { ReferenceSummary } from "@/lib/types";
import { listReferences } from "@/server/repositories/references";

export const metadata: Metadata = { title: "Recently added" };

function groupLabel(iso: string, now: Date) {
  const d = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  if (d.getTime() >= startOfToday) return "Today";
  if (d.getTime() >= startOfToday - day) return "Yesterday";
  if (d.getTime() >= startOfToday - 6 * day) return "Earlier this week";
  if (d.getTime() >= startOfToday - 29 * day) return "Earlier this month";
  return "Older";
}

export default async function RecentPage() {
  const store = await cookies();
  const view = asView(store.get(VIEW_COOKIE)?.value);
  const density = asDensity(store.get(DENSITY_COOKIE)?.value);
  const page = await listReferences({ sort: "newest", status: ["to_review", "curated", "archived"] }, { limit: 96 });
  const now = new Date();
  const groups: { label: string; items: ReferenceSummary[] }[] = [];
  for (const item of page.items) {
    const label = groupLabel(item.createdAt, now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return (
    <PageContainer>
      <PageHeader title="Recently added" description="Your latest saved references, newest first." count={page.items.length < page.total ? undefined : page.total} />
      {groups.length === 0 ? (
        <EmptyState icon={Clock3} title="Nothing added yet" description="New references will appear here as you save them.">
          <Button asChild>
            <Link href="/references/new">Add reference</Link>
          </Button>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-12">
          {groups.map((g) => (
            <section key={g.label} aria-labelledby={`recent-${g.label}`}>
              <h2 id={`recent-${g.label}`} className="mb-4 text-title font-medium text-muted-foreground">
                {g.label} <span className="text-subtle-foreground tabular-nums">· {g.items.length}</span>
              </h2>
              <Gallery
                initial={{ items: g.items, total: g.items.length, limit: g.items.length, offset: 0, hasMore: false }}
                filters={{}}
                view={view}
                density={density}
                label={g.label}
              />
            </section>
          ))}
          {page.total > page.items.length && (
            <p className="text-center text-meta text-muted-foreground">
              Showing the latest {page.items.length}.{" "}
              <Link href="/?sort=newest" className="text-foreground underline underline-offset-4">
                See all {page.total} references
              </Link>
            </p>
          )}
        </div>
      )}
    </PageContainer>
  );
}

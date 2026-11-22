import Link from "next/link";
import { cookies } from "next/headers";
import { Heart, ImagePlus, SearchX, Sparkles } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { countActiveFilters, parseFilters, type Filters } from "@/lib/domain";
import { asDensity, asView, DENSITY_COOKIE, VIEW_COOKIE } from "@/lib/prefs";
import { listCollectionOptions } from "@/server/repositories/collections";
import { countReferences, listReferences } from "@/server/repositories/references";
import { listTerms } from "@/server/repositories/taxonomy";
import { EmptyState } from "./empty-state";
import { Gallery } from "./gallery";
import { GalleryToolbar } from "./gallery-toolbar";
import { LoadSampleButton } from "./load-sample-button";

export async function GalleryPage({
  searchParams,
  title,
  description,
  fixed = {},
}: {
  searchParams: Record<string, string | string[] | undefined>;
  title: string;
  description: string;
  fixed?: Partial<Filters>;
}) {
  const filters: Filters = { ...parseFilters(searchParams), ...fixed };
  const store = await cookies();
  const view = asView(store.get(VIEW_COOKIE)?.value);
  const density = asDensity(store.get(DENSITY_COOKIE)?.value);
  const [page, terms, collections, libraryTotal] = await Promise.all([
    listReferences(filters, { limit: 48 }),
    listTerms(),
    listCollectionOptions(),
    countReferences({ status: ["to_review", "curated", "archived"] }),
  ]);
  const filtered = Boolean(filters.q) || countActiveFilters(filters) - Object.keys(fixed).length > 0;
  const isFavorites = fixed.favorite === true;

  return (
    <PageContainer>
      <PageHeader title={title} description={description} count={page.total} />
      {libraryTotal === 0 ? (
        <EmptyState
          icon={ImagePlus}
          title="Your vault is empty"
          description={
            <>
              Save your first screenshot of a website, section or UI component. Every reference becomes structured,
              searchable evidence for you and your AI agents.
            </>
          }
        >
          <Button asChild>
            <Link href="/references/new">
              <ImagePlus /> Add your first reference
            </Link>
          </Button>
          <LoadSampleButton />
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          <GalleryToolbar
            filters={filters}
            options={{ terms, collections }}
            total={page.total}
            view={view}
            density={density}
            fixed={fixed}
          />
          {page.total === 0 ? (
            filtered ? (
              <EmptyState
                icon={SearchX}
                title="No matching references"
                description={
                  filters.q ? (
                    <>Nothing matches “{filters.q}” with the current filters. Try fewer filters or different words.</>
                  ) : (
                    <>No references match this combination of filters.</>
                  )
                }
              >
                <Button variant="outline" asChild>
                  <Link href={isFavorites ? "/favorites" : "/"}>Clear search and filters</Link>
                </Button>
              </EmptyState>
            ) : isFavorites ? (
              <EmptyState
                icon={Heart}
                title="No favorites yet"
                description="Use the heart on any reference to keep your strongest examples one click away."
              >
                <Button variant="outline" asChild>
                  <Link href="/">Browse all references</Link>
                </Button>
              </EmptyState>
            ) : (
              <EmptyState icon={Sparkles} title="Nothing to show" description="Archived references are hidden. Filter by status to see them." />
            )
          ) : (
            <Gallery
              key={JSON.stringify(filters)}
              initial={page}
              filters={filters}
              view={view}
              density={density}
              label={title}
            />
          )}
        </div>
      )}
    </PageContainer>
  );
}

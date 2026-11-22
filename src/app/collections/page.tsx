import type { Metadata } from "next";
import Link from "next/link";
import { FolderClosed, Plus } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { NewCollectionButton } from "@/components/collections/collection-dialog";
import { EmptyState } from "@/components/gallery/empty-state";
import { formatDate } from "@/lib/api-client";
import { listCollections } from "@/server/repositories/collections";

export const metadata: Metadata = { title: "Collections" };

export default async function CollectionsPage() {
  const collections = await listCollections();
  return (
    <PageContainer>
      <PageHeader
        title="Collections"
        description="Curated groups of references for projects, research topics and visual directions."
        count={collections.length}
        actions={
          collections.length > 0 && (
            <NewCollectionButton>
              <Plus className="size-4" /> New collection
            </NewCollectionButton>
          )
        }
      />
      {collections.length === 0 ? (
        <EmptyState
          icon={FolderClosed}
          title="No collections yet"
          description="Collections group references without duplicating images. Create a project moodboard to collect references for a specific website brief."
        >
          <NewCollectionButton>
            <Plus className="size-4" /> Create a collection
          </NewCollectionButton>
        </EmptyState>
      ) : (
        <ul className="grid gap-x-5 gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))]">
          {collections.map((c) => (
            <li key={c.id} className="group relative">
              <div className="dv-canvas grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-lg ring-1 ring-border transition-[box-shadow] duration-200 group-hover:ring-border-strong">
                {c.covers.length === 0 && (
                  <div className="col-span-2 row-span-2 grid place-items-center text-subtle-foreground">
                    <FolderClosed className="size-6" />
                  </div>
                )}
                {c.covers.slice(0, 4).map((cover, i) => (
                  // eslint-disable-next-line @next/next/no-img-element -- stored thumbnails
                  <img
                    key={cover.id}
                    src={`/api/images/${cover.id}/thumb`}
                    alt=""
                    loading="lazy"
                    className={
                      c.covers.length === 1
                        ? "col-span-2 row-span-2 h-full w-full object-cover object-top"
                        : c.covers.length === 2
                          ? "row-span-2 h-full w-full object-cover object-top"
                          : c.covers.length === 3 && i === 0
                            ? "row-span-2 h-full w-full object-cover object-top"
                            : "h-full w-full object-cover object-top"
                    }
                  />
                ))}
              </div>
              <div className="mt-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-title font-medium">
                    <Link href={`/collections/${c.id}`} className="after:absolute after:inset-0">
                      {c.name}
                    </Link>
                  </h2>
                  <p className="truncate text-meta text-muted-foreground">
                    {c.referenceCount} {c.referenceCount === 1 ? "reference" : "references"} · Updated {formatDate(c.updatedAt)}
                  </p>
                </div>
                {c.kind === "moodboard" && <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-micro font-medium text-muted-foreground">Moodboard</span>}
              </div>
              {c.description && <p className="mt-1 line-clamp-2 text-meta text-subtle-foreground">{c.description}</p>}
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}

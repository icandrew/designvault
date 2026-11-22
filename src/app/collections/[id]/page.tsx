import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ImagePlus } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { CollectionHeaderActions, CollectionItems } from "@/components/collections/collection-manager";
import { EmptyState } from "@/components/gallery/empty-state";
import { getCollection } from "@/server/repositories/collections";

export async function generateMetadata({ params }: PageProps<"/collections/[id]">): Promise<Metadata> {
  const c = await getCollection((await params).id);
  return { title: c?.name ?? "Collection not found" };
}

export default async function CollectionPage({ params }: PageProps<"/collections/[id]">) {
  const collection = await getCollection((await params).id);
  if (!collection) notFound();

  return (
    <PageContainer>
      <PageHeader
        eyebrow={
          <Link href="/collections" className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft className="size-4" /> Collections
          </Link>
        }
        title={collection.name}
        count={collection.referenceCount}
        description={collection.description ?? (collection.kind === "moodboard" ? "Project moodboard" : undefined)}
        actions={<CollectionHeaderActions collection={collection} />}
      />
      {collection.kind === "moodboard" && collection.brief && (
        <section className="mb-8 max-w-3xl rounded-xl border bg-card p-5" aria-labelledby="brief-title">
          <h2 id="brief-title" className="text-micro font-medium uppercase text-subtle-foreground">
            Website brief
          </h2>
          <p className="mt-2 text-body whitespace-pre-line">{collection.brief}</p>
          <p className="mt-3 text-micro text-subtle-foreground">
            Available to Claude Code via <code className="font-mono">get_collection_references</code> with your selection notes.
          </p>
        </section>
      )}
      {collection.items.length === 0 ? (
        <EmptyState
          icon={ImagePlus}
          title="This collection is empty"
          description="Add references from your vault with the button above, or use “Add to collection” on any reference."
        />
      ) : (
        <CollectionItems collection={collection} />
      )}
    </PageContainer>
  );
}

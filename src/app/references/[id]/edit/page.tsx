import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { ImageManager } from "@/components/reference/image-manager";
import { ReferenceForm } from "@/components/reference/reference-form";
import { getFormOptions } from "@/server/form-data";
import { getReference } from "@/server/repositories/references";

export const metadata: Metadata = { title: "Edit reference" };

export default async function EditReferencePage({ params }: PageProps<"/references/[id]/edit">) {
  const { id } = await params;
  const [ref, { termOptions, collections }] = await Promise.all([getReference(id), getFormOptions()]);
  if (!ref) notFound();
  const a = ref.analysis;

  return (
    <PageContainer className="max-w-6xl pb-0">
      <PageHeader
        eyebrow={
          <Link href={`/references/${id}`} className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft className="size-4" /> Back to reference
          </Link>
        }
        title="Edit reference"
        description={ref.title}
      />
      <ImageManager referenceId={id} images={ref.images} />
      <ReferenceForm
        mode="edit"
        referenceId={id}
        termOptions={termOptions}
        collections={collections}
        timestamps={{ createdAt: ref.createdAt, updatedAt: ref.updatedAt }}
        initial={{
          title: ref.title,
          siteName: ref.siteName ?? "",
          sourceUrl: ref.sourceUrl ?? "",
          description: ref.description ?? "",
          industry: ref.industry?.name ?? "",
          additionalIndustries: ref.additionalIndustries.map((t) => t.name),
          pageType: ref.pageType?.name ?? null,
          visualStyles: ref.visualStyles.map((t) => t.name),
          layouts: ref.layouts.map((t) => t.name),
          components: ref.components.map((t) => t.name),
          interactions: ref.interactions.map((t) => ({ name: t.name, verified: t.verified })),
          tags: ref.tags.map((t) => t.name),
          screenshotType: ref.screenshotType,
          capturedTheme: ref.capturedTheme,
          supportsDarkMode: ref.supportsDarkMode,
          capturedViewport: ref.capturedViewport,
          status: ref.status,
          isFavorite: ref.isFavorite,
          attribution: ref.attribution ?? "",
          licenseNotes: ref.licenseNotes ?? "",
          capturedAt: ref.capturedAt ?? "",
          collectionIds: [],
          newCollections: ref.collections.map((c) => c.name),
          analysis: {
            observations: a?.observations ?? "",
            interesting: a?.interesting ?? "",
            typographyNotes: a?.typographyNotes ?? "",
            colorNotes: a?.colorNotes ?? "",
            layoutNotes: a?.layoutNotes ?? "",
            interactionNotes: a?.interactionNotes ?? "",
            uxStrengths: a?.uxStrengths ?? "",
            limitations: a?.limitations ?? "",
            usageIdeas: a?.usageIdeas ?? "",
            aiSuggestions: a?.aiSuggestions ?? "",
            aiSuggestionsReviewed: a?.aiSuggestionsReviewed ?? false,
          },
        }}
      />
    </PageContainer>
  );
}

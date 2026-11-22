import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { ReferenceForm } from "@/components/reference/reference-form";
import { getFormOptions } from "@/server/form-data";

export const metadata: Metadata = { title: "Add reference" };

export default async function NewReferencePage() {
  const { termOptions, collections } = await getFormOptions();
  return (
    <PageContainer className="max-w-6xl pb-0">
      <PageHeader
        title="Add reference"
        description="Save a screenshot as structured design evidence. Describe what you observe, then add your interpretation."
      />
      <ReferenceForm mode="create" termOptions={termOptions} collections={collections} />
    </PageContainer>
  );
}

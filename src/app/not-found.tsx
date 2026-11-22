import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { PageContainer } from "@/components/app/page-header";
import { EmptyState } from "@/components/gallery/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <PageContainer>
      <EmptyState icon={FileQuestion} title="Not found" description="This reference or page doesn’t exist. It may have been deleted.">
        <Button asChild>
          <Link href="/">Back to all references</Link>
        </Button>
      </EmptyState>
    </PageContainer>
  );
}

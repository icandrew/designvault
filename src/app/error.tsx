"use client";

import { ServerCrash } from "lucide-react";
import { PageContainer } from "@/components/app/page-header";
import { EmptyState } from "@/components/gallery/empty-state";
import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageContainer>
      <EmptyState
        icon={ServerCrash}
        title="Something went wrong"
        description="The page could not be loaded. Your saved references are safe. Check that the Design Vault server is still running, then try again."
      >
        <Button onClick={reset}>Try again</Button>
      </EmptyState>
    </PageContainer>
  );
}

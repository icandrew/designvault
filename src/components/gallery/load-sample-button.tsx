"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";

export function LoadSampleButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { created } = await api<{ created: number }>("/api/app/settings", {
            method: "POST",
            json: { action: "load_sample_data" },
          });
          toast.success(`Added ${created} sample references`, {
            description: "They are labelled “Sample” and can be removed in Settings.",
          });
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <FlaskConical />}
      Explore with sample data
    </Button>
  );
}

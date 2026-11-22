"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, FlaskConical, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";

export function SampleDataControls({ samples }: { samples: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (action: "load_sample_data" | "remove_sample_data") => {
    if (action === "remove_sample_data" && !window.confirm(`Remove all ${samples} sample references? Your own references are not affected.`)) return;
    setBusy(action);
    try {
      const res = await api<{ created?: number; removed?: number }>("/api/app/settings", { method: "POST", json: { action } });
      toast.success(res.created !== undefined ? `Added ${res.created} sample references` : `Removed ${res.removed} sample references`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" className="h-9" disabled={!!busy} onClick={() => run("load_sample_data")}>
        {busy === "load_sample_data" ? <Loader2 className="animate-spin" /> : <FlaskConical />} Load sample data
      </Button>
      <Button variant="outline" className="h-9" disabled={!!busy || samples === 0} onClick={() => run("remove_sample_data")}>
        {busy === "remove_sample_data" ? <Loader2 className="animate-spin" /> : <Trash2 />} Remove sample data{samples ? ` (${samples})` : ""}
      </Button>
    </div>
  );
}

export function ExportButton() {
  return (
    <Button variant="outline" className="h-9" asChild>
      <a href="/api/app/export" download>
        <Download /> Export metadata (JSON)
      </a>
    </Button>
  );
}

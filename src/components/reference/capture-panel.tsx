"use client";

import { useState } from "react";
import { Globe, Loader2, Monitor, Smartphone, Tablet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api, type UploadResult } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export interface CaptureResult {
  finalUrl: string;
  pageTitle: string | null;
  siteName: string;
  darkModeDetected: "yes" | "no" | "unknown";
  failures: string[];
  images: {
    uploadId: string;
    width: number;
    height: number;
    bytes: number;
    duplicates: UploadResult["duplicates"];
    viewport: "desktop" | "tablet" | "mobile";
    viewportWidth: number;
    viewportHeight: number;
    theme: "light" | "dark";
  }[];
}

const VIEWPORT_OPTIONS = [
  { value: "desktop", label: "Desktop", hint: "1440 × 900", icon: Monitor },
  { value: "tablet", label: "Tablet", hint: "834 × 1194", icon: Tablet },
  { value: "mobile", label: "Mobile", hint: "390 × 844", icon: Smartphone },
] as const;

export function CapturePanel({ initialUrl, onCaptured }: { initialUrl?: string; onCaptured: (result: CaptureResult, fullPage: boolean) => void }) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [viewports, setViewports] = useState<string[]>(["desktop"]);
  const [fullPage, setFullPage] = useState(true);
  const [themes, setThemes] = useState<"light" | "both">("light");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
      const result = await api<CaptureResult>("/api/app/capture", {
        method: "POST",
        json: { url: normalized, viewports, fullPage, themes: themes === "both" ? ["light", "dark"] : ["light"] },
      });
      onCaptured(result, fullPage);
      const notes = [`Captured ${result.images.length} screenshot${result.images.length === 1 ? "" : "s"}.`];
      if (themes === "both" && result.darkModeDetected === "no") notes.push("The site looked identical in dark mode, so only the light version was kept.");
      if (result.failures.length) notes.push(`Some captures failed: ${result.failures.join("; ")}`);
      setNotice(notes.join(" "));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="capture-url">Website URL</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Globe className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground" />
            <Input
              id="capture-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="pl-9"
              inputMode="url"
              autoComplete="url"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (url.trim() && viewports.length && !busy) void run();
                }
              }}
            />
          </div>
          <Button type="button" onClick={run} disabled={!url.trim() || viewports.length === 0 || busy} className="h-9">
            {busy ? <Loader2 className="animate-spin" /> : <Globe />}
            {busy ? "Capturing…" : "Capture"}
          </Button>
        </div>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-meta font-medium">Viewports</legend>
        <div className="grid grid-cols-3 gap-2">
          {VIEWPORT_OPTIONS.map((v) => {
            const on = viewports.includes(v.value);
            return (
              <button
                key={v.value}
                type="button"
                aria-pressed={on}
                onClick={() => setViewports((list) => (on ? list.filter((x) => x !== v.value) : [...list, v.value]))}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-meta transition-colors",
                  on ? "border-foreground bg-accent" : "hover:bg-accent/50",
                )}
              >
                <v.icon className="size-4" />
                <span className="font-medium">{v.label}</span>
                <span className="text-micro text-subtle-foreground">{v.hint}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <label className="flex items-center gap-2 text-meta">
          <Switch checked={fullPage} onCheckedChange={setFullPage} aria-label="Capture full page" />
          Full page <span className="text-subtle-foreground">(otherwise first screen only)</span>
        </label>
        <label className="flex items-center gap-2 text-meta">
          <Switch checked={themes === "both"} onCheckedChange={(on) => setThemes(on ? "both" : "light")} aria-label="Also capture dark theme" />
          Also capture dark theme <span className="text-subtle-foreground">(when the site offers one)</span>
        </label>
      </div>
      <p className="text-micro text-subtle-foreground">
        Capture uses a local browser without your cookies. Sign-in walls, paywalls and anti-bot protections are respected, not
        bypassed — upload a manual screenshot in those cases.
      </p>
      <div aria-live="polite">
        {busy && <p className="text-meta text-muted-foreground">Loading the page and taking screenshots. This can take up to a minute.</p>}
        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-meta text-destructive">{error}</p>}
        {notice && !error && <p className="rounded-md bg-muted px-3 py-2 text-meta text-foreground">{notice}</p>}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { AlertTriangle, Globe, Heart, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { usePasteImages } from "@/components/app/paste-listener";
import { api, ApiError } from "@/lib/api-client";
import { takePendingImages } from "@/lib/clipboard";
import {
  CAPTURED_THEMES,
  DARK_MODE_SUPPORT,
  LABELS,
  REFERENCE_STATUSES,
  referenceInputSchema,
  SCREENSHOT_TYPES,
  VIEWPORTS,
  type TermKind,
} from "@/lib/domain";
import { cn } from "@/lib/utils";
import { CapturePanel, type CaptureResult } from "./capture-panel";
import { DropZone, StagedImageList } from "./screenshot-uploader";
import { TermMultiPicker, TermSelect } from "./term-picker";
import { useStagedImages } from "./use-staged-images";

type FormInput = z.input<typeof referenceInputSchema>;
type FormOutput = z.output<typeof referenceInputSchema>;

export interface ReferenceFormProps {
  mode: "create" | "edit";
  referenceId?: string;
  initial?: Partial<FormInput>;
  termOptions: Record<TermKind, string[]>;
  collections: { id: string; name: string }[];
  timestamps?: { createdAt: string; updatedAt: string };
}

const EMPTY: FormInput = {
  title: "",
  siteName: "",
  sourceUrl: "",
  description: "",
  industry: "",
  additionalIndustries: [],
  pageType: null,
  visualStyles: [],
  layouts: [],
  components: [],
  interactions: [],
  tags: [],
  screenshotType: "full_page",
  capturedTheme: "unknown",
  supportsDarkMode: "unknown",
  capturedViewport: "desktop",
  status: "to_review",
  isFavorite: false,
  attribution: "",
  licenseNotes: "",
  capturedAt: "",
  collectionIds: [],
  newCollections: [],
  analysis: {},
};

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-x-10 gap-y-5 border-t py-8 first:border-t-0 first:pt-0 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div>
        <h2 id={`${id}-title`} className="text-title font-medium">
          {title}
        </h2>
        {description && <p className="mt-1 text-meta text-muted-foreground">{description}</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="flex items-baseline gap-1.5 text-meta font-medium">
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        ) : (
          <span className="font-normal text-subtle-foreground">Optional</span>
        )}
      </Label>
      {children}
      {error ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} className="text-meta text-destructive" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-micro text-subtle-foreground">{hint}</p>
      )}
    </div>
  );
}

function RadioRow<T extends string>({
  name,
  value,
  onChange,
  options,
  labels,
}: {
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly T[];
  labels: Record<T, string>;
}) {
  return (
    <RadioGroup value={value} onValueChange={(v) => onChange(v as T)} className="flex flex-wrap gap-2" aria-label={name}>
      {options.map((o) => (
        <label
          key={o}
          className={cn(
            "flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-meta transition-colors",
            value === o ? "border-foreground bg-accent" : "hover:bg-accent/50",
          )}
        >
          <RadioGroupItem value={o} />
          {labels[o]}
        </label>
      ))}
    </RadioGroup>
  );
}

export function ReferenceForm({ mode, referenceId, initial, termOptions, collections, timestamps }: ReferenceFormProps) {
  const router = useRouter();
  const defaults = useMemo(() => ({ ...EMPTY, ...initial }), [initial]);
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(referenceInputSchema),
    defaultValues: defaults,
    mode: "onTouched",
  });
  const { register: rhfRegister, control, handleSubmit, formState, setValue, watch, reset, setError, getValues } = form;
  // Render default values in the server HTML so inputs are never empty before hydration.
  const register = (name: FieldPath<FormInput>, options?: Parameters<typeof rhfRegister>[1]) => {
    const value = name.split(".").reduce<unknown>((obj, key) => (obj as Record<string, unknown> | undefined)?.[key], defaults);
    return { ...rhfRegister(name, options), defaultValue: typeof value === "string" ? value : undefined };
  };
  const errors = formState.errors;
  const staged = useStagedImages({ theme: (watch("capturedTheme") as "light") ?? "unknown" });
  const [bulk, setBulk] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [urlDuplicate, setUrlDuplicate] = useState<{ id: string; title: string }[]>([]);
  const addAnother = useRef(false);
  const saved = useRef(false);

  // Ctrl/⌘+V adds clipboard images; images pasted elsewhere in the app arrive via the hand-off.
  usePasteImages((files) => {
    staged.addFiles(files);
    toast.success(files.length === 1 ? "Image pasted from clipboard" : `${files.length} images pasted from clipboard`);
  }, mode === "create");
  const { addFiles } = staged;
  useEffect(() => {
    if (mode !== "create") return;
    const pending = takePendingImages();
    if (pending.length) addFiles(pending);
  }, [mode, addFiles]);

  const dirty = formState.isDirty || staged.images.length > 0;
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty && !saved.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const checkSourceUrl = async (url: string) => {
    if (!url || !/^https?:\/\//i.test(url)) return setUrlDuplicate([]);
    try {
      const matches = await api<{ id: string; title: string }[]>(`/api/app/references?sourceUrl=${encodeURIComponent(url)}`);
      setUrlDuplicate(matches.filter((m) => m.id !== referenceId));
    } catch {
      setUrlDuplicate([]);
    }
  };

  const onCaptured = (result: CaptureResult, fullPage: boolean) => {
    staged.addCaptured(
      result.images.map((img) => ({
        uploadId: img.uploadId,
        width: img.width,
        height: img.height,
        bytes: img.bytes,
        duplicates: img.duplicates,
        name: `${new URL(result.finalUrl).hostname} · ${LABELS.viewport[img.viewport]} · ${LABELS.capturedTheme[img.theme]}`,
        meta: {
          label: null,
          viewport: img.viewport,
          theme: img.theme,
          screenshotType: fullPage ? "full_page" : "viewport",
          viewportWidth: img.viewportWidth,
          viewportHeight: img.viewportHeight,
        },
      })),
    );
    const v = getValues();
    if (!v.sourceUrl) setValue("sourceUrl", result.finalUrl, { shouldDirty: true });
    if (!v.siteName) setValue("siteName", result.siteName, { shouldDirty: true });
    if (!v.title && result.pageTitle) setValue("title", result.pageTitle.slice(0, 200), { shouldDirty: true });
    if (!v.capturedAt) setValue("capturedAt", new Date().toISOString().slice(0, 10), { shouldDirty: true });
    if (v.supportsDarkMode === "unknown" && result.darkModeDetected !== "unknown") {
      setValue("supportsDarkMode", result.darkModeDetected, { shouldDirty: true });
    }
    const first = result.images[0];
    if (first) {
      setValue("capturedViewport", first.viewport, { shouldDirty: true });
      setValue("capturedTheme", first.theme, { shouldDirty: true });
      setValue("screenshotType", fullPage ? "full_page" : "viewport", { shouldDirty: true });
    }
  };

  const applyServerErrors = (error: unknown) => {
    if (error instanceof ApiError && error.details?.length) {
      for (const d of error.details) {
        const path = d.path.replace(/^input\./, "");
        if (path.startsWith("images")) setImageError(d.message);
        else setError(path as FieldPath<FormInput>, { message: d.message });
      }
    }
    setSubmitError((error as Error).message);
  };

  const onSubmit = async (values: FormOutput) => {
    setSubmitError(null);
    setImageError(null);
    const collectionByName = new Map(collections.map((c) => [c.name.toLowerCase(), c.id]));
    const chosen = (watch("newCollections") ?? []) as string[];
    const input: FormOutput = {
      ...values,
      collectionIds: chosen.filter((n) => collectionByName.has(n.toLowerCase())).map((n) => collectionByName.get(n.toLowerCase())!),
      newCollections: chosen.filter((n) => !collectionByName.has(n.toLowerCase())),
    };

    try {
      if (mode === "edit" && referenceId) {
        await api(`/api/app/references/${referenceId}`, { method: "PUT", json: input });
        saved.current = true;
        toast.success("Changes saved");
        router.push(`/references/${referenceId}`);
        router.refresh();
        return;
      }

      if (staged.images.some((i) => i.status === "uploading")) {
        setImageError("Please wait for uploads to finish.");
        return;
      }
      const ready = staged.images.filter((i) => i.status === "ready" && i.uploadId);
      if (ready.length === 0) {
        setImageError("Add at least one valid screenshot.");
        document.getElementById("screenshots-title")?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      const toPayload = (img: (typeof ready)[number]) => ({
        uploadId: img.uploadId!,
        source: img.source,
        meta: { ...img.meta, viewportWidth: img.meta.viewportWidth ?? null, viewportHeight: img.meta.viewportHeight ?? null },
      });

      let firstId: string;
      if (bulk && ready.length > 1) {
        const ids: string[] = [];
        for (const [i, img] of ready.entries()) {
          const title = img.meta.label || `${input.title} (${i + 1})`;
          const { id } = await api<{ id: string }>("/api/app/references", {
            method: "POST",
            json: { input: { ...input, title, newCollections: i === 0 ? input.newCollections : [] }, images: [toPayload(img)] },
          });
          ids.push(id);
          if (i === 0 && input.newCollections.length) {
            // Re-use the collections created by the first reference for the rest.
            const opts = await api<{ id: string; name: string }[]>("/api/app/collections");
            const created = opts.filter((o) => input.newCollections.some((n) => n.toLowerCase() === o.name.toLowerCase())).map((o) => o.id);
            input.collectionIds = [...input.collectionIds, ...created];
            input.newCollections = [];
          }
        }
        firstId = ids[0];
        toast.success(`Saved ${ids.length} references`);
      } else {
        const { id } = await api<{ id: string }>("/api/app/references", {
          method: "POST",
          json: { input, images: ready.map(toPayload) },
        });
        firstId = id;
        toast.success("Reference saved", {
          action: { label: "View", onClick: () => router.push(`/references/${id}`) },
        });
      }

      saved.current = true;
      if (addAnother.current) {
        staged.clear();
        reset({ ...EMPTY, industry: input.industry, status: input.status });
        saved.current = false;
        window.scrollTo({ top: 0, behavior: "smooth" });
        router.refresh();
      } else {
        router.push(bulk && ready.length > 1 ? "/recent" : `/references/${firstId}`);
        router.refresh();
      }
    } catch (error) {
      applyServerErrors(error);
    } finally {
      addAnother.current = false;
    }
  };

  const onInvalid = () => {
    setSubmitError("Please fix the highlighted fields.");
    const first = document.querySelector("[aria-invalid=true]") as HTMLElement | null;
    first?.focus();
  };

  const interactions = watch("interactions") ?? [];
  const submitting = formState.isSubmitting;
  const readyCount = staged.images.filter((i) => i.status === "ready").length;

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate>
      {mode === "create" && (
        <Section id="screenshots" title="Screenshots" description="Upload screenshots or MP4 videos, or capture a public URL. The cover (star) is the gallery thumbnail; videos autoplay there.">
          <Tabs defaultValue="upload" className="gap-4">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="upload" className="flex-1 sm:flex-none">
                <Upload className="size-4" /> Upload
              </TabsTrigger>
              <TabsTrigger value="capture" className="flex-1 sm:flex-none">
                <Globe className="size-4" /> Capture from URL
              </TabsTrigger>
            </TabsList>
            <TabsContent value="upload">
              <DropZone onFiles={staged.addFiles} compact={staged.images.length > 0} label={staged.images.length ? "Add more screenshots" : undefined} />
            </TabsContent>
            <TabsContent value="capture">
              <CapturePanel onCaptured={onCaptured} />
            </TabsContent>
          </Tabs>
          <StagedImageList
            images={staged.images}
            onRemove={staged.remove}
            onReplace={staged.replace}
            onRetry={staged.retry}
            onMove={staged.move}
            onMeta={staged.updateMeta}
            onMakeCover={staged.makeCover}
          />
          {readyCount > 1 && (
            <label className="flex items-start gap-2.5 rounded-lg border bg-card px-3 py-2.5 text-meta">
              <Checkbox checked={bulk} onCheckedChange={(v) => setBulk(v === true)} className="mt-0.5" />
              <span>
                <span className="font-medium">Create a separate reference for each screenshot</span>
                <span className="block text-subtle-foreground">
                  Bulk import: every screenshot gets these details; titles use the screenshot label or a number.
                </span>
              </span>
            </label>
          )}
          {imageError && (
            <p className="text-meta text-destructive" role="alert">
              {imageError}
            </p>
          )}
        </Section>
      )}

      <Section id="basic" title="Basic information" description="Only the title, a screenshot and an industry are required. Everything else can be added later.">
        <Field label="Reference title" htmlFor="title" required error={errors.title?.message}>
          <Input id="title" {...register("title")} aria-invalid={!!errors.title} aria-describedby={errors.title ? "title-error" : undefined} placeholder="e.g. Asymmetric editorial hero" maxLength={200} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Website / brand name" htmlFor="siteName" error={errors.siteName?.message}>
            <Input id="siteName" {...register("siteName")} placeholder="e.g. Studio North" maxLength={200} />
          </Field>
          <Field label="Source URL" htmlFor="sourceUrl" hint="Strongly encouraged for attribution and traceability." error={errors.sourceUrl?.message}>
            <Input
              id="sourceUrl"
              {...register("sourceUrl", { onBlur: (e) => void checkSourceUrl(e.target.value.trim()) })}
              aria-invalid={!!errors.sourceUrl}
              aria-describedby={errors.sourceUrl ? "sourceUrl-error" : undefined}
              placeholder="https://"
              inputMode="url"
            />
          </Field>
        </div>
        {urlDuplicate.length > 0 && (
          <p className="flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2 text-meta">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              You already saved this URL as{" "}
              {urlDuplicate.map((d, i) => (
                <span key={d.id}>
                  {i > 0 && ", "}
                  <Link href={`/references/${d.id}`} target="_blank" className="underline underline-offset-2">
                    {d.title}
                  </Link>
                </span>
              ))}
              . You can still save another reference (for example, a different page or viewport).
            </span>
          </p>
        )}
        <Field label="Description" htmlFor="description" hint="A short, factual summary of what the screenshot shows.">
          <Textarea id="description" {...register("description")} rows={3} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Industry" htmlFor="industry" required error={errors.industry?.message}>
            <Controller
              control={control}
              name="industry"
              render={({ field }) => (
                <TermSelect
                  id="industry"
                  value={field.value}
                  onChange={(v) => {
                    field.onChange(v ?? "");
                    field.onBlur();
                  }}
                  options={termOptions.industry}
                  placeholder="Choose or create an industry"
                  aria-invalid={!!errors.industry}
                  aria-describedby={errors.industry ? "industry-error" : undefined}
                />
              )}
            />
          </Field>
          <Field label="Page type" htmlFor="pageType">
            <Controller
              control={control}
              name="pageType"
              render={({ field }) => (
                <TermSelect id="pageType" value={field.value} onChange={field.onChange} options={termOptions.page_type} placeholder="e.g. Product Detail Page" allowClear />
              )}
            />
          </Field>
        </div>
        <Field label="Additional industries" htmlFor="additionalIndustries">
          <Controller
            control={control}
            name="additionalIndustries"
            render={({ field }) => (
              <TermMultiPicker id="additionalIndustries" value={field.value ?? []} onChange={field.onChange} options={termOptions.industry} placeholder="Add related industries" />
            )}
          />
        </Field>
      </Section>

      <Section id="classification" title="Design classification" description="Independent classification systems. Describe what is visible.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Visual style" htmlFor="visualStyles">
            <Controller control={control} name="visualStyles" render={({ field }) => <TermMultiPicker id="visualStyles" value={field.value ?? []} onChange={field.onChange} options={termOptions.visual_style} placeholder="e.g. Editorial, Minimalist" />} />
          </Field>
          <Field label="Layout characteristics" htmlFor="layouts">
            <Controller control={control} name="layouts" render={({ field }) => <TermMultiPicker id="layouts" value={field.value ?? []} onChange={field.onChange} options={termOptions.layout} placeholder="e.g. Bento Grid, Split Screen" />} />
          </Field>
          <Field label="UI components" htmlFor="components">
            <Controller control={control} name="components" render={({ field }) => <TermMultiPicker id="components" value={field.value ?? []} onChange={field.onChange} options={termOptions.component} placeholder="e.g. Hero, Sticky CTA" />} />
          </Field>
          <Field label="Design tags" htmlFor="tags" hint="Reusable free tags. Duplicates are matched case-insensitively.">
            <Controller control={control} name="tags" render={({ field }) => <TermMultiPicker id="tags" value={field.value ?? []} onChange={field.onChange} options={termOptions.tag} placeholder="Add tags" />} />
          </Field>
        </div>
        <Field label="Screenshot type" required>
          <Controller control={control} name="screenshotType" render={({ field }) => <RadioRow name="Screenshot type" value={field.value ?? "full_page"} onChange={field.onChange} options={SCREENSHOT_TYPES} labels={LABELS.screenshotType} />} />
        </Field>
      </Section>

      <Section id="theme" title="Theme & responsive" description="The captured theme describes the screenshot. Dark mode support describes the source website. They are separate.">
        <Field label="Captured theme" required>
          <Controller control={control} name="capturedTheme" render={({ field }) => <RadioRow name="Captured theme" value={field.value ?? "unknown"} onChange={field.onChange} options={CAPTURED_THEMES} labels={LABELS.capturedTheme} />} />
        </Field>
        <Field label="Does the source website support dark mode?" required>
          <Controller control={control} name="supportsDarkMode" render={({ field }) => <RadioRow name="Dark mode support" value={field.value ?? "unknown"} onChange={field.onChange} options={DARK_MODE_SUPPORT} labels={LABELS.darkMode} />} />
        </Field>
        <Field label="Captured viewport" required hint="Per-screenshot viewport and dimensions are stored with each image.">
          <Controller control={control} name="capturedViewport" render={({ field }) => <RadioRow name="Captured viewport" value={field.value ?? "desktop"} onChange={field.onChange} options={VIEWPORTS} labels={LABELS.viewport} />} />
        </Field>
      </Section>

      <Section id="analysis" title="Design analysis" description="Keep observed facts separate from your interpretation. Inspiration is not copying.">
        <Field label="Observed information" htmlFor="observations" hint="Facts visible in the screenshot or verified from the source (grid, proportions, components present).">
          <Textarea id="observations" {...register("analysis.observations")} rows={3} />
        </Field>
        <Field label="What makes this design interesting?" htmlFor="interesting">
          <Textarea id="interesting" {...register("analysis.interesting")} rows={3} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Typography notes" htmlFor="typographyNotes" hint="Hierarchy, treatments, observed typefaces.">
            <Textarea id="typographyNotes" {...register("analysis.typographyNotes")} rows={3} />
          </Field>
          <Field label="Color notes" htmlFor="colorNotes" hint="Relationships, contrast, usage.">
            <Textarea id="colorNotes" {...register("analysis.colorNotes")} rows={3} />
          </Field>
          <Field label="Layout notes" htmlFor="layoutNotes" hint="Grid, spacing, alignment, hierarchy, composition.">
            <Textarea id="layoutNotes" {...register("analysis.layoutNotes")} rows={3} />
          </Field>
          <Field label="Interaction notes" htmlFor="interactionNotes" hint="Only behavior you observed or found documented.">
            <Textarea id="interactionNotes" {...register("analysis.interactionNotes")} rows={3} />
          </Field>
        </div>
        <Field
          label="Interaction & motion patterns"
          htmlFor="interactions"
          hint="Use the shield to mark a pattern as verified (observed live or documented). Never infer motion from a static screenshot."
        >
          <Controller
            control={control}
            name="interactions"
            render={({ field }) => {
              const list = field.value ?? [];
              return (
                <TermMultiPicker
                  id="interactions"
                  value={list.map((i) => i.name)}
                  onChange={(names) => field.onChange(names.map((n) => list.find((i) => i.name === n) ?? { name: n, verified: false }))}
                  verified={Object.fromEntries(interactions.map((i) => [i.name, Boolean(i.verified)]))}
                  onToggleVerified={(name) => field.onChange(list.map((i) => (i.name === name ? { ...i, verified: !i.verified } : i)))}
                  options={termOptions.interaction}
                  placeholder="e.g. Scroll Reveal, Sticky Elements"
                />
              );
            }}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="UX strengths" htmlFor="uxStrengths">
            <Textarea id="uxStrengths" {...register("analysis.uxStrengths")} rows={3} />
          </Field>
          <Field label="Potential limitations" htmlFor="limitations" hint="Accessibility, usability or implementation concerns.">
            <Textarea id="limitations" {...register("analysis.limitations")} rows={3} />
          </Field>
        </div>
        <Field label="How I might use this reference" htmlFor="usageIdeas" hint="Principles worth exploring in a future project — not elements to copy.">
          <Textarea id="usageIdeas" {...register("analysis.usageIdeas")} rows={3} />
        </Field>
        <Field label="AI-generated suggestions" htmlFor="aiSuggestions" hint="Machine-generated observations. Agents will treat these as unverified unless you mark them reviewed.">
          <Textarea id="aiSuggestions" {...register("analysis.aiSuggestions")} rows={2} />
          <Controller
            control={control}
            name="analysis.aiSuggestionsReviewed"
            render={({ field }) => (
              <label className="mt-1 flex items-center gap-2 text-meta text-muted-foreground">
                <Checkbox checked={Boolean(field.value)} onCheckedChange={(v) => field.onChange(v === true)} />I reviewed these suggestions
              </label>
            )}
          />
        </Field>
      </Section>

      <Section id="organization" title="Organization">
        <Field label="Collections" htmlFor="collections" hint="Choose existing collections or type a name to create one.">
          <Controller
            control={control}
            name="newCollections"
            render={({ field }) => (
              <TermMultiPicker id="collections" value={field.value ?? []} onChange={field.onChange} options={collections.map((c) => c.name)} placeholder="Add to collections" />
            )}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Status" required>
            <Controller control={control} name="status" render={({ field }) => <RadioRow name="Status" value={field.value ?? "to_review"} onChange={field.onChange} options={REFERENCE_STATUSES} labels={LABELS.status} />} />
          </Field>
          <Field label="Favorite">
            <Controller
              control={control}
              name="isFavorite"
              render={({ field }) => (
                <label className="flex h-9 items-center gap-2.5 text-meta">
                  <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                  <Heart className={cn("size-4", field.value && "fill-highlight text-highlight")} />
                  {field.value ? "In favorites" : "Not a favorite"}
                </label>
              )}
            />
          </Field>
        </div>
      </Section>

      <Section id="source" title="Source information" description="Designs belong to their creators. Record attribution and any usage notes.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Source attribution" htmlFor="attribution" hint="e.g. “Design by Studio North”">
            <Input id="attribution" {...register("attribution")} maxLength={500} />
          </Field>
          <Field label="Date captured" htmlFor="capturedAt">
            <Input id="capturedAt" type="date" {...register("capturedAt")} />
          </Field>
        </div>
        <Field label="Usage or licensing notes" htmlFor="licenseNotes">
          <Textarea id="licenseNotes" {...register("licenseNotes")} rows={2} />
        </Field>
        {timestamps && (
          <dl className="grid grid-cols-2 gap-4 text-meta">
            <div>
              <dt className="text-subtle-foreground">Date added</dt>
              <dd>{new Date(timestamps.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</dd>
            </div>
            <div>
              <dt className="text-subtle-foreground">Last updated</dt>
              <dd>{new Date(timestamps.updatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</dd>
            </div>
          </dl>
        )}
      </Section>

      <div className="sticky bottom-0 z-30 -mx-4 border-t bg-background/90 backdrop-blur-md sm:-mx-6 lg:-mx-8">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-6 lg:px-8">
          <p className="mr-auto min-w-0 text-meta text-muted-foreground" aria-live="polite">
            {submitError ? (
              <span className="text-destructive">{submitError}</span>
            ) : submitting ? (
              "Saving…"
            ) : dirty ? (
              "Unsaved changes"
            ) : (
              ""
            )}
          </p>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (!dirty || window.confirm("Discard your unsaved changes?")) {
                saved.current = true;
                router.back();
              }
            }}
          >
            Cancel
          </Button>
          {mode === "create" && (
            <Button type="submit" variant="outline" disabled={submitting} onClick={() => (addAnother.current = true)}>
              Save & add another
            </Button>
          )}
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="animate-spin" />}
            {mode === "create" ? "Save reference" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}

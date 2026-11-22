import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, ChevronLeft, ShieldCheck, Sparkles } from "lucide-react";
import { PageContainer } from "@/components/app/page-header";
import { ImageViewer } from "@/components/reference/image-viewer";
import { ReferenceActions } from "@/components/reference/reference-actions";
import { ScreenshotImage } from "@/components/reference/screenshot-image";
import { filtersToSearchParams, LABELS, type Filters } from "@/lib/domain";
import type { TermRef } from "@/lib/types";
import { formatDate } from "@/lib/api-client";
import { findRelated, getReference } from "@/server/repositories/references";

export async function generateMetadata({ params }: PageProps<"/references/[id]">): Promise<Metadata> {
  const ref = await getReference((await params).id);
  return { title: ref?.title ?? "Reference not found" };
}

function TermLinks({ terms, filterKey }: { terms: TermRef[]; filterKey: keyof Filters }) {
  if (!terms.length) return <span className="text-subtle-foreground">—</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {terms.map((t) => (
        <li key={t.slug}>
          <Link
            href={`/?${filtersToSearchParams({ [filterKey]: [t.slug] } as Partial<Filters>)}`}
            className="inline-flex h-6 items-center rounded-full border bg-background px-2.5 text-meta transition-colors hover:border-border-strong hover:bg-accent"
          >
            {t.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 py-2.5 text-meta">
      <dt className="text-subtle-foreground">{label}</dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
    </div>
  );
}

function Note({ label, children, tone }: { label: string; children: string | null; tone?: "observed" | "ai" }) {
  if (!children) return null;
  return (
    <div className="flex flex-col gap-1">
      <h4 className="flex items-center gap-1.5 text-micro font-medium uppercase text-subtle-foreground">
        {tone === "observed" && <ShieldCheck className="size-3.5 text-success" />}
        {tone === "ai" && <Sparkles className="size-3.5 text-warning" />}
        {label}
      </h4>
      <p className="text-body whitespace-pre-line text-foreground">{children}</p>
    </div>
  );
}

export default async function ReferencePage({ params }: PageProps<"/references/[id]">) {
  const { id } = await params;
  const ref = await getReference(id);
  if (!ref) notFound();
  const related = await findRelated(id, { limit: 8 });
  const a = ref.analysis;
  const curatorNotes = a && [a.interesting, a.typographyNotes, a.colorNotes, a.layoutNotes, a.interactionNotes, a.uxStrengths, a.limitations, a.usageIdeas].some(Boolean);

  return (
    <PageContainer className="max-w-[1680px]">
      <nav className="mb-4" aria-label="Breadcrumb">
        <Link href="/" className="inline-flex items-center gap-1 text-meta text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> All references
        </Link>
      </nav>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <ImageViewer images={ref.images} title={ref.title} />
        </div>

        <aside className="flex min-w-0 flex-col gap-6" aria-label="Reference details">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-micro">
              <span className="rounded bg-accent px-1.5 py-0.5 font-medium text-muted-foreground">{LABELS.status[ref.status]}</span>
              {ref.isSample && <span className="rounded bg-warning/15 px-1.5 py-0.5 font-medium">Sample data</span>}
              <span className="font-mono text-subtle-foreground">{ref.id}</span>
            </div>
            <h1 className="text-display font-semibold text-balance">{ref.title}</h1>
            <p className="text-body text-muted-foreground">
              {ref.siteName ?? ref.sourceDomain ?? "Unknown source"}
              {ref.sourceUrl && (
                <>
                  {" · "}
                  <a href={ref.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-foreground underline-offset-4 hover:underline">
                    {ref.sourceDomain ?? "Visit source"} <ArrowUpRight className="size-3.5" />
                  </a>
                </>
              )}
            </p>
            {ref.description && <p className="text-body text-foreground">{ref.description}</p>}
            <ReferenceActions reference={ref} />
          </div>

          <dl className="divide-y border-y">
            <MetaRow label="Industry">
              <TermLinks terms={[...(ref.industry ? [ref.industry] : []), ...ref.additionalIndustries]} filterKey="industry" />
            </MetaRow>
            <MetaRow label="Page type">{ref.pageType ? <TermLinks terms={[ref.pageType]} filterKey="pageType" /> : <span className="text-subtle-foreground">—</span>}</MetaRow>
            <MetaRow label="Visual style">
              <TermLinks terms={ref.visualStyles} filterKey="visualStyle" />
            </MetaRow>
            <MetaRow label="Layout">
              <TermLinks terms={ref.layouts} filterKey="layout" />
            </MetaRow>
            <MetaRow label="Components">
              <TermLinks terms={ref.components} filterKey="component" />
            </MetaRow>
            <MetaRow label="Interaction">
              {ref.interactions.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {ref.interactions.map((i) => (
                    <li key={i.slug}>
                      <Link
                        href={`/?interaction=${i.slug}`}
                        className="inline-flex h-6 items-center gap-1 rounded-full border bg-background px-2.5 text-meta hover:bg-accent"
                        title={i.verified ? "Verified: observed live or documented" : "Not verified"}
                      >
                        {i.verified && <ShieldCheck className="size-3 text-success" />}
                        {i.name}
                        {!i.verified && <span className="text-subtle-foreground">· unverified</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-subtle-foreground">—</span>
              )}
            </MetaRow>
            <MetaRow label="Tags">
              <TermLinks terms={ref.tags} filterKey="tag" />
            </MetaRow>
            <MetaRow label="Captured">
              {LABELS.screenshotType[ref.screenshotType]} · {LABELS.viewport[ref.capturedViewport]} · {LABELS.capturedTheme[ref.capturedTheme]} theme
            </MetaRow>
            <MetaRow label="Dark mode">Source supports dark mode: {LABELS.darkMode[ref.supportsDarkMode]}</MetaRow>
            {ref.collections.length > 0 && (
              <MetaRow label="Collections">
                <ul className="flex flex-wrap gap-x-3 gap-y-1">
                  {ref.collections.map((c) => (
                    <li key={c.id}>
                      <Link href={`/collections/${c.id}`} className="underline-offset-4 hover:underline">
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </MetaRow>
            )}
            <MetaRow label="Added">{formatDate(ref.createdAt)}</MetaRow>
            <MetaRow label="Updated">{formatDate(ref.updatedAt)}</MetaRow>
            {ref.capturedAt && <MetaRow label="Date captured">{ref.capturedAt}</MetaRow>}
            <MetaRow label="Attribution">{ref.attribution ?? (ref.siteName ? `Design by ${ref.siteName}` : "—")}</MetaRow>
            {ref.licenseNotes && <MetaRow label="Usage notes">{ref.licenseNotes}</MetaRow>}
          </dl>

          {(a?.observations || curatorNotes || a?.aiSuggestions) && (
            <section className="flex flex-col gap-5" aria-labelledby="analysis-title">
              <h2 id="analysis-title" className="text-title font-medium">
                Design analysis
              </h2>
              <Note label="Observed" tone="observed">
                {a?.observations ?? null}
              </Note>
              {curatorNotes && (
                <div className="flex flex-col gap-4 border-l-2 pl-4">
                  <p className="text-micro text-subtle-foreground">Curator notes — personal interpretation</p>
                  <Note label="Why it’s interesting">{a?.interesting ?? null}</Note>
                  <Note label="Typography">{a?.typographyNotes ?? null}</Note>
                  <Note label="Color">{a?.colorNotes ?? null}</Note>
                  <Note label="Layout">{a?.layoutNotes ?? null}</Note>
                  <Note label="Interaction">{a?.interactionNotes ?? null}</Note>
                  <Note label="UX strengths">{a?.uxStrengths ?? null}</Note>
                  <Note label="Limitations">{a?.limitations ?? null}</Note>
                  <Note label="How I might use this">{a?.usageIdeas ?? null}</Note>
                </div>
              )}
              {a?.aiSuggestions && (
                <div className="rounded-lg bg-warning/8 p-3">
                  <Note label={`AI suggestions · ${a.aiSuggestionsReviewed ? "reviewed" : "unreviewed"}`} tone="ai">
                    {a.aiSuggestions}
                  </Note>
                </div>
              )}
            </section>
          )}
        </aside>
      </div>

      <section className="mt-16" aria-labelledby="related-title">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h2 id="related-title" className="text-heading font-medium">
            Related references
          </h2>
          <p className="text-meta text-subtle-foreground">Matched on shared industry, page type, layout, style and components</p>
        </div>
        {related.length === 0 ? (
          <p className="rounded-xl border border-dashed px-6 py-10 text-center text-body text-muted-foreground">
            No closely related references yet. As you classify more references, meaningful matches will appear here.
          </p>
        ) : (
          <ul className="dv-grid">
            {related.map(({ reference: r, sharedTerms }) => (
              <li key={r.id} className="group relative flex flex-col gap-2">
                <div className="dv-canvas aspect-[4/3] overflow-hidden rounded-lg ring-1 ring-border transition group-hover:ring-border-strong">
                  {r.cover && (
                    <ScreenshotImage src={`/api/images/${r.cover.id}/thumb`} alt={`Screenshot of ${r.title}`} width={r.cover.thumbWidth} height={r.cover.thumbHeight} />
                  )}
                </div>
                <div>
                  <h3 className="truncate text-title font-medium">
                    <Link href={`/references/${r.id}`} className="after:absolute after:inset-0">
                      {r.title}
                    </Link>
                  </h3>
                  <p className="truncate text-meta text-muted-foreground">Shares {sharedTerms.slice(0, 3).map((t) => t.name).join(", ")}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  );
}

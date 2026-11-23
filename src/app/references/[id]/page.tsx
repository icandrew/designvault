import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, ChevronLeft, ShieldCheck, Sparkles } from "lucide-react";
import { DetailsDisclosure } from "@/components/reference/details-disclosure";
import { ReferenceActions } from "@/components/reference/reference-actions";
import { ReferenceGallery } from "@/components/reference/reference-gallery";
import { ScreenshotImage } from "@/components/reference/screenshot-image";
import { filtersToSearchParams, LABELS, type Filters } from "@/lib/domain";
import type { ReferenceDetail, TermRef } from "@/lib/types";
import { formatDate } from "@/lib/api-client";
import { findRelated, getReference } from "@/server/repositories/references";

export async function generateMetadata({ params }: PageProps<"/references/[id]">): Promise<Metadata> {
  const ref = await getReference((await params).id);
  return { title: ref?.title ?? "Reference not found" };
}

// ---------------------------------------------------------------- sidebar parts

function Chip({ href, title, children }: { href: string; title?: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      title={title}
      className="inline-flex h-6 items-center gap-1 rounded-full bg-accent/70 px-2.5 text-meta text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
    >
      {children}
    </Link>
  );
}

function TermChips({ terms, filterKey }: { terms: TermRef[]; filterKey: keyof Filters }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {terms.map((t) => (
        <li key={t.slug}>
          <Chip href={`/?${filtersToSearchParams({ [filterKey]: [t.slug] } as Partial<Filters>)}`}>{t.name}</Chip>
        </li>
      ))}
    </ul>
  );
}

/** One labelled field; renders nothing when empty so the sidebar stays light. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === false) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="text-micro text-subtle-foreground">{label}</dt>
      <dd className="min-w-0 text-meta text-foreground">{children}</dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean);
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-3.5 border-t pt-5 first:border-t-0 first:pt-0" aria-label={title}>
      <h2 className="text-micro font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
      <dl className="flex flex-col gap-3.5">{items}</dl>
    </section>
  );
}

function Note({ label, children, tone }: { label: string; children: string | null; tone?: "observed" | "ai" }) {
  if (!children) return null;
  return (
    <div className="flex flex-col gap-1">
      <h3 className="flex items-center gap-1.5 text-micro font-medium text-subtle-foreground">
        {tone === "observed" && <ShieldCheck className="size-3.5 text-success" />}
        {tone === "ai" && <Sparkles className="size-3.5 text-warning" />}
        {label}
      </h3>
      <p className="text-meta whitespace-pre-line text-foreground">{children}</p>
    </div>
  );
}

function ReferenceMetadata({ reference: ref }: { reference: ReferenceDetail }) {
  const industries = [...(ref.industry ? [ref.industry] : []), ...ref.additionalIndustries];
  const a = ref.analysis;
  const curatorNotes = a && [a.interesting, a.typographyNotes, a.colorNotes, a.layoutNotes, a.interactionNotes, a.uxStrengths, a.limitations, a.usageIdeas].some(Boolean);

  return (
    <div className="flex flex-col gap-5">
      <Group title="Classification">
        {industries.length > 0 && <Field key="industry" label="Industry"><TermChips terms={industries} filterKey="industry" /></Field>}
        {ref.pageType && <Field key="pageType" label="Page type"><TermChips terms={[ref.pageType]} filterKey="pageType" /></Field>}
        {ref.visualStyles.length > 0 && <Field key="style" label="Visual style"><TermChips terms={ref.visualStyles} filterKey="visualStyle" /></Field>}
        {ref.layouts.length > 0 && <Field key="layout" label="Layout"><TermChips terms={ref.layouts} filterKey="layout" /></Field>}
        {ref.components.length > 0 && <Field key="components" label="Components"><TermChips terms={ref.components} filterKey="component" /></Field>}
        {ref.interactions.length > 0 && (
          <Field key="interaction" label="Interaction">
            <ul className="flex flex-wrap gap-1.5">
              {ref.interactions.map((i) => (
                <li key={i.slug}>
                  <Chip href={`/?interaction=${i.slug}`} title={i.verified ? "Verified: observed live or documented" : "Not verified"}>
                    {i.verified && <ShieldCheck className="size-3 text-success" />}
                    {i.name}
                    {!i.verified && <span className="text-subtle-foreground">· unverified</span>}
                  </Chip>
                </li>
              ))}
            </ul>
          </Field>
        )}
        {ref.tags.length > 0 && <Field key="tags" label="Tags"><TermChips terms={ref.tags} filterKey="tag" /></Field>}
      </Group>

      <Group title="Capture">
        <Field key="captured" label="Captured">
          {LABELS.screenshotType[ref.screenshotType]} · {LABELS.viewport[ref.capturedViewport]} · {LABELS.capturedTheme[ref.capturedTheme]} theme
        </Field>
        <Field key="dark" label="Dark mode support">{LABELS.darkMode[ref.supportsDarkMode]}</Field>
        {ref.capturedAt && <Field key="capturedAt" label="Date captured">{ref.capturedAt}</Field>}
        <Field key="count" label="Media">
          {ref.images.length} {ref.images.length === 1 ? "item" : "items"}
          {ref.videoCount > 0 && ` · ${ref.videoCount} ${ref.videoCount === 1 ? "video" : "videos"}`}
        </Field>
      </Group>

      {ref.collections.length > 0 && (
        <Group title="Collections">
          <Field key="collections" label="In">
            <ul className="flex flex-wrap gap-1.5">
              {ref.collections.map((c) => (
                <li key={c.id}>
                  <Chip href={`/collections/${c.id}`}>{c.name}</Chip>
                </li>
              ))}
            </ul>
          </Field>
        </Group>
      )}

      {(a?.observations || curatorNotes || a?.aiSuggestions) && (
        <section className="flex flex-col gap-4 border-t pt-5" aria-labelledby="analysis-title">
          <h2 id="analysis-title" className="text-micro font-medium tracking-wide text-muted-foreground uppercase">
            Design analysis
          </h2>
          <Note label="Observed" tone="observed">
            {a?.observations ?? null}
          </Note>
          {curatorNotes && (
            <div className="flex flex-col gap-3.5 border-l-2 pl-3.5">
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

      <Group title="Details">
        <Field key="added" label="Added">{formatDate(ref.createdAt)}</Field>
        <Field key="updated" label="Updated">{formatDate(ref.updatedAt)}</Field>
        <Field key="attribution" label="Attribution">{ref.attribution ?? (ref.siteName ? `Design by ${ref.siteName}` : "—")}</Field>
        {ref.licenseNotes && <Field key="license" label="Usage notes">{ref.licenseNotes}</Field>}
        <Field key="id" label="Reference ID">
          <span className="font-mono text-micro text-muted-foreground">{ref.id}</span>
        </Field>
      </Group>
    </div>
  );
}

// ---------------------------------------------------------------- page

export default async function ReferencePage({ params }: PageProps<"/references/[id]">) {
  const { id } = await params;
  const ref = await getReference(id);
  if (!ref) notFound();
  const related = await findRelated(id, { limit: 8 });
  const source = ref.siteName ?? ref.sourceDomain;

  return (
    <div className="mx-auto w-full max-w-[1920px] px-4 pt-4 pb-16 sm:px-6 lg:px-8">
      {/* Minimal contextual navigation; the global header and sidebar stay as they are. */}
      <nav className="mb-4 flex min-w-0 items-center gap-2 text-meta" aria-label="Breadcrumb">
        <Link href="/" className="inline-flex shrink-0 items-center gap-1 rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <ChevronLeft className="size-4" /> All references
        </Link>
        {source && (
          <>
            <span className="text-subtle-foreground" aria-hidden>
              /
            </span>
            <span className="truncate text-subtle-foreground">{source}</span>
          </>
        )}
      </nav>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_clamp(272px,24%,360px)] lg:gap-10 xl:gap-14">
        {/* Details: right on desktop (sticky, never scrolls away); above the images on smaller screens. */}
        <aside className="min-w-0 lg:col-start-2 lg:row-start-1" aria-label="Reference details">
          <div className="scrollbar-thin flex flex-col gap-5 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-2 lg:pb-8">
            <header className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-2 text-micro">
                <span className="rounded-full bg-accent px-2 py-0.5 font-medium text-muted-foreground">{LABELS.status[ref.status]}</span>
                {ref.isSample && <span className="rounded-full bg-warning/15 px-2 py-0.5 font-medium">Sample data</span>}
              </div>
              <h1 className="text-heading font-semibold tracking-tight text-balance sm:text-display lg:text-heading xl:text-display">{ref.title}</h1>
              <p className="flex flex-wrap items-center gap-x-1.5 text-meta text-muted-foreground">
                <span>{source ?? "Unknown source"}</span>
                {ref.sourceUrl && (
                  <>
                    <span aria-hidden>·</span>
                    <a
                      href={ref.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {ref.sourceDomain ?? "Visit source"}
                      <ArrowUpRight className="size-3.5" />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </>
                )}
              </p>
              {ref.description && <p className="text-meta leading-relaxed text-foreground">{ref.description}</p>}
            </header>
            <ReferenceActions reference={ref} />
            <DetailsDisclosure>
              <ReferenceMetadata reference={ref} />
            </DetailsDisclosure>
          </div>
        </aside>

        <section className="min-w-0 lg:col-start-1 lg:row-start-1" aria-label={`${ref.title} — screenshots`}>
          <ReferenceGallery images={ref.images} title={ref.title} />
        </section>
      </div>

      <section className="mt-20" aria-labelledby="related-title">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
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
    </div>
  );
}

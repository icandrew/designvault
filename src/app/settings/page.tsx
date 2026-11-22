import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { AgentAccess } from "@/components/settings/agent-access";
import { ExportButton, SampleDataControls } from "@/components/settings/data-settings";
import { Preferences } from "@/components/settings/preferences";
import { TaxonomyManager } from "@/components/settings/taxonomy-manager";
import { formatBytes } from "@/lib/api-client";
import { asDensity, asView, DENSITY_COOKIE, VIEW_COOKIE } from "@/lib/prefs";
import { getConfig } from "@/server/config";
import { getLibraryStats } from "@/server/repositories/references";
import { getApiKey } from "@/server/repositories/settings";
import { listTerms } from "@/server/repositories/taxonomy";
import { getStorage } from "@/server/storage";

export const metadata: Metadata = { title: "Settings" };

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="grid scroll-mt-20 gap-x-10 gap-y-5 border-t py-10 first:border-t-0 first:pt-0 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div>
        <h2 id={`${id}-title`} className="text-title font-medium">
          {title}
        </h2>
        <p className="mt-1 text-meta text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  const store = await cookies();
  const h = await headers();
  const [terms, apiKey, stats, usage] = await Promise.all([listTerms(), getApiKey(), getLibraryStats(), getStorage().usage()]);
  const config = getConfig();
  const host = h.get("host") ?? "127.0.0.1:3000";
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${host}`;

  return (
    <PageContainer className="max-w-6xl">
      <PageHeader title="Settings" description="Preferences, classifications, agent access and your data." />
      <nav aria-label="Settings sections" className="scrollbar-none -mx-1 mb-8 flex gap-1 overflow-x-auto px-1">
        {[
          ["preferences", "Preferences"],
          ["taxonomy", "Categories & tags"],
          ["agents", "Agent access"],
          ["data", "Data & storage"],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="h-8 shrink-0 rounded-full border px-3 text-meta leading-8 text-muted-foreground hover:bg-accent hover:text-foreground">
            {label}
          </a>
        ))}
      </nav>

      <Section id="preferences" title="Preferences" description="Remembered on this device.">
        <Preferences view={asView(store.get(VIEW_COOKIE)?.value)} density={asDensity(store.get(DENSITY_COOKIE)?.value)} />
      </Section>

      <Section id="taxonomy" title="Categories & tags" description="Edit the vocabulary used to classify references. Duplicate names are prevented regardless of capitalization.">
        <TaxonomyManager terms={terms} />
      </Section>

      <Section id="agents" title="Agent access" description="Let Claude Code and other AI agents search and read your vault. Access is read-only.">
        <AgentAccess apiKey={apiKey.key} source={apiKey.source} projectDir={process.cwd()} origin={origin} />
      </Section>

      <Section id="data" title="Data & storage" description="Everything is stored locally on this computer.">
        <div className="flex flex-col gap-6">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["References", stats.references],
              ["Screenshots", stats.images],
              ["Favorites", stats.favorites],
              ["Image storage", formatBytes(usage.bytes)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border bg-card p-4">
                <dt className="text-micro text-subtle-foreground">{label}</dt>
                <dd className="mt-1 text-heading font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-1 text-meta">
            <span className="text-subtle-foreground">Data folder</span>
            <code className="w-fit max-w-full truncate rounded bg-muted px-2 py-1 font-mono text-micro">{config.dataDir}</code>
            <span className="text-micro text-subtle-foreground">Contains vault.db (metadata) and storage/ (originals, previews and thumbnails stored separately).</span>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-meta font-medium">Backup & export</p>
            <p className="text-meta text-muted-foreground">
              For a complete backup (database + all images), run <code className="rounded bg-muted px-1 font-mono text-micro">npm run backup</code> in the project
              folder. Restore with <code className="rounded bg-muted px-1 font-mono text-micro">npm run restore -- &lt;backup-folder&gt;</code> while the app is stopped. The
              JSON export below contains metadata only.
            </p>
            <div>
              <ExportButton />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-meta font-medium">Sample data</p>
            <p className="text-meta text-muted-foreground">
              Generated wireframe references labelled “Sample”, kept separate from your own records. {stats.samples ? `${stats.samples} currently loaded.` : ""}
            </p>
            <SampleDataControls samples={stats.samples} />
          </div>
        </div>
      </Section>
    </PageContainer>
  );
}

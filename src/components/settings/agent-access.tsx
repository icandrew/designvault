"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative">
      <pre className="overflow-x-auto rounded-lg border bg-muted px-4 py-3 pr-12 font-mono text-micro leading-relaxed text-foreground">{code}</pre>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={async () => {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute top-2 right-2 grid size-7 place-items-center rounded-md bg-background text-muted-foreground ring-1 ring-border hover:text-foreground"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

export function AgentAccess({
  apiKey,
  source,
  projectDir,
  origin,
}: {
  apiKey: string;
  source: "env" | "settings";
  projectDir: string;
  origin: string;
}) {
  const [key, setKey] = useState(apiKey);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const masked = `${key.slice(0, 6)}${"•".repeat(18)}${key.slice(-4)}`;
  const dir = projectDir.replace(/\\/g, "/");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-meta font-medium">Read-only API key</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-3 py-2 font-mono text-meta" aria-label="API key">
            {reveal ? key : masked}
          </code>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" className="size-9" aria-label={reveal ? "Hide key" : "Reveal key"} onClick={() => setReveal((r) => !r)}>
              {reveal ? <EyeOff /> : <Eye />}
            </Button>
            <Button
              variant="outline"
              className="h-9"
              onClick={async () => {
                await navigator.clipboard.writeText(key);
                toast.success("API key copied");
              }}
            >
              <Copy /> Copy
            </Button>
            <Button
              variant="outline"
              className="h-9"
              disabled={busy || source === "env"}
              title={source === "env" ? "The key is set by DESIGN_VAULT_API_KEY in your environment file." : undefined}
              onClick={async () => {
                if (!window.confirm("Generate a new key? Agents using the old key will stop working until updated.")) return;
                setBusy(true);
                try {
                  const res = await api<{ key: string }>("/api/app/settings", { method: "POST", json: { action: "regenerate_api_key" } });
                  setKey(res.key);
                  setReveal(true);
                  toast.success("New API key generated");
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Regenerate
            </Button>
          </div>
        </div>
        <p className="text-micro text-subtle-foreground">
          {source === "env" ? "Set by DESIGN_VAULT_API_KEY in .env.local." : "Stored in your local database."} The key grants read-only access to
          references, collections, taxonomy and images. There is no write access through the API or MCP server.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-meta font-medium">Connect Claude Code (MCP)</p>
        <p className="text-meta text-muted-foreground">
          Run this once in any terminal. It registers the local <code className="font-mono">design-vault</code> MCP server for all your Claude Code projects
          (user scope). The MCP server reads the database directly, so the web app does not need to be running.
        </p>
        <CodeBlock label="MCP command" code={`claude mcp add design-vault --scope user -- node "${dir}/mcp/start.mjs"`} />
        <p className="text-micro text-subtle-foreground">Then restart Claude Code and run /mcp to confirm “design-vault” is connected.</p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-meta font-medium">Install the Claude Code skill</p>
        <p className="text-meta text-muted-foreground">Copies the design-reference workflow skill into your personal skills folder so every project can use it.</p>
        <CodeBlock label="skill install command" code={`npm --prefix "${dir}" run skill:install`} />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-meta font-medium">REST API</p>
        <CodeBlock
          label="REST example"
          code={`curl -H "Authorization: Bearer ${reveal ? key : "<your-api-key>"}" "${origin}/api/search?q=premium+pet+care+product+page&limit=5"`}
        />
        <p className="text-micro text-subtle-foreground">
          Endpoints: /api/references, /api/references/:id, /api/references/:id/images, /api/references/:id/context, /api/collections, /api/collections/:id,
          /api/taxonomy, /api/search. Full documentation: docs/API.md in the project folder.
        </p>
      </div>
    </div>
  );
}

# Using Design Vault with Claude Code

Design Vault gives Claude Code (and other AI agents) read-only access to your saved design references, so new websites can be grounded in evidence you curated — while staying original.

There are three pieces:

1. **MCP server `design-vault`** — tools Claude Code can call directly (search, context, screenshots, collections). Recommended.
2. **Claude Code skill `design-vault-references`** — teaches Claude *when* and *how* to use the vault (brief → search → analyse → direction → original build → evaluate).
3. **REST API** — for other tools and scripts. See [API.md](API.md).

---

## 1. Connect the MCP server (one time)

You need [Claude Code](https://docs.claude.com/en/docs/claude-code) installed. Open any terminal and run (replace the path with your Design Vault folder — Settings → Agent access shows the exact command for your computer):

```powershell
claude mcp add design-vault --scope user -- node "D:/design-vault/mcp/start.mjs"
```

- `--scope user` makes it available in **all** your projects.
- The server reads the vault database directly in read-only mode. **The web app does not need to be running.**
- Restart Claude Code, then type `/mcp`. You should see `design-vault` as connected.

To remove it later: `claude mcp remove design-vault --scope user`.

**Online vault (Vercel):** the same MCP server can read your hosted vault if you pass the Turso and Blob settings with `-e` (use a read-only Turso token). Agents can also use the REST API at your site's address with the API key. See [DEPLOY-VERCEL.md](DEPLOY-VERCEL.md#connect-claude-code-to-the-online-vault-optional).

### Tools

| Tool | What it returns |
| --- | --- |
| `search_design_references` | Compact, ranked results for a brief and/or filters, with relevance reasons and IDs |
| `get_reference_context` | Compact analysis: classification, observed facts, curator notes, reusable principles, limitations, AI suggestions (flagged unverified), screenshot list |
| `get_design_reference` | The full structured record |
| `get_reference_images` | Actual screenshot images. Tall full-page captures are split into top-to-bottom segments sized for vision models. For MP4 videos it returns the poster frame plus a note (duration, size) — motion itself can't be sent, so agents rely on interaction notes |
| `find_similar_references` | References sharing industry, page type, layout, style or components |
| `list_design_collections` | Collections and project moodboards (with briefs) |
| `get_collection_references` | Ordered references in a collection with "why selected" notes |
| `get_design_patterns` | Examples of a component, layout, interaction or style; `verifiedOnly` excludes unverified motion |
| `list_design_taxonomy` | Valid classification values with usage counts |

All tools are annotated read-only, and the database connection itself rejects writes (`PRAGMA query_only`).

## 2. Install the skill

```powershell
npm --prefix "D:/design-vault" run skill:install
```

This copies `claude/skills/design-vault-references` to `~/.claude/skills/`, so it works in every project. To install it into one project only:

```powershell
npm --prefix "D:/design-vault" run skill:install -- "D:/path/to/your/project"
```

Claude Code picks the skill automatically for new sites, redesigns and major sections. You can also ask for it explicitly: *"Use my Design Vault references for this."* It is designed **not** to search the vault for bug fixes or small tweaks.

## 3. Try it from another project

Open Claude Code in a different folder and ask:

> Create a premium website for a pet care brand selling conditioning shampoo for dogs and cats. Use my Design Vault references.

Claude should:

1. Identify industry, audience, positioning, page types and visual direction.
2. Check moodboards, then call `search_design_references` (e.g. industry *Pet Care*, page type *Product Detail Page*).
3. Pick 3–6 references, read `get_reference_context`, and load screenshots only where visual detail matters.
4. Write a short design direction citing `ref_…` IDs: why each is relevant, which principles it adapts, and what is original.
5. Build an original implementation — no copied layouts, branding, copy or assets.
6. Evaluate the result against the direction.

Other useful prompts:

- "What hero sections do I have saved with oversized typography?"
- "Show me dark-themed SaaS dashboards from my vault."
- "Find verified sticky purchase bars on mobile."
- "Use my 'Pet care research' moodboard for this landing page."

## Verifying the integration automatically

`npm run test:mcp` starts the MCP server **from a different working directory** (your temp folder), exactly as Claude Code does, connects over stdio, and calls every tool against your real vault. `npm test` includes an in-memory MCP test suite (tool list is read-only, search returns stored data, image content is returned, writes are rejected).

## Evidence model

Every reference separates:

- **Observed information** — facts visible in the screenshot or verified from the source.
- **Curator notes** — your personal assessment and interpretation.
- **AI-generated suggestions** — optional machine observations, flagged unreviewed until you tick "I reviewed these suggestions".

Interaction patterns carry a `verified` flag. Only mark one verified if you observed it live or it is documented — never inferred from a screenshot. Agents are instructed to treat unverified interactions and AI suggestions as non-evidence, and to cite reference IDs and source URLs so every design decision is traceable.

## Token efficiency

- Search returns compact summaries (no notes, no images) with pagination (`limit`, `offset`).
- Context responses omit empty fields and are cached per reference until it changes.
- Images are only sent by `get_reference_images`, sized for vision models, with `mode: "top"` for first-screen-only.

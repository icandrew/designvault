# Design Vault

A personal, curated visual inspiration library — and a design-reference system your AI agents can use.

Save screenshots of websites, layouts and UI components, describe what you observe and what you think, organize them into collections, and let Claude Code search those references (with real metadata and real screenshots) before it designs something new — so its work is grounded in your taste and stays original.

- **Image-first gallery** with masonry/grid views, density control, search and combinable filters
- **Structured references**: independent classifications (industry, page type, components, visual style, layout, interaction), captured theme vs. dark-mode support, viewport, multiple screenshots per reference
- **Evidence model**: observed facts, curator notes and AI suggestions are kept separate; interactions are only "verified" when observed or documented
- **Collections & project moodboards** with a website brief and "why selected" notes
- **Add by upload or by URL** (optional Playwright capture with desktop/tablet/mobile and light/dark variants)
- **Read-only REST API**, **MCP server** and a **Claude Code skill**
- Local-first: SQLite + files on your disk. No cloud services, no paid APIs.

---

## Quick start (no coding experience needed)

### 1. Install the prerequisites (once)

- **Node.js 22 or newer** — download the LTS installer from [nodejs.org](https://nodejs.org) and run it. Design Vault uses Node's built-in SQLite, so nothing else (no database server) is needed.
- A terminal: on Windows use **PowerShell** (Start menu → "PowerShell"). On macOS use **Terminal**.

### 2. Install Design Vault

In the terminal, go to the project folder and install the dependencies:

```powershell
cd D:\design-vault
```

```powershell
npm install
```

Optional — only needed if you want to capture screenshots from a URL:

```powershell
npx playwright install chromium
```

### 3. Start the app

```powershell
npm run dev
```

Open **http://127.0.0.1:3000** in your browser. Leave the terminal open while you use the app; press `Ctrl+C` in it to stop.

The first start creates the database automatically in the `data` folder. No setup or "migrations" are required — they run by themselves.

> Want to look around first? On the empty home page, click **Explore with sample data**. Sample references are clearly labelled and can be removed in **Settings → Data & storage**.

For a faster, production-style run: `npm run build` once, then `npm start`.

---

## Using the app

| Section | What it does |
| --- | --- |
| **All references** | The gallery. Search (press `/`), open **Filters**, sort, switch masonry/grid and comfortable/compact |
| **Explore** | Browse by industry, page type, component, layout, style and interaction |
| **Collections** | Curated groups and **project moodboards** (with a brief and per-reference notes) |
| **Favorites** | Everything you hearted |
| **Recently added** | Newest first, grouped by day |
| **Settings** | Theme and gallery preferences, category & tag management, agent access (API key, MCP setup), data/backup |

**Pasting from the clipboard**: copy an image anywhere (e.g. right-click → *Copy image* on Dribbble) and press `Ctrl+V` (`⌘V` on Mac) on any Design Vault page. On the gallery it opens *Add reference* with the image attached; on the Add/Edit pages it's added to the screenshots. The *Paste image* button does the same. Formats other than PNG/JPEG/WebP (e.g. GIF) are converted to PNG automatically.

**Videos (MP4)**: drop or choose `.mp4` files (up to 200 MB) next to screenshots — great for hover effects, scroll animations and transitions. Your browser grabs a preview frame during upload (no extra software needed); the MP4 itself is stored untouched. If a video is the cover, its gallery thumbnail plays automatically — muted, looping, and only while visible (with *Reduce motion* turned on in your OS it plays on hover instead). Filter with *Filters → Media → Includes video*. If your browser can't play a video's codec, export it as H.264 MP4.

**Choosing the cover**: the cover is the gallery thumbnail. Click the ☆ star on any screenshot or video — while adding a reference or on its Edit page — to make it the cover.

**Adding a reference** (Add reference button): drop, choose or paste one or more screenshots or videos (or capture a URL), then fill in what you know. Only a **title**, a **screenshot** and an **industry** are required — everything else can be added later. Use *Save & add another* for quick batches, or tick *Create a separate reference for each screenshot* to bulk-import.

**Reference page**: zoom (`+`/`-`), fit width (`0`), fit to screen, fullscreen (`F`), switch screenshots (`←`/`→`), open or download the original, copy the ID / source URL / a structured summary, add to collections, edit, delete. Related references only appear when they share meaningful metadata.

**Application theme vs. reference theme**: the light/dark/system switch changes the Design Vault interface only. Screenshots and their *captured theme* classification are never changed.

---

## Connecting Claude Code

Full guide: **[docs/AGENTS.md](docs/AGENTS.md)**. In short:

1. Register the MCP server (once; works in every project, the app doesn't need to be running):

   ```powershell
   claude mcp add design-vault --scope user -- node "D:/design-vault/mcp/start.mjs"
   ```

2. Install the skill:

   ```powershell
   npm run skill:install
   ```

3. Restart Claude Code, check `/mcp`, and ask in any project: *"Create a premium website for a pet care brand selling conditioning shampoo. Use my Design Vault references."*

Claude will search your vault, read the context of a few relevant references, look at screenshots where needed, write a short reference-backed design direction citing `ref_…` IDs, and then build something original.

REST API documentation: **[docs/API.md](docs/API.md)** (the key is in Settings → Agent access, or run `npm run api-key`).

---

## Putting it online (Vercel)

Design Vault can also run on Vercel with a login password. It then stores references in a Turso database and screenshots and videos in private Vercel Blob storage, and switches automatically when those settings are present. Follow **[docs/DEPLOY-VERCEL.md](docs/DEPLOY-VERCEL.md)**: import the repo, set `DESIGN_VAULT_PASSWORD`, connect Blob and Turso from Vercel's Storage tab, and redeploy. `npm run hosted:import -- .env.hosted` copies your local references into the online vault.

---

## Backup and restore

Everything lives in the `data` folder: `vault.db` (all metadata) and `storage/` (originals, previews and thumbnails stored separately).

- **Back up** (safe while the app runs):

  ```powershell
  npm run backup
  ```

  Creates `backups/<date-time>/` with a consistent copy of the database and all images. Copy that folder to an external drive or cloud folder. To write elsewhere: `npm run backup -- "E:\Backups"`.

- **Restore**: stop the app (and close Claude Code sessions using the vault), then:

  ```powershell
  npm run restore -- "backups\2026-11-23T10-00-00-000Z"
  ```

  Your current data is moved aside to `data-before-restore-<date>` first, never deleted.

- **Export metadata** as JSON: Settings → Data & storage → *Export metadata*.

---

## Configuration

Optional. Copy `.env.example` to `.env.local` and edit. Environment variables are simply settings read at startup:

| Setting | Default | Purpose |
| --- | --- | --- |
| `DESIGN_VAULT_DATA_DIR` | `data` | Where the database and images live |
| `DESIGN_VAULT_API_KEY` | auto-generated | Fixed read-only key for agents |
| `DESIGN_VAULT_MAX_UPLOAD_MB` | `25` | Screenshot size limit |
| `DESIGN_VAULT_MAX_VIDEO_MB` | `200` | MP4 video size limit |
| `DESIGN_VAULT_CAPTURE_TIMEOUT_MS` | `30000` | URL capture page-load timeout |
| `DESIGN_VAULT_PASSWORD` | — | Login password (required on Vercel; optional locally) |
| `DESIGN_VAULT_PUBLIC_VIEW` | `false` | `true` lets signed-out visitors browse (view-only) |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | — | Hosted database (online vault) |
| `BLOB_READ_WRITE_TOKEN` | — | Hosted file storage (online vault) |

Restart the app after changing them.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app (development) at http://127.0.0.1:3000 |
| `npm run build` / `npm start` | Production build / start |
| `npm run backup` / `npm run restore -- <folder>` | Full backup / restore |
| `npm run api-key` | Show the agent API key (`-- --regenerate` to rotate) |
| `npm run mcp` | Run the MCP server manually (Claude Code normally starts it) |
| `npm run skill:install` | Install the Claude Code skill |
| `npm test` | Unit & integration tests (data layer, security, agent search, MCP) |
| `npm run test:e2e` | End-to-end browser tests (isolated test vault) |
| `npm run test:mcp` | Connect to the MCP server like Claude Code and call every tool on your real vault |
| `npm run test:libsql` | Run the unit tests on the libSQL engine used by hosted (Turso) vaults |
| `npm run hosted:import -- .env.hosted` | Copy your local vault into a hosted (Vercel) vault |
| `npm run typecheck` / `npm run lint` | Static checks |
| `npm run db:generate` | Create a migration after changing `src/server/db/schema.ts` (developers) |

---

## Architecture

```
src/
  app/                      Next.js App Router pages and route handlers
    page.tsx, explore/, collections/, favorites/, recent/, settings/, references/
    api/app/*               Write endpoints for the UI (same-origin only)
    api/references, api/collections, api/taxonomy, api/search
                            Read-only agent REST API (API key)
    api/images/[id]/[variant]  Image delivery (thumb | preview | original)
  components/
    app/        shell, sidebar, header, search, theme
    gallery/    masonry gallery, cards, toolbar, filters, empty states
    reference/  form, uploader, URL capture, viewer, dialogs
    collections/, settings/, ui/ (shadcn/ui)
  lib/          shared domain types, Zod schemas, masonry layout, API client
  server/
    db/         Drizzle schema, node:sqlite client, migrations runner, seed
    repositories/  references, collections, taxonomy, settings (all data access)
    storage/    StorageDriver interface + local filesystem driver
    images.ts   signature validation, thumbnails/previews (sharp), hashes
    agent.ts    agent search ranking + compact context (REST and MCP)
    mcp-tools.ts  MCP tool definitions
    capture.ts, net-guard.ts  Playwright capture with SSRF protection
mcp/            MCP server entry (stdio) and launcher
claude/skills/  The Claude Code skill
drizzle/        SQL migrations
tests/unit      Vitest     tests/e2e  Playwright
```

**Key decisions**

- **Persistence behind repositories.** Pages, API routes and the MCP server only call `src/server/repositories/*`. `db/client.ts` has two engines with the same schema and migrations: local `node:sqlite` and hosted libSQL/Turso over HTTPS. Images go through the `StorageDriver` interface, which has local-disk and private Vercel Blob drivers; staged uploads follow the same split.
- **SQLite via Node's built-in `node:sqlite`** (no native build step) with Drizzle ORM and generated SQL migrations that apply automatically on startup. WAL mode lets the app and the MCP server read concurrently.
- **One taxonomy table, many classification systems.** `terms(kind, name, slug)` with a unique `(kind, slug)` index prevents case-insensitive duplicates while keeping industry, page type, components, style, layout, interaction and tags independent.
- **Images**: originals are stored untouched; a ≤720 px gallery thumbnail (tall pages cropped from the top to 1:2) and a ≤1800 px preview (never upscaled) are generated with `sharp`. Replacing or deleting an image removes its files — no orphans.
- **Masonry without layout shift.** Card positions are precomputed (shortest column) for every column count as linear functions of the column width; CSS container queries pick the right set. The server render is exact, and DOM order — and therefore keyboard/reading order — stays chronological.
- **Search** is metadata-based (a denormalized `search_text` column + structured filters). The agent search adds vocabulary matching and explainable ranking. Semantic or visual similarity search can be added later as another ranking source.
- **Request-time rendering.** The app reads fresh local data on each request; preferences (view, density, sidebar, theme) live in cookies so the first paint is correct, without theme flashing.

Security model and what to change before exposing the app publicly: **[docs/SECURITY.md](docs/SECURITY.md)**.

## Testing

- `npm test` — 37 tests (`npm run test:libsql` runs the same suite on the hosted database engine): reference CRUD, deletes leaving no orphaned rows, login sessions, multiple images and file cleanup, persistence across restarts, keyword search and combined filters, collections, favorites, case-insensitive tags, upload signature validation, storage traversal protection, SSRF guard, agent ranking and evidence separation, and the MCP server (read-only tool list, real search results, image content, collections, verified interactions, writes rejected).
- `npm run test:e2e` — builds the app and drives it in Chromium against an isolated `test-data/e2e` vault: empty state, upload with validation, persistence after reload, viewer, edit, search, filters, favorites, collections with notes, REST API auth, URL capture, theme switching, no horizontal overflow at 360–1920 px, mobile navigation, delete with confirmation.

## Roadmap (architected for, not built)

Semantic and visual-similarity search, automated classification suggestions, color palette extraction, OCR indexing, a browser extension, drag-and-drop moodboard boards, Markdown/Obsidian export, cloud deployment and multi-user collaboration.

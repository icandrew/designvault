# Putting Design Vault online with Vercel

Design Vault normally runs on your own computer. This guide puts it on the internet, so you can open your vault from any browser, with a password only you know.

Your local copy keeps working exactly as before. The online vault is a **separate vault**, and you can copy your existing references into it (step 6).

## How it works online

Vercel's servers don't keep files, so the online vault stores things in two free services that plug into Vercel:

| What | Where it's stored online | On your computer |
| --- | --- | --- |
| References, notes, collections, tags | **Turso** — a hosted version of the same SQLite database | `data/vault.db` |
| Screenshots and videos | **Vercel Blob** — private file storage | `data/storage/` |

The app switches automatically: when it finds the Turso and Blob settings, it uses them. Otherwise it uses the local folder.

What's different online:

- **Login required.** Every page asks for your password. Agents use the API key instead.
- **Uploads go straight to storage.** Your browser sends files directly to Vercel Blob, so big screenshots and videos (up to 200 MB) work.
- **No "Capture from URL".** It needs a full browser on the server, which Vercel doesn't provide. Upload or paste screenshots instead.
- **No `npm run backup`.** Turso keeps automatic backups of the database. Use *Settings → Export metadata* for a JSON copy.

## What you need

- Your GitHub repository with this code (already done: `icandrew/designvault`).
- A free [Vercel](https://vercel.com) account, signed in with GitHub.
- About 10 minutes.

The free plans of Vercel, Vercel Blob and Turso are enough for a personal vault. Check each service's pricing page for current limits.

---

## Step 1 — Import the project

1. Go to **vercel.com → Add New… → Project**.
2. Find **designvault** in the list of GitHub repositories and click **Import**.
3. Leave the framework (**Next.js**) and build settings as they are. The project includes a `vercel-build` script that prepares the database automatically.

## Step 2 — Choose your password (before the first deploy)

Still on the import screen, open **Environment Variables** and add:

| Name | Value |
| --- | --- |
| `DESIGN_VAULT_PASSWORD` | A long password only you know. A short sentence works well. |

Click **Deploy**. The first deploy may finish before storage is connected. That's fine: steps 3–5 fix it.

> If you forget this variable, the site shows a "One more step" page and stays locked. Your vault is never left open to the internet.

## Step 3 — Add Blob storage (screenshots and videos)

1. Open your project in Vercel → **Storage** tab → **Create Database** → **Blob**.
2. Give it a name (e.g. `design-vault-files`). If asked for access, choose **Private**.
3. Connect it to your project for all environments.

This adds either `BLOB_STORE_ID` (newer private stores, which connect through Vercel's built-in identity) or `BLOB_READ_WRITE_TOKEN` to your project. Design Vault works with both.

## Step 4 — Add the Turso database

1. In the **Storage** tab, choose **Turso** (under Marketplace database providers) → **Create**/**Install**.
2. Create a database (any name, e.g. `design-vault`), pick a region close to you, and connect it to your project.

This adds `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to your project.

> If the integration uses different names, add the two values yourself under **Settings → Environment Variables** with exactly the names `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. You can find them in the Turso dashboard: open the database, copy its URL, and create a token.

## Step 5 — Redeploy

Go to **Deployments**, click **⋯** on the latest one → **Redeploy**. Settings only apply to new deploys.

Open your site's address (e.g. `https://designvault.vercel.app`), sign in with your password, and you'll see an empty vault ready to use. Try pasting a screenshot with `Ctrl+V`.

## Step 6 — Copy your existing references (optional)

This copies everything from your computer's vault into the online one: references, collections, tags, notes and every screenshot and video. Your local vault is only read, never changed. Running it again skips anything already copied.

1. In the Design Vault folder on your computer, create a file named `.env.hosted` (it's already excluded from Git, so it won't be uploaded to GitHub).
2. Put these three lines in it, with the values from **Vercel → your project → Settings → Environment Variables** (click the eye icon to reveal each one):

   ```
   TURSO_DATABASE_URL=libsql://...
   TURSO_AUTH_TOKEN=...
   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
   ```

   *Alternative:* `npx vercel link` and then `npx vercel env pull .env.hosted --environment=production` downloads them for you. Values marked "Sensitive" in Vercel download as empty; copy those by hand.

3. Run:

   ```powershell
   npm run hosted:import -- .env.hosted
   ```

It prints what it copied. Refresh your online vault and your references are there.

> Keep `.env.hosted` private: those values give full access to your online vault. Delete the file when you're done if you like.

---

## Connect Claude Code to the online vault (optional)

**Option A — REST API (nothing to install).** Agents call `https://<your-site>/api/search?q=…` with `Authorization: Bearer <API key>`. The key is in **Settings → Agent access** on the online vault. See [API.md](API.md). The password isn't needed; the API key is separate and read-only.

**Option B — MCP server.** The MCP server still runs on your computer, but reads the online vault:

1. In the Turso dashboard, open your database → create a token with **read-only** access.
2. Register the MCP server with the online settings (replace the values; use `--scope user` for all projects):

   ```powershell
   claude mcp remove design-vault --scope user
   ```

   ```powershell
   claude mcp add design-vault --scope user -e TURSO_DATABASE_URL=libsql://... -e TURSO_AUTH_TOKEN=<read-only-token> -e BLOB_READ_WRITE_TOKEN=vercel_blob_rw_... -- node "D:/design-vault/mcp/start.mjs"
   ```

The MCP server opens the database in read-only mode and refuses writes. The read-only Turso token makes this airtight on the database side. Blob tokens are always read-write, and the MCP server only uses it to read screenshots.

To switch back to the local vault, remove it and add it again without the `-e` settings.

---

## Public browsing (view-only) — on by default

Your online vault is a public showcase: anyone with the link can browse it without a login prompt, and only you can change it. Visitors who aren't signed in can:

- browse the gallery, search and filters, Explore, Collections (including your selection notes), Favorites and Recently added;
- open references, view screenshots and videos, and download originals.

They can't add, edit, favorite, collect or delete anything. They also can't see Settings (where the API key lives), the agent API or the JSON export. The server enforces this on every request, not just by hiding buttons.

You sign in with the **Sign in** button at the top right (or **Owner sign in** at the bottom of the sidebar) to get all your controls back.

**Make the vault private instead:** add the environment variable `DESIGN_VAULT_PUBLIC_VIEW` with the value `false` and redeploy. Then every page asks for the password.

> Everything in your references becomes public, including curator notes and source links. Leave out anything you don't want to share.

## Everyday use

- **Updating the app:** push changes to GitHub, and Vercel redeploys automatically. Database updates (migrations) run during the build.
- **Changing your password:** edit `DESIGN_VAULT_PASSWORD` in Vercel and redeploy. Everyone, including you, is signed out.
- **Signing out:** *Sign out* at the bottom of the sidebar.
- **Optional settings:** `DESIGN_VAULT_SESSION_SECRET` (a long random string) signs login sessions independently of the password. `DESIGN_VAULT_MAX_VIDEO_MB` changes the video size limit. `DESIGN_VAULT_API_KEY` sets a fixed API key.

## Troubleshooting

| You see | Fix |
| --- | --- |
| "One more step" page | `DESIGN_VAULT_PASSWORD` isn't set. Add it (step 2) and redeploy. |
| "Something went wrong on the server" on every page | The database isn't connected. Check that `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` exist (step 4), then redeploy. The build log (Deployments → your deploy → Building) shows the migration step. |
| Uploads fail | Check that `BLOB_STORE_ID` or `BLOB_READ_WRITE_TOKEN` exists (step 3), that the store is connected to all environments, and redeploy. |
| Images don't load | Make sure you're signed in. Files are private and only reachable through the app. |
| "That password isn't right" repeatedly | After 8 attempts, sign-in pauses for a few minutes. Check the value in Vercel. |

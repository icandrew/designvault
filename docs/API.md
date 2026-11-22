# Design Vault REST API (read-only)

The REST API lets AI agents and scripts search and read your vault. It is **read-only**: there are no endpoints that create, change or delete data. (The web app uses separate, same-origin-only endpoints under `/api/app/*` for writing.)

- Base URL: `http://127.0.0.1:3000` (the app must be running: `npm run dev` or `npm start`)
- Authentication: send your API key on every request
  - `Authorization: Bearer <key>` (preferred), or
  - `X-API-Key: <key>`
- Find the key in **Settings → Agent access**, or run `npm run api-key`.
- Rate limit: 600 requests per minute per key.

> Prefer the MCP server for Claude Code — it returns screenshot content directly and does not need the app to be running. See [AGENTS.md](AGENTS.md).

## Response format

Success:

```json
{ "data": { ... } }
```

Lists add pagination metadata:

```json
{ "data": [ ... ], "meta": { "total": 42, "limit": 20, "offset": 0, "hasMore": true, "nextOffset": 20 } }
```

Errors:

```json
{ "error": { "code": "not_found", "message": "Reference not found." } }
```

| Status | `code` | Meaning |
| --- | --- | --- |
| 400 | `validation_error`, `bad_request` | Invalid parameters |
| 401 | `unauthorized` | Missing or wrong API key |
| 404 | `not_found`, `image_missing` | Unknown ID, or an image file missing from storage |
| 405 | — | Method not allowed (the API is read-only) |
| 429 | `rate_limited` | Too many requests |
| 500 | `server_error` | Unexpected error (no stack traces or paths are exposed) |

## Identifiers

IDs are stable and prefixed: `ref_…` (reference), `img_…` (screenshot), `col_…` (collection). They never change when a reference is edited or an image is replaced.

## Filtering parameters

Supported by `GET /api/references` and `GET /api/search`. Repeat a parameter or separate values with commas. Values within one parameter are OR-ed; different parameters are AND-ed.

| Parameter | Values |
| --- | --- |
| `q` | Keywords (references) or a natural-language brief (search) |
| `industry`, `pageType`, `component`, `visualStyle`, `layout`, `interaction`, `tag` | Term **slugs** from `/api/taxonomy`, e.g. `industry=pet-care,beauty-and-skincare` |
| `viewport` | `desktop`, `tablet`, `mobile`, `custom` |
| `theme` | Captured screenshot theme: `light`, `dark`, `mixed`, `unknown` |
| `darkMode` | Whether the source site supports dark mode: `yes`, `no`, `unknown` |
| `status` | `to_review`, `curated`, `archived` (archived is hidden unless requested) |
| `favorite` | `true` / `false` |
| `collection` | A collection ID |
| `addedAfter`, `addedBefore` | ISO dates, e.g. `2026-01-01` |
| `sort` | `newest` (default), `oldest`, `title`, `updated` (references only) |
| `limit`, `offset` | Pagination (`limit` max 100 for references, 50 for search) |

## Endpoints

### `GET /api/search`

Ranked search for agents. `q` can be a brief; it is matched against the controlled vocabulary (multi-word terms like "Product Detail Page") and then all metadata. Each result explains why it matched.

```bash
curl -H "Authorization: Bearer $KEY" "http://127.0.0.1:3000/api/search?q=premium+pet+care+product+page&limit=5"
```

```json
{
  "data": [
    {
      "id": "ref_8m2k4q7x9c1d",
      "title": "Conditioning shampoo product page",
      "site": "Fictional Pets",
      "sourceUrl": "https://pets.example/shampoo",
      "industry": "Pet Care",
      "pageType": "Product Detail Page",
      "visualStyles": ["Minimalist"],
      "layouts": [],
      "components": ["Sticky CTA"],
      "capturedTheme": "light",
      "viewport": "desktop",
      "screenshots": 2,
      "isFavorite": true,
      "status": "curated",
      "isSample": false,
      "relevance": { "score": 13.5, "reasons": ["industry: Pet Care", "page type: Product Detail Page", "metadata mentions: shampoo"] }
    }
  ],
  "meta": { "total": 1, "limit": 5, "offset": 0, "hasMore": false, "nextOffset": null, "matchedTerms": ["industry: Pet Care", "page type: Product Detail Page"] }
}
```

### `GET /api/references`

Compact summaries with filters and pagination. Each item includes `links` to its detail, context and images endpoints, and a `cover` with a thumbnail URL.

### `GET /api/references/:id`

Full metadata: description, every classification (interactions include `verified`), capture info (`capturedTheme` and `supportsDarkMode` are separate), source and attribution, analysis split into `observed`, `curatorNotes` and `aiSuggestions` (always `verified: false`), images and collections.

### `GET /api/references/:id/images`

Media records: `mediaType` (`image` or `video`), `durationMs` for videos, dimensions, file size, viewport and its pixel size, theme, screenshot type, display order (the first item is the cover) and access URLs. For videos, `original` is the MP4 (supports HTTP `Range` requests) and `thumb`/`preview` are generated from a poster frame. Use `media=video` on `/api/references` or `/api/search` to find references that include video. URLs:

- `thumb` — gallery thumbnail (≤720 px wide, tall pages cropped to 1:2)
- `preview` — large view (≤1800 px wide, never upscaled)
- `original` — the untouched upload (add `?download=1` to download)

Fetch image URLs with the same `Authorization` header. Local file paths are never exposed.

### `GET /api/references/:id/context`

Compact, agent-friendly analysis (the same as the MCP `get_reference_context` tool). Add `?similar=true` to include related reference IDs with the metadata they share.

### `GET /api/collections`

Collections and project moodboards with their briefs and reference counts.

### `GET /api/collections/:id`

Ordered references in a collection with the curator's `whySelected` note for each.

### `GET /api/taxonomy`

All classification systems with term names, slugs (use these as filter values), usage counts, and the allowed enum values.

## Images in the browser

The web app loads images from `/api/images/:imageId/:variant` without a key because browsers mark those requests as same-origin (`Sec-Fetch-Site`), which other websites cannot forge.

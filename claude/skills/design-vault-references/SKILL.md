---
name: design-vault-references
description: Ground website and UI design decisions in the user's own Design Vault reference library (via the design-vault MCP server). Use when starting a new website, landing page, app screen or major visual redesign, choosing a visual direction, or designing a significant page/section (hero, navigation, product page, pricing, dashboard). Skip for bug fixes, copy edits, refactors, and small tweaks to an existing, already-decided design.
---

# Design Vault reference workflow

Design Vault is the user's curated library of website and UI screenshots, each with structured metadata and notes. Use it as **evidence for original design decisions** — never as a source to copy.

## When to use this skill

Use it when visual direction is being decided:

- A new site, page, app screen or campaign from a brief
- A redesign or a significant new section (hero, navigation, product detail page, pricing, dashboard, checkout)
- The user asks for references, inspiration, or "what does my vault have for…"

Do **not** search the vault for: bug fixes, refactors, copy changes, accessibility fixes, small spacing/color tweaks, or follow-up iterations where a reference-backed direction already exists in this conversation. Reuse the direction you already have.

## Tools (MCP server `design-vault`, read-only)

| Tool | Use for |
| --- | --- |
| `search_design_references` | First step. Brief and/or filters → compact ranked results with reasons |
| `list_design_taxonomy` | Valid industries, page types, components, styles, layouts, interactions |
| `get_reference_context` | Compact analysis of one reference (observed / curator notes / AI suggestions) |
| `get_reference_images` | Actual screenshots — only for references you are analysing |
| `find_similar_references` | Expand from one strong reference |
| `get_design_patterns` | Examples of a specific component, layout or interaction |
| `list_design_collections`, `get_collection_references` | Project moodboards with briefs and "why selected" notes |

If the tools are unavailable, tell the user the `design-vault` MCP server is not connected (setup: Design Vault → Settings → Agent access) and continue without it, saying the direction is not reference-backed.

## Workflow

1. **Read the brief.** Identify industry, audience, brand positioning, site/page type, key page patterns, desired visual direction, and responsive needs. Note what is unknown.
2. **Check for a moodboard.** Call `list_design_collections`. If a moodboard matches the project, start from `get_collection_references` — the user's selection notes take priority.
3. **Search.** Call `search_design_references` with a short brief as `query`, plus filters where confident (e.g. `industry: ["Pet Care"]`, `pageType: ["Product Detail Page"]`). Keep `limit` at 6–10. If results are thin, broaden: drop filters, search by page type or component across industries, or use `get_design_patterns` for a specific component.
4. **Select 3–6 references.** Prefer relevance reasons that match the brief, `status: curated`, and favorites. Prefer variety (one strong layout reference, one typography reference, one interaction reference) over five near-duplicates.
5. **Read context.** Call `get_reference_context` for each selected ID.
6. **Inspect screenshots only when visual detail matters** (grid, type scale, spacing rhythm, product presentation). Call `get_reference_images` with the default `mode: "auto"`; use `mode: "top"` when only the first screen matters. Never load images for every search result.
7. **Summarize observed principles.** For each reference, note concrete, observable principles: composition, grid, typographic hierarchy, spacing rhythm, color relationships, product presentation, navigation pattern, responsive behavior.
8. **Write a design direction before coding** (keep it short):
   - References used — `ref_…` IDs with one line each on why they are relevant
   - Principles to adapt — and how they will be transformed, not copied
   - Original elements — what makes this result distinct for this brand
   - Interaction ideas — only from **verified** interactions or explicit curator notes
9. **Implement an original design.** Adapt principles; do not reproduce layouts, compositions, branding, logos, imagery, copy or other identifiable creative work. Use the project's own brand, content and assets.
10. **Evaluate.** Check the result against the direction, usability and accessibility, and the cited principles. Replace generic template-like sections where a stronger reference-backed alternative fits.

## Evidence rules

- **Observed** information is factual. **Curator notes** are the user's informed opinion — weigh them highly but label them as opinion. **AI suggestions** are unverified unless `reviewedByCurator` is true; never present them as evidence.
- Interactions marked `unverified` may not exist — do not claim a site animates something based on a static screenshot.
- Saved does not mean universally good. Note `limitations` and avoid repeating them.
- Respect attribution: designs belong to their creators. Reference them by site name and source URL.
- Samples (`isSample: true`) are generated illustrations, not real websites — do not cite them as real-world evidence.

## Token efficiency

- Search results are compact; do not call `get_design_reference` (full record) unless you need a field missing from context.
- Use pagination (`offset`) instead of large `limit` values.
- Load at most 1–2 screenshots per reference, and only for the references that drive the direction.

## Example

Brief: "Premium website for a pet care brand selling conditioning shampoo for dogs and cats."

1. `list_design_collections` → no matching moodboard.
2. `search_design_references { query: "premium pet care shampoo product page", industry: ["Pet Care"], limit: 8 }` → 2 results. Broaden: `search_design_references { query: "premium product detail page editorial", pageType: ["Product Detail Page"] }` and `get_design_patterns { component: ["Product Gallery", "Sticky CTA"] }`.
3. Select `ref_a…` (PDP gallery proportions), `ref_b…` (editorial type hierarchy, Beauty), `ref_c…` (verified sticky purchase bar on mobile).
4. `get_reference_context` ×3; `get_reference_images { id: "ref_a…", mode: "top" }`.
5. Direction:
   - `ref_a…` — gallery ~55% / purchase column ~45% keeps product dominant → adapt with pet-and-owner lifestyle imagery instead of packshots only.
   - `ref_b…` — high-contrast serif display with restrained sans body → adapt with a warmer palette suited to pet care.
   - `ref_c…` — verified sticky purchase bar on mobile → adopt for thumb reach; original: scent/coat-type selector inside the bar.
   - Original: coat-type quiz module, softer rounded photography crops, ingredient story told through illustrated icons.
6. Build, then evaluate against these points and cite the IDs in the summary.

import { LABELS } from "./domain";
import type { ReferenceDetail } from "./types";

/** Plain-text structured summary for pasting into briefs or agent prompts. */
export function referenceSummaryText(r: ReferenceDetail, appOrigin?: string) {
  const names = (list: { name: string }[]) => list.map((t) => t.name).join(", ");
  const lines: string[] = [`Design reference ${r.id} — ${r.title}`];
  if (r.sourceUrl) lines.push(`Source: ${r.sourceUrl}${r.siteName ? ` (${r.siteName})` : ""}`);
  if (appOrigin) lines.push(`Vault: ${appOrigin}/references/${r.id}`);
  const cls = [
    r.industry && `Industry: ${r.industry.name}${r.additionalIndustries.length ? ` (+ ${names(r.additionalIndustries)})` : ""}`,
    r.pageType && `Page type: ${r.pageType.name}`,
    r.visualStyles.length && `Visual style: ${names(r.visualStyles)}`,
    r.layouts.length && `Layout: ${names(r.layouts)}`,
    r.components.length && `Components: ${names(r.components)}`,
    r.interactions.length && `Interactions: ${r.interactions.map((i) => `${i.name} (${i.verified ? "verified" : "unverified"})`).join(", ")}`,
    r.tags.length && `Tags: ${names(r.tags)}`,
  ].filter(Boolean) as string[];
  lines.push(...cls);
  lines.push(
    `Capture: ${LABELS.screenshotType[r.screenshotType]} · ${LABELS.viewport[r.capturedViewport]} · ${LABELS.capturedTheme[r.capturedTheme]} theme · Source dark mode: ${LABELS.darkMode[r.supportsDarkMode]} · ${r.images.length} screenshot(s)`,
  );
  const a = r.analysis;
  if (a?.observations) lines.push(`Observed: ${a.observations}`);
  const notes = [
    a?.interesting && `Why interesting: ${a.interesting}`,
    a?.typographyNotes && `Typography: ${a.typographyNotes}`,
    a?.colorNotes && `Color: ${a.colorNotes}`,
    a?.layoutNotes && `Layout: ${a.layoutNotes}`,
    a?.interactionNotes && `Interaction: ${a.interactionNotes}`,
    a?.uxStrengths && `UX strengths: ${a.uxStrengths}`,
  ].filter(Boolean);
  if (notes.length) lines.push(`Curator notes — ${notes.join(" | ")}`);
  if (a?.usageIdeas) lines.push(`Reusable principles: ${a.usageIdeas}`);
  if (a?.limitations) lines.push(`Limitations: ${a.limitations}`);
  if (a?.aiSuggestions) lines.push(`AI suggestions (${a.aiSuggestionsReviewed ? "reviewed" : "unreviewed, not verified"}): ${a.aiSuggestions}`);
  lines.push("Use as inspiration for principles only; do not copy layout, branding or assets.");
  return lines.join("\n");
}

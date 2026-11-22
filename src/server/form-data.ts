import { TERM_KINDS, type TermKind } from "@/lib/domain";
import { listCollectionOptions } from "./repositories/collections";
import { listTerms } from "./repositories/taxonomy";

/** Vocabulary and collections for the reference form. */
export async function getFormOptions() {
  const [terms, collections] = await Promise.all([listTerms(), listCollectionOptions()]);
  const termOptions = Object.fromEntries(TERM_KINDS.map((k) => [k, [] as string[]])) as Record<TermKind, string[]>;
  for (const t of terms) termOptions[t.kind].push(t.name);
  return { termOptions, collections: collections.map((c) => ({ id: c.id, name: c.name })) };
}

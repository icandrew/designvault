/**
 * Shortest-column masonry placement computed for every supported column
 * count. Each item's top offset is expressed as `a * columnWidth + b * row`,
 * where `a` is the sum of image aspect ratios above it in its column and `b`
 * is the number of cards above it. CSS (see `.dv-masonry` in globals.css)
 * picks the right set with container queries, so there is no layout shift and
 * no client-side measuring.
 */
export const MAX_COLUMNS = 6;

/** Representative column widths (px) used only to choose the shortest column. */
const REPRESENTATIVE_WIDTH: Record<number, number> = { 1: 420, 2: 340, 3: 320, 4: 320, 5: 330, 6: 290 };

export interface MasonryPlacement {
  col: number[];
  a: number[];
  b: number[];
}

export interface MasonryLayout {
  items: MasonryPlacement[];
  /** Per column count: CSS expression for the container height. */
  heights: string[];
}

export function computeMasonry(ratios: number[], density: "comfortable" | "compact"): MasonryLayout {
  const rowExtra = density === "compact" ? 48 : 76; // caption + gap, only for choosing columns
  const items: MasonryPlacement[] = ratios.map(() => ({ col: [], a: [], b: [] }));
  const heights: string[] = [];

  for (let n = 1; n <= MAX_COLUMNS; n++) {
    const cw = REPRESENTATIVE_WIDTH[n];
    const colA = new Array<number>(n).fill(0);
    const colB = new Array<number>(n).fill(0);
    ratios.forEach((ratio, i) => {
      let best = 0;
      let bestH = Infinity;
      for (let c = 0; c < n; c++) {
        const h = colA[c] * cw + colB[c] * rowExtra;
        if (h < bestH - 0.5) {
          bestH = h;
          best = c;
        }
      }
      items[i].col[n - 1] = best;
      items[i].a[n - 1] = round(colA[best]);
      items[i].b[n - 1] = colB[best];
      colA[best] += ratio;
      colB[best] += 1;
    });
    const terms = colA
      .map((a, c) => ({ a: round(a), b: colB[c] }))
      .filter((t) => t.b > 0)
      .map((t) => `calc(${t.a} * var(--cw) + ${t.b} * (var(--caption) + var(--gap)) - var(--gap))`);
    heights.push(terms.length === 0 ? "0px" : terms.length === 1 ? terms[0] : `max(${terms.join(", ")})`);
  }
  return { items, heights };
}

function round(v: number) {
  return Math.round(v * 10000) / 10000;
}

export function placementStyle(p: MasonryPlacement, ratio: number): Record<string, string | number> {
  const style: Record<string, string | number> = { "--ratio": ratio };
  for (let n = 1; n <= MAX_COLUMNS; n++) {
    style[`--col-${n}`] = p.col[n - 1];
    style[`--a-${n}`] = p.a[n - 1];
    style[`--b-${n}`] = p.b[n - 1];
  }
  return style;
}

export function containerStyle(layout: MasonryLayout): Record<string, string> {
  const style: Record<string, string> = {};
  layout.heights.forEach((h, i) => {
    style[`--h-${i + 1}`] = h;
  });
  return style;
}

/** Display ratio for a card thumbnail (height / width). */
export function coverRatio(cover: { thumbWidth: number; thumbHeight: number } | null) {
  if (!cover || !cover.thumbWidth) return 0.75;
  return Math.min(2, Math.max(0.35, cover.thumbHeight / cover.thumbWidth));
}

/**
 * Optional sample data, clearly marked `isSample` and titled "Sample · ...".
 * Screenshots are generated wireframe illustrations (no third-party designs),
 * so the gallery can be explored before real references are added. Remove all
 * sample records from Settings at any time; real records are never touched.
 */
import sharp from "sharp";
import { referenceInputSchema, type ReferenceInput } from "@/lib/domain";
import { getConfig } from "./config";
import { processImage } from "./images";
import { createReference } from "./repositories/references";

interface Palette {
  bg: string;
  fg: string;
  muted: string;
  accent: string;
  panel: string;
}

const LIGHT: Palette = { bg: "#f6f4ef", fg: "#1c1b19", muted: "#c9c4b8", accent: "#b4623c", panel: "#ebe7de" };
const DARK: Palette = { bg: "#121314", fg: "#f1efe9", muted: "#3a3c3f", accent: "#9fd36b", panel: "#1d1f21" };
const COOL: Palette = { bg: "#eef1f5", fg: "#10161f", muted: "#c3cbd6", accent: "#2f5bea", panel: "#ffffff" };

function rect(x: number, y: number, w: number, h: number, fill: string, r = 0) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;
}
function lines(x: number, y: number, w: number, n: number, fill: string, gap = 22, h = 10) {
  return Array.from({ length: n }, (_, i) => rect(x, y + i * gap, i === n - 1 ? w * 0.6 : w, h, fill, 3)).join("");
}
function nav(p: Palette, width: number) {
  return rect(0, 0, width, 72, p.bg) + rect(48, 26, 120, 20, p.fg, 4) + [0, 1, 2, 3].map((i) => rect(width - 520 + i * 100, 30, 70, 12, p.muted, 3)).join("") + rect(width - 140, 20, 92, 32, p.accent, 16);
}
function label(p: Palette, width: number, height: number) {
  return `<text x="${width - 24}" y="${height - 24}" text-anchor="end" font-family="sans-serif" font-size="16" fill="${p.muted}">Sample illustration · Design Vault</text>`;
}

type Layout = (p: Palette, w: number) => { h: number; body: string };

const layouts: Record<string, Layout> = {
  editorialHero: (p, w) => {
    const h = 2400;
    let body = nav(p, w);
    body += rect(48, 140, w * 0.55, 96, p.fg, 6) + rect(48, 252, w * 0.42, 96, p.fg, 6);
    body += lines(48, 390, 420, 4, p.muted);
    body += rect(w * 0.62, 120, w * 0.34, 640, p.accent, 2);
    body += rect(48, 860, w - 96, 1, p.muted);
    for (let i = 0; i < 3; i++) body += rect(48 + i * ((w - 96) / 3), 920, (w - 96) / 3 - 24, 420, p.panel, 2) + lines(48 + i * ((w - 96) / 3), 1360, 260, 3, p.muted);
    body += rect(48, 1560, w - 96, 560, p.fg, 2) + rect(96, 1640, 520, 64, p.bg, 4);
    return { h, body };
  },
  productDetail: (p, w) => {
    const h = 1800;
    let body = nav(p, w);
    body += rect(48, 120, w * 0.56, 820, p.panel, 4);
    for (let i = 0; i < 4; i++) body += rect(48 + i * 132, 960, 116, 116, p.muted, 4);
    const x = w * 0.62;
    body += rect(x, 140, 320, 40, p.fg, 4) + rect(x, 196, 160, 20, p.muted, 4);
    body += lines(x, 260, w * 0.32, 5, p.muted);
    body += [0, 1, 2].map((i) => rect(x + i * 70, 420, 54, 54, i === 0 ? p.fg : p.muted, 27)).join("");
    body += rect(x, 520, w * 0.32, 60, p.accent, 30) + rect(x, 600, w * 0.32, 60, p.bg, 30);
    body += rect(48, 1180, w - 96, 1, p.muted) + lines(48, 1240, w - 96, 8, p.muted, 28);
    return { h, body };
  },
  bentoDashboard: (p, w) => {
    const h = 1100;
    let body = rect(0, 0, 240, h, p.panel) + lines(32, 120, 150, 8, p.muted, 44, 14) + rect(32, 40, 120, 24, p.fg, 4);
    const gx = 280;
    const cw = (w - gx - 40 - 48) / 4;
    body += rect(gx, 40, 360, 32, p.fg, 4);
    body += rect(gx, 110, cw * 2 + 16, 420, p.panel, 14) + rect(gx + cw * 2 + 32, 110, cw * 2 + 16, 200, p.accent, 14);
    body += rect(gx + cw * 2 + 32, 330, cw - 0, 200, p.panel, 14) + rect(gx + cw * 3 + 48, 330, cw, 200, p.panel, 14);
    for (let i = 0; i < 4; i++) body += rect(gx + i * (cw + 16), 560, cw, 160, p.panel, 14);
    body += rect(gx, 750, w - gx - 40, 300, p.panel, 14) + lines(gx + 32, 790, w - gx - 120, 8, p.muted, 30);
    return { h, body };
  },
  mobileNav: (p, w) => {
    const h = 1688;
    let body = rect(0, 0, w, 120, p.bg) + rect(32, 52, 100, 22, p.fg, 4) + [0, 1, 2].map((i) => rect(w - 80, 46 + i * 14, 44, 5, p.fg, 2)).join("");
    body += rect(0, 120, w, h - 120, p.fg);
    body += [0, 1, 2, 3, 4].map((i) => rect(40, 220 + i * 120, w * 0.7, 56, p.bg, 6)).join("");
    body += rect(40, 900, w - 80, 1, p.muted) + lines(40, 960, w - 80, 4, p.muted, 34, 14);
    body += rect(40, h - 200, w - 80, 88, p.accent, 44);
    return { h, body };
  },
  pricing: (p, w) => {
    const h = 1500;
    let body = nav(p, w);
    body += rect(w / 2 - 300, 160, 600, 56, p.fg, 6) + rect(w / 2 - 220, 236, 440, 18, p.muted, 4);
    const cw = (w - 96 - 48) / 3;
    for (let i = 0; i < 3; i++) {
      const x = 48 + i * (cw + 24);
      body += rect(x, 340, cw, 760, i === 1 ? p.fg : p.panel, 16);
      body += rect(x + 32, 380, 120, 18, i === 1 ? p.accent : p.muted, 4) + rect(x + 32, 420, 180, 52, i === 1 ? p.bg : p.fg, 4);
      body += lines(x + 32, 520, cw - 64, 7, i === 1 ? "#55575a" : p.muted, 40);
      body += rect(x + 32, 1000, cw - 64, 56, i === 1 ? p.accent : p.bg, 28);
    }
    return { h, body };
  },
  splitLanding: (p, w) => {
    const h = 900;
    let body = rect(0, 0, w / 2, h, p.accent) + rect(w / 2, 0, w / 2, h, p.bg);
    body += rect(64, 64, 120, 22, p.bg, 4) + rect(64, h - 360, w / 2 - 160, 88, p.bg, 6) + rect(64, h - 256, w / 2 - 260, 88, p.bg, 6);
    body += rect(w / 2 + 96, 220, 360, 36, p.fg, 4) + lines(w / 2 + 96, 290, 420, 3, p.muted);
    body += [0, 1, 2].map((i) => rect(w / 2 + 96, 400 + i * 76, 460, 52, p.panel, 8)).join("");
    body += rect(w / 2 + 96, 640, 460, 56, p.fg, 8);
    return { h, body };
  },
};

async function render(layout: keyof typeof layouts, palette: Palette, width: number) {
  const { h, body } = layouts[layout](palette, width);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}">${rect(0, 0, width, h, palette.bg)}${body}${label(palette, width, h)}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const SAMPLES: {
  layout: keyof typeof layouts;
  palette: Palette;
  width: number;
  viewport: "desktop" | "mobile";
  theme: "light" | "dark";
  type: "full_page" | "viewport";
  input: ReferenceInput;
}[] = [
  {
    layout: "editorialHero",
    palette: LIGHT,
    width: 1440,
    viewport: "desktop",
    theme: "light",
    type: "full_page",
    input: {
      title: "Sample · Editorial skincare homepage",
      siteName: "Sample Studio (fictional)",
      sourceUrl: "https://example.com/sample/editorial-skincare",
      industry: "Beauty and Skincare",
      pageType: "Homepage",
      visualStyles: ["Editorial", "Typography-led"],
      layouts: ["Asymmetric Grid", "Oversized Typography"],
      components: ["Hero", "Cards", "Footer"],
      tags: ["warm neutrals", "sample"],
      capturedTheme: "light",
      status: "curated",
      description: "Generated wireframe illustrating an asymmetric editorial hero with a three-up story grid.",
      analysis: {
        observations: "Two-line display headline left, tall image block right (~35% width). Three equal story cards below a hairline divider.",
        interesting: "The headline and image block create tension through unequal column widths.",
        layoutNotes: "12-column grid; headline spans ~7 columns, image ~4.",
        usageIdeas: "Asymmetric hero balance for a premium product launch page.",
        limitations: "Sample data: not a real website.",
      },
    },
  },
  {
    layout: "productDetail",
    palette: COOL,
    width: 1440,
    viewport: "desktop",
    theme: "light",
    type: "full_page",
    input: {
      title: "Sample · Product detail with sticky purchase panel",
      siteName: "Sample Goods (fictional)",
      sourceUrl: "https://example.com/sample/product-detail",
      industry: "E-commerce",
      additionalIndustries: ["Pet Care"],
      pageType: "Product Detail Page",
      visualStyles: ["Minimalist"],
      layouts: ["Split Screen"],
      components: ["Product Gallery", "Sticky CTA"],
      interactions: [{ name: "Sticky Elements", verified: false }],
      tags: ["sample"],
      capturedTheme: "light",
      description: "Generated wireframe of a product page with a large gallery and a purchase column.",
      analysis: {
        observations: "Gallery occupies ~56% width with a thumbnail strip; purchase column holds title, swatches and two stacked buttons.",
        uxStrengths: "Primary and secondary actions are clearly separated by fill.",
        usageIdeas: "Gallery-to-purchase proportion for a pet shampoo PDP.",
        limitations: "Sticky behavior is not verified — this is a static sample.",
      },
    },
  },
  {
    layout: "bentoDashboard",
    palette: DARK,
    width: 1440,
    viewport: "desktop",
    theme: "dark",
    type: "viewport",
    input: {
      title: "Sample · Dark bento analytics dashboard",
      siteName: "Sample Metrics (fictional)",
      sourceUrl: "https://example.com/sample/dashboard",
      industry: "SaaS",
      pageType: "Dashboard",
      visualStyles: ["Futuristic", "Monochromatic"],
      layouts: ["Bento Grid", "Sidebar Layout"],
      components: ["Cards", "Navigation"],
      tags: ["dark ui", "sample"],
      capturedTheme: "dark",
      supportsDarkMode: "yes",
      screenshotType: "viewport",
      analysis: {
        observations: "Persistent left sidebar; mixed-size tiles in a 4-column bento grid; one accent tile.",
        usageIdeas: "Single accent tile as a focal point in a dense dashboard.",
      },
    },
  },
  {
    layout: "mobileNav",
    palette: DARK,
    width: 780,
    viewport: "mobile",
    theme: "dark",
    type: "viewport",
    input: {
      title: "Sample · Full-screen mobile navigation",
      siteName: "Sample Atelier (fictional)",
      sourceUrl: "https://example.com/sample/mobile-nav",
      industry: "Luxury",
      additionalIndustries: ["Fashion"],
      pageType: "Homepage",
      visualStyles: ["Luxury", "Minimalist"],
      layouts: ["Full Bleed"],
      components: ["Mobile Navigation"],
      tags: ["sample"],
      capturedTheme: "dark",
      capturedViewport: "mobile",
      screenshotType: "viewport",
      analysis: {
        observations: "Menu overlay fills the screen with large stacked links and a pill CTA anchored at the bottom.",
        usageIdeas: "Thumb-reachable primary action in mobile menus.",
      },
    },
  },
  {
    layout: "pricing",
    palette: LIGHT,
    width: 1440,
    viewport: "desktop",
    theme: "light",
    type: "full_page",
    input: {
      title: "Sample · Three-tier pricing with highlighted plan",
      siteName: "Sample Cloud (fictional)",
      sourceUrl: "https://example.com/sample/pricing",
      industry: "SaaS",
      pageType: "Pricing Page",
      visualStyles: ["Corporate"],
      layouts: ["Centered Composition", "Card-based Layout"],
      components: ["Pricing Tables"],
      tags: ["sample"],
      capturedTheme: "light",
      analysis: { observations: "Middle plan inverted to dark fill to signal recommendation." },
    },
  },
  {
    layout: "splitLanding",
    palette: LIGHT,
    width: 1440,
    viewport: "desktop",
    theme: "light",
    type: "viewport",
    input: {
      title: "Sample · Split-screen sign-up landing",
      siteName: "Sample Wellness (fictional)",
      sourceUrl: "https://example.com/sample/split-landing",
      industry: "Health and Wellness",
      pageType: "Landing Page",
      visualStyles: ["Colorful"],
      layouts: ["Split Screen"],
      components: ["Forms", "Hero"],
      tags: ["sample"],
      capturedTheme: "mixed",
      screenshotType: "viewport",
      analysis: { observations: "Saturated left half with headline; form on neutral right half." },
    },
  },
];

export async function loadSampleData() {
  const { maxUploadBytes } = getConfig();
  let created = 0;
  for (const s of SAMPLES) {
    const png = await render(s.layout, s.palette, s.width);
    const processed = await processImage(png, maxUploadBytes);
    const input = referenceInputSchema.parse({
      ...s.input,
      attribution: "Sample data generated by Design Vault",
      licenseNotes: "Generated illustration. Safe to delete.",
    });
    await createReference(
      input,
      [
        {
          processed,
          meta: {
            label: null,
            viewport: s.viewport,
            theme: s.theme,
            screenshotType: s.type,
            viewportWidth: s.viewport === "mobile" ? 390 : 1440,
            viewportHeight: s.viewport === "mobile" ? 844 : 900,
          },
        },
      ],
      { isSample: true },
    );
    created++;
  }
  return created;
}

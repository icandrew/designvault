import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

const API_KEY = "e2e-test-key";

async function screenshotFile(name: string, color: string, width = 1280, height = 2000) {
  const buffer = await sharp({ create: { width, height, channels: 3, background: color } })
    .composite([{ input: Buffer.from(`<svg width="${width}" height="${height}"><rect x="60" y="60" width="${width / 2}" height="90" fill="#111"/><rect x="${width * 0.62}" y="200" width="${width / 3}" height="${height / 3}" fill="#2a6"/></svg>`) }])
    .png()
    .toBuffer();
  return { name, mimeType: "image/png", buffer };
}

async function pickTerm(page: Page, fieldId: string, text: string, search = text) {
  await page.locator(`#${fieldId}`).click();
  const popover = page.locator('[data-slot="popover-content"][data-state="open"]');
  await popover.getByPlaceholder("Search or create…").fill(search);
  await popover.getByRole("option", { name: text, exact: true }).click();
}

async function addReference(page: Page, title: string, industry: string, color: string) {
  await page.goto("/references/new");
  await page.getByLabel("Choose screenshot files").setInputFiles(await screenshotFile(`${title}.png`, color));
  await expect(page.getByText(/1280 × 2000/)).toBeVisible();
  await page.getByLabel(/Reference title/).fill(title);
  await pickTerm(page, "industry", industry);
  await page.getByRole("button", { name: "Save reference" }).click();
  await page.waitForURL(/\/references\/ref_/);
  return page.url().split("/").pop()!;
}

test.describe.configure({ mode: "serial" });

test("shows the empty library state", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your vault is empty" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Add your first reference/ })).toBeVisible();
});

let refId = "";

test("uploads a screenshot with metadata and persists it", async ({ page }) => {
  await page.goto("/references/new");
  await page.getByLabel("Choose screenshot files").setInputFiles([await screenshotFile("pdp-desktop.png", "#efe8dc"), await screenshotFile("pdp-mobile.png", "#dfe8ef", 390, 1800)]);
  await expect(page.getByText(/1280 × 2000/)).toBeVisible();
  await expect(page.getByText(/390 × 1800/)).toBeVisible();

  // Required-field validation
  await page.getByRole("button", { name: "Save reference" }).click();
  await expect(page.getByText("A title is required")).toBeVisible();

  await page.getByLabel(/Reference title/).fill("Conditioning shampoo product page");
  await page.getByLabel(/Website \/ brand name/).fill("Fictional Pets");
  await page.getByLabel(/Source URL/).fill("https://pets.example/shampoo");
  await pickTerm(page, "industry", "Pet Care");
  await pickTerm(page, "pageType", "Product Detail Page", "Product Detail");
  await pickTerm(page, "visualStyles", "Minimalist");
  await page.keyboard.press("Escape");
  await page.getByLabel("Observed information").fill("Gallery left, purchase column right, sticky add-to-cart on mobile");
  await page.getByLabel("How I might use this reference").fill("Thumb-reachable purchase bar");
  await page.getByRole("button", { name: "Save reference" }).click();

  await page.waitForURL(/\/references\/ref_/);
  refId = page.url().split("/").pop()!;
  await expect(page.getByRole("heading", { level: 1, name: "Conditioning shampoo product page" })).toBeVisible();
  await expect(page.getByText("2 / 2").or(page.getByText("1 / 2"))).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Conditioning shampoo product page" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Pet Care" })).toBeVisible();
  await expect(page.getByText("Gallery left, purchase column right")).toBeVisible();
});

test("shows every screenshot in one continuous scroll with working view controls", async ({ page }) => {
  await page.goto(`/references/${refId}`);
  const gallery = page.getByRole("region", { name: "Screenshots" });
  // All screenshots are stacked in the page (no carousel, no previous/next).
  await expect(gallery.getByRole("img")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Next screenshot/ })).toHaveCount(0);
  const fit = gallery.getByRole("button", { name: /Fit to width/ });
  await expect(fit).toHaveAttribute("aria-pressed", "true");
  // Fit to width never stretches: each image is at most its real width and keeps its aspect ratio.
  const sizes = await gallery.locator("figure").evaluateAll((els) => els.map((e) => ({ w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height })));
  expect(sizes[1].h / sizes[1].w).toBeCloseTo(1800 / 390, 1);
  // Controls are hidden until the pointer is over the images.
  await gallery.locator("figure").first().hover();
  await gallery.getByRole("button", { name: /Zoom in/ }).click();
  await expect(fit).toHaveAttribute("aria-pressed", "false");
  await gallery.getByRole("button", { name: /Original size/ }).click();
  await expect(gallery.getByText(/^100%$/)).toBeVisible();
  await fit.click();
  await expect(fit).toHaveAttribute("aria-pressed", "true");
  // Scrolling to the second screenshot updates the counter and the download target.
  await gallery.locator("figure").nth(1).scrollIntoViewIfNeeded();
  await expect(gallery.getByRole("button", { name: "Download image 2" })).toBeVisible();
  // The details sidebar stays in view (sticky) while the images scroll past.
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  await expect(page.getByRole("heading", { level: 1, name: "Conditioning shampoo product page" })).toBeInViewport();
});

test("view controls appear on hover (desktop) and hide while scrolling down (mobile)", async ({ page }) => {
  await page.goto(`/references/${refId}`);
  const toolbar = page.getByRole("toolbar", { name: "Viewing controls" });
  // Desktop: hidden until the pointer is over the images.
  await expect(toolbar).not.toHaveAttribute("data-visible");
  await page.getByRole("region", { name: "Screenshots" }).locator("figure").first().hover();
  await expect(toolbar).toHaveAttribute("data-visible", "true");
  await page.getByRole("heading", { level: 1 }).hover();
  await expect(toolbar).not.toHaveAttribute("data-visible");

  // Mobile: shown at the top, hidden while scrolling down, shown again on scroll up.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(toolbar).toHaveAttribute("data-visible", "true");
  // Icon-only, centred at the bottom of the screen and stuck there while scrolling.
  await expect(toolbar.getByText("%")).toHaveCount(0);
  const placement = async () => {
    const box = (await toolbar.boundingBox())!;
    return { centreOffset: Math.abs(box.x + box.width / 2 - 390 / 2), gapToBottom: 844 - (box.y + box.height) };
  };
  let p = await placement();
  expect(p.centreOffset).toBeLessThan(4);
  expect(p.gapToBottom).toBeGreaterThan(4);
  expect(p.gapToBottom).toBeLessThan(40);
  await page.mouse.wheel(0, 900);
  await expect(toolbar).not.toHaveAttribute("data-visible");
  await page.mouse.wheel(0, -300);
  await expect(toolbar).toHaveAttribute("data-visible", "true");
  p = await placement();
  expect(p.centreOffset).toBeLessThan(4);
  expect(p.gapToBottom).toBeLessThan(40);
});

test("edits a reference", async ({ page }) => {
  await page.goto(`/references/${refId}/edit`);
  await page.getByLabel(/Reference title/).fill("Conditioning shampoo PDP");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(new RegExp(`/references/${refId}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Conditioning shampoo PDP", exact: true })).toBeVisible();
});

test("searches, filters and favorites", async ({ page }) => {
  await addReference(page, "Dark analytics dashboard", "SaaS", "#151515");
  await page.goto("/");
  await expect(page.getByRole("article")).toHaveCount(2);

  await page.getByLabel("Search references").fill("shampoo");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Conditioning shampoo PDP" })).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.getByRole("article")).toHaveCount(2);

  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByRole("button", { name: /^SaaS/ }).click();
  await expect(page.getByText("1 result")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByLabel("Active filters").getByText("SaaS")).toBeVisible();
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page.getByRole("article")).toHaveCount(2);

  await page.goto(`/references/${refId}`);
  await page.getByRole("button", { name: "Add to favorites" }).click();
  await expect(page.getByRole("button", { name: "Remove from favorites" })).toBeVisible();
  await page.goto("/favorites");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: "Remove from favorites" }).first().click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "No favorites yet" })).toBeVisible();
});

test("creates a collection and adds/removes a reference", async ({ page }) => {
  await page.goto("/collections");
  await page.getByRole("button", { name: /Create a collection/ }).click();
  await page.getByRole("radio", { name: /Project moodboard/ }).click();
  await page.getByLabel("Name").fill("Pet care research");
  await page.getByLabel("Website brief").fill("Premium pet shampoo website");
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(/\/collections\/col_/);
  await expect(page.getByText("Premium pet shampoo website")).toBeVisible();

  await page.getByRole("button", { name: "Add references" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /Conditioning shampoo PDP/ }).click();
  await page.getByRole("button", { name: "Add to collection" }).click();
  await expect(page.getByRole("heading", { level: 3, name: "Conditioning shampoo PDP", exact: true })).toBeVisible();
  await page.getByPlaceholder("Explain what this reference contributes…").fill("Best gallery proportions");
  await page.getByPlaceholder("Explain what this reference contributes…").blur();
  await expect(page.getByText("Note saved")).toBeVisible();

  await page.getByRole("button", { name: /More actions for Conditioning/ }).click();
  await page.getByRole("menuitem", { name: "Remove from collection" }).click();
  await expect(page.getByRole("heading", { name: "This collection is empty" })).toBeVisible();
});

test("agent REST API returns real references and requires the key", async ({ request }) => {
  const unauth = await request.get("/api/references");
  expect(unauth.status()).toBe(401);

  const headers = { Authorization: `Bearer ${API_KEY}` };
  const search = await request.get("/api/search?q=pet+shampoo+product+page", { headers });
  expect(search.ok()).toBeTruthy();
  const body = await search.json();
  expect(body.data[0].id).toBe(refId);

  const detail = await (await request.get(`/api/references/${refId}`, { headers })).json();
  expect(detail.data.classification.industry).toBe("Pet Care");
  expect(detail.data.images).toHaveLength(2);
  const img = await request.get(detail.data.images[0].urls.thumb.replace(/^https?:\/\/[^/]+/, ""), { headers });
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toBe("image/webp");
  expect((await request.get(detail.data.images[0].urls.thumb.replace(/^https?:\/\/[^/]+/, ""))).status()).toBe(401);

  const ctx = await (await request.get(`/api/references/${refId}/context`, { headers })).json();
  expect(ctx.data.observed.notes).toContain("Gallery left");

  // The agent API is read-only.
  expect((await request.delete(`/api/references/${refId}`, { headers })).status()).toBe(405);
  // App write endpoints reject cross-site requests.
  expect((await request.delete(`/api/app/references/${refId}`, { headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" } })).status()).toBe(403);
});

test("captures a URL with Playwright", async ({ page }) => {
  await page.goto("/references/new");
  await page.getByRole("tab", { name: /Capture from URL/ }).click();
  await page.getByLabel("Website URL").fill("http://127.0.0.1:3100/settings");
  await page.getByRole("switch", { name: "Capture full page" }).click();
  await page.getByRole("button", { name: "Capture", exact: true }).click();
  await expect(page.getByText(/Captured 1 screenshot/)).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/1440 × 900 .* captured/)).toBeVisible();
  await expect(page.getByLabel(/Source URL/)).toHaveValue("http://127.0.0.1:3100/settings");
});

test("pastes a WebP image from the clipboard with Ctrl+V", async ({ page }) => {
  await page.goto("/");
  // Simulate an image copied from a website (e.g. Dribbble): a paste event carrying a WebP file.
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 900;
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#1b1f3a";
    g.fillRect(0, 0, 1200, 900);
    g.fillStyle = "#f5c26b";
    g.fillRect(80, 120, 560, 80);
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/webp", 0.9));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "image.webp", { type: "image/webp" }));
    document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForURL(/\/references\/new$/);
  await expect(page.getByText(/^Pasted image /)).toBeVisible();
  await expect(page.getByText(/1200 × 900/)).toBeVisible();
  await page.getByLabel(/Reference title/).fill("Pasted Dribbble shot");
  await pickTerm(page, "industry", "Technology");
  await page.getByRole("button", { name: "Save reference" }).click();
  await page.waitForURL(/\/references\/ref_/);
  const id = page.url().split("/").pop()!;
  const detail = await (await page.request.get(`/api/references/${id}`, { headers: { Authorization: `Bearer ${API_KEY}` } })).json();
  expect(detail.data.images[0].mimeType).toBe("image/webp");
  await page.request.delete(`/api/app/references/${id}`, { headers: { "Sec-Fetch-Site": "same-origin" } });
});

test("uploads an MP4, uses it as cover, autoplays it in the gallery and switches cover", async ({ page }) => {
  await page.goto("/references/new");
  await page.getByLabel("Choose screenshot files").setInputFiles([
    await screenshotFile("still.png", "#eeeeee"),
    { name: "motion.mp4", mimeType: "video/mp4", buffer: fs.readFileSync(path.join(__dirname, "../fixtures/sample.mp4")) },
  ]);
  await expect(page.getByText(/Video · 640 × 480/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Use motion.mp4 as cover" }).click();
  await expect(page.getByRole("button", { name: "This is the cover" })).toBeVisible();
  await page.getByLabel(/Reference title/).fill("Animated hero");
  await pickTerm(page, "industry", "Technology");
  await page.getByRole("button", { name: "Save reference" }).click();
  await page.waitForURL(/\/references\/ref_/);
  const id = page.url().split("/").pop()!;

  // Detail viewer plays the video (streamed with HTTP Range requests).
  const viewerVideo = page.getByRole("region", { name: "Screenshots" }).locator("video");
  await expect(viewerVideo).toBeVisible();
  await expect.poll(() => viewerVideo.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 10_000 }).toBeGreaterThan(0);

  // Gallery thumbnail autoplays, muted and looping.
  await page.goto("/");
  const card = page.getByRole("article").filter({ hasText: "Animated hero" });
  const galleryVideo = card.locator("video");
  await expect(galleryVideo).toHaveAttribute("src", /\/original$/);
  await expect.poll(() => galleryVideo.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0 && v.muted && v.loop), { timeout: 10_000 }).toBe(true);
  await expect(card.getByText("0:02")).toBeVisible();

  // Media filter
  await page.goto("/?media=video");
  await expect(page.getByRole("article")).toHaveCount(1);

  // Choose the screenshot as cover instead.
  await page.goto(`/references/${id}/edit`);
  await page.getByRole("button", { name: "Use screenshot 2 as cover" }).click();
  await expect(page.getByText("Cover updated")).toBeVisible();
  const detail = await (await page.request.get(`/api/references/${id}`, { headers: { Authorization: `Bearer ${API_KEY}` } })).json();
  expect(detail.data.images.map((i: { mediaType: string }) => i.mediaType)).toEqual(["image", "video"]);
  await page.goto("/");
  await expect(page.getByRole("article").filter({ hasText: "Animated hero" }).locator("video")).toHaveCount(0);
  await page.request.delete(`/api/app/references/${id}`, { headers: { "Sec-Fetch-Site": "same-origin" } });
});

test("switches app theme without altering screenshots", async ({ page }) => {
  await page.goto(`/references/${refId}`);
  const img = page.getByRole("region", { name: "Screenshots" }).getByRole("img", { name: /screenshot 1/ });
  await expect(img).toBeVisible();
  const srcBefore = await img.getAttribute("src");
  expect(srcBefore).toMatch(/\/api\/images\/img_\w+\/preview$/);
  await page.getByRole("button", { name: /^Theme:/ }).click();
  await page.getByRole("menuitem", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(img).toBeVisible();
  expect(await img.getAttribute("src")).toBe(srcBefore);
  await expect(page.getByText(/Unknown theme/).first()).toBeVisible();
  await page.getByRole("button", { name: /^Theme:/ }).click();
  await page.getByRole("menuitem", { name: "Light" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

for (const width of [360, 390, 500, 768, 1024, 1280, 1440, 1920]) {
  test(`responsive layout has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", `/references/${refId}`, "/references/new", "/collections", "/settings"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
    }
  });
}

test("mobile navigation drawer works", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("complementary", { name: "Sidebar" })).toBeHidden();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Collections" }).click();
  await page.waitForURL(/\/collections$/);
  await expect(page.getByRole("heading", { level: 1, name: /Collections/ })).toBeVisible();
});

test("deletes a reference after confirmation", async ({ page }) => {
  await page.goto(`/references/${refId}`);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete reference" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("cannot be undone");
  await page.getByRole("button", { name: "Delete reference" }).click();
  await page.waitForURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Conditioning shampoo PDP" })).toHaveCount(0);
  expect((await page.request.get(`/api/references/${refId}`, { headers: { Authorization: `Bearer ${API_KEY}` } })).status()).toBe(404);
  await page.goto(`/references/${refId}`);
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
});

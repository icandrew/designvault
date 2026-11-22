/**
 * Optional website screenshot capture with Playwright (local Chromium).
 *
 * Respects access restrictions: no stored cookies, no authentication, no
 * stealth or anti-bot evasion, no paywall bypass. Pages that block automated
 * browsers simply fail with a clear message, and users can upload a manual
 * screenshot instead.
 */
import type { Browser } from "playwright";
import { DEFAULT_VIEWPORT_SIZES, type Viewport } from "@/lib/domain";
import { getConfig } from "./config";
import { BlockedUrlError, createHostGuard, parsePublicUrl } from "./net-guard";
import { stageUpload } from "./staging";

export class CaptureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptureError";
  }
}

export interface CaptureRequest {
  url: string;
  viewports: Exclude<Viewport, "custom">[];
  fullPage: boolean;
  themes: ("light" | "dark")[];
}

const MAX_FULL_PAGE_HEIGHT = 15000;

let browserPromise: Promise<Browser> | null = null;
let idleTimer: NodeJS.Timeout | null = null;

async function getBrowser() {
  if (idleTimer) clearTimeout(idleTimer);
  if (!browserPromise) {
    browserPromise = import("playwright").then(({ chromium }) => chromium.launch({ headless: true })).catch((error) => {
      browserPromise = null;
      if (String(error).includes("Executable doesn't exist")) {
        throw new CaptureError("The capture browser is not installed. Run `npx playwright install chromium` once, then try again.");
      }
      throw error;
    });
  }
  return browserPromise;
}

function scheduleClose() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    const p = browserPromise;
    browserPromise = null;
    if (p) (await p.catch(() => null))?.close().catch(() => undefined);
  }, 60_000);
}

function friendlyError(error: unknown, timeoutMs: number): string {
  const msg = String((error as Error)?.message ?? error);
  if (error instanceof CaptureError || error instanceof BlockedUrlError) return (error as Error).message;
  if (/Timeout|timeout/.test(msg)) return `The page took longer than ${Math.round(timeoutMs / 1000)} seconds to load.`;
  if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND/.test(msg)) return "That website could not be found. Check the address.";
  if (/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED/.test(msg)) return "The website refused the connection.";
  if (/ERR_BLOCKED_BY_CLIENT|ERR_ACCESS_DENIED/.test(msg)) return "The page tried to load a private network address, so capture was stopped.";
  if (/ERR_CERT|SSL/.test(msg)) return "The website’s security certificate is invalid.";
  if (/ERR_TOO_MANY_REDIRECTS/.test(msg)) return "The website redirected too many times.";
  return "The page could not be captured. You can upload a screenshot manually instead.";
}

export async function capture(req: CaptureRequest) {
  const { captureTimeoutMs } = getConfig();
  const target = parsePublicUrl(req.url);
  const guard = createHostGuard();
  if (!(await guard(target.toString()))) throw new BlockedUrlError();

  const browser = await getBrowser();
  const results: {
    uploadId: string;
    width: number;
    height: number;
    bytes: number;
    sha256: string;
    duplicates: Awaited<ReturnType<typeof stageUpload>>["duplicates"];
    viewport: Exclude<Viewport, "custom">;
    viewportWidth: number;
    viewportHeight: number;
    theme: "light" | "dark";
  }[] = [];
  const failures: string[] = [];
  let pageTitle: string | null = null;
  let finalUrl = target.toString();

  try {
    for (const viewport of req.viewports) {
      for (const theme of req.themes) {
        const size = DEFAULT_VIEWPORT_SIZES[viewport];
        const context = await browser.newContext({
          viewport: size,
          deviceScaleFactor: viewport === "desktop" ? 1 : 2,
          isMobile: viewport === "mobile",
          hasTouch: viewport !== "desktop",
          colorScheme: theme,
          reducedMotion: "reduce",
          javaScriptEnabled: true,
          acceptDownloads: false,
          serviceWorkers: "block",
        });
        try {
          await context.route("**/*", async (route) => {
            if (await guard(route.request().url())) await route.continue();
            else await route.abort("accessdenied");
          });
          const page = await context.newPage();
          page.setDefaultTimeout(captureTimeoutMs);
          const response = await page.goto(target.toString(), { waitUntil: "load", timeout: captureTimeoutMs });
          if (!response) throw new CaptureError("The website did not respond.");
          const status = response.status();
          if (status === 401 || status === 403) {
            throw new CaptureError(`The website denied access (HTTP ${status}). It may require sign-in or block automated browsers.`);
          }
          if (status >= 400) throw new CaptureError(`The website responded with an error (HTTP ${status}).`);
          await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
          finalUrl = page.url();
          pageTitle ??= (await page.title().catch(() => "")) || null;

          let clip: { x: number; y: number; width: number; height: number } | undefined;
          if (req.fullPage) {
            // Scroll through the page so lazy-loaded content renders, then return to top.
            const docHeight = await page.evaluate(async (max) => {
              const step = window.innerHeight * 0.8;
              for (let y = 0; y < Math.min(document.documentElement.scrollHeight, max); y += step) {
                window.scrollTo(0, y);
                await new Promise((r) => setTimeout(r, 120));
              }
              window.scrollTo(0, 0);
              await new Promise((r) => setTimeout(r, 400));
              return document.documentElement.scrollHeight;
            }, MAX_FULL_PAGE_HEIGHT);
            if (docHeight > MAX_FULL_PAGE_HEIGHT) clip = { x: 0, y: 0, width: size.width, height: MAX_FULL_PAGE_HEIGHT };
          }
          const png = await page.screenshot({ type: "png", fullPage: req.fullPage, clip, animations: "disabled" });
          const staged = await stageUpload(png);
          results.push({
            uploadId: staged.uploadId,
            width: staged.width,
            height: staged.height,
            bytes: staged.bytes,
            sha256: staged.sha256,
            duplicates: staged.duplicates,
            viewport,
            viewportWidth: size.width,
            viewportHeight: size.height,
            theme,
          });
        } catch (error) {
          failures.push(`${viewport} (${theme}): ${friendlyError(error, captureTimeoutMs)}`);
        } finally {
          await context.close().catch(() => undefined);
        }
      }
    }
  } finally {
    scheduleClose();
  }

  if (results.length === 0) {
    throw new CaptureError(failures[0]?.replace(/^[^:]+: /, "") ?? "The page could not be captured.");
  }

  // If dark captures are identical to light ones, the site has no dark theme for this viewport.
  let darkModeDetected: "yes" | "no" | "unknown" = "unknown";
  if (req.themes.length === 2) {
    let identical = 0;
    let compared = 0;
    for (const viewport of req.viewports) {
      const light = results.find((r) => r.viewport === viewport && r.theme === "light");
      const dark = results.find((r) => r.viewport === viewport && r.theme === "dark");
      if (light && dark) {
        compared++;
        if (light.sha256 === dark.sha256) {
          identical++;
          results.splice(results.indexOf(dark), 1);
        }
      }
    }
    if (compared) darkModeDetected = identical === compared ? "no" : "yes";
  }

  const host = new URL(finalUrl).hostname.replace(/^www\./, "");
  return {
    finalUrl,
    pageTitle,
    siteName: pageTitle?.split(/\s[|–—-]\s/).pop()?.trim() || host,
    darkModeDetected,
    failures,
    images: results.map(({ sha256: _s, ...r }) => {
      void _s;
      return r;
    }),
  };
}

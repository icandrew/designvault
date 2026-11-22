import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { referenceInputSchema, type ReferenceInput } from "@/lib/domain";
import { closeDb } from "@/server/db/client";
import { processImage } from "@/server/images";
import { createReference } from "@/server/repositories/references";

/** Points the app at a fresh, isolated data directory. Never touches real user data. */
export function createTempVault() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "design-vault-test-"));
  process.env.DESIGN_VAULT_DATA_DIR = dir;
  // `npm run test:libsql` runs the same suite on the libSQL engine used for
  // hosted (Turso) vaults, via a local libSQL file.
  if (process.env.DV_TEST_ENGINE === "libsql") {
    process.env.TURSO_DATABASE_URL = `file:${path.join(dir, "vault-libsql.db").replace(/\\/g, "/")}`;
  }
  return {
    dir,
    cleanup() {
      closeDb();
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
      } catch {
        // Windows may keep the libSQL file locked briefly after closing; it's a temp folder.
      }
    },
  };
}

export async function makePng(width = 1200, height = 1600, color = "#336699") {
  return sharp({ create: { width, height, channels: 3, background: color } })
    .composite([{ input: Buffer.from(`<svg width="${width}" height="${height}"><rect x="40" y="40" width="${width / 2}" height="80" fill="#111"/><rect x="${width * 0.6}" y="200" width="${width / 3}" height="${height / 3}" fill="#e33"/></svg>`), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

export async function addReference(input: Partial<ReferenceInput> & { title: string }, color = "#336699", size: [number, number] = [1200, 1600]) {
  const processed = await processImage(await makePng(size[0], size[1], color), 25 * 1024 * 1024);
  return createReference(referenceInputSchema.parse({ industry: "Other", ...input }), [
    { processed, meta: { label: null, viewport: "desktop", theme: "light", screenshotType: "full_page" } },
  ]);
}

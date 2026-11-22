import sharp from "sharp";
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { detectFormat, ImageValidationError, isMp4, processImage, processVideo, validateVideo } from "@/server/images";
import { isPrivateAddress, parsePublicUrl } from "@/server/net-guard";
import { assertValidKey } from "@/server/storage";
import { makePng } from "./helpers";

describe("upload validation", () => {
  it("validates file signatures, not names", async () => {
    expect(detectFormat(await makePng(100, 100))).toBe("png");
    const fake = Buffer.from("<html>not an image</html>".padEnd(64, " "));
    expect(detectFormat(fake)).toBeNull();
    await expect(processImage(fake, 1024 * 1024)).rejects.toBeInstanceOf(ImageValidationError);
  });

  it("accepts WebP screenshots and keeps the original format", async () => {
    const webp = await sharp({ create: { width: 900, height: 700, channels: 3, background: "#224466" } }).webp().toBuffer();
    expect(detectFormat(webp)).toBe("webp");
    const processed = await processImage(webp, 25 * 1024 * 1024);
    expect(processed.mimeType).toBe("image/webp");
    expect(processed.original.equals(webp)).toBe(true);
  });

  it("validates MP4 videos by signature and builds thumbnails from the poster frame", async () => {
    const mp4 = fs.readFileSync(path.join(__dirname, "../fixtures/sample.mp4"));
    expect(isMp4(mp4)).toBe(true);
    const audioOnly = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypM4A "), Buffer.alloc(24)]);
    expect(isMp4(audioOnly)).toBe(false);
    expect(isMp4(await makePng(100, 100))).toBe(false);
    expect(() => validateVideo(Buffer.from("not a video at all......"), 1024 * 1024)).toThrow(/Only MP4/);
    expect(() => validateVideo(mp4, 100)).toThrow(/larger than/);

    const poster = await makePng(640, 480);
    const processed = await processVideo(mp4, poster, { width: 640, height: 480, durationMs: 2000 }, 200 * 1024 * 1024);
    expect(processed.mediaType).toBe("video");
    expect(processed.mimeType).toBe("video/mp4");
    expect(processed.format).toBe("mp4");
    expect(processed.durationMs).toBe(2000);
    expect(processed.original.equals(mp4)).toBe(true);
    expect(processed.thumb.width).toBe(640);
    await expect(processVideo(mp4, Buffer.from("broken"), { width: 640, height: 480, durationMs: 2000 }, 200 * 1024 * 1024)).rejects.toThrow(/preview frame/);
  });

  it("rejects oversized and corrupted files", async () => {
    const png = await makePng(200, 200);
    await expect(processImage(png, 100)).rejects.toThrow(/larger than/);
    const corrupted = Buffer.concat([png.subarray(0, 40), Buffer.alloc(200)]);
    await expect(processImage(corrupted, 1024 * 1024)).rejects.toBeInstanceOf(ImageValidationError);
  });

  it("never upscales previews and crops tall thumbnails to at most 1:2", async () => {
    const small = await processImage(await makePng(400, 300), 25 * 1024 * 1024);
    expect(small.preview.width).toBe(400);
    const tall = await processImage(await makePng(1440, 9000), 25 * 1024 * 1024);
    expect(tall.thumb.height / tall.thumb.width).toBeLessThanOrEqual(2.001);
    expect(tall.width).toBe(1440);
  });
});

describe("storage keys", () => {
  it("rejects traversal and unexpected keys", () => {
    expect(() => assertValidKey("originals/img_abcdefgh1234.png")).not.toThrow();
    expect(() => assertValidKey("../vault.db")).toThrow();
    expect(() => assertValidKey("originals/../../etc/passwd")).toThrow();
    expect(() => assertValidKey("originals/img_abc.exe")).toThrow();
    expect(() => assertValidKey("originals/img_abcdefgh1234.mp4")).not.toThrow();
    expect(() => assertValidKey("thumbs/img_abcdefgh1234.mp4.exe")).toThrow();
  });
});

describe("SSRF guard for URL capture", () => {
  it("blocks private, loopback and link-local addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.10", "172.20.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1", "0.0.0.0"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
  });

  it("rejects unsafe URLs", () => {
    expect(() => parsePublicUrl("file:///etc/passwd")).toThrow();
    expect(() => parsePublicUrl("http://localhost:3000")).toThrow();
    expect(() => parsePublicUrl("http://127.0.0.1/")).toThrow();
    expect(() => parsePublicUrl("http://169.254.169.254/latest/meta-data")).toThrow();
    expect(() => parsePublicUrl("https://user:pass@example.com")).toThrow();
    expect(() => parsePublicUrl("https://example.com:22")).toThrow();
    expect(() => parsePublicUrl("http://intranet")).toThrow();
    expect(parsePublicUrl("https://example.com/page").hostname).toBe("example.com");
  });
});

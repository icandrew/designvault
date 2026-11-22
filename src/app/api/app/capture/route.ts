import { z } from "zod";
import { capture, CaptureError } from "@/server/capture";
import { handle, HttpError, ok, rateLimit, readJson, requireSameOrigin } from "@/server/http";
import { BlockedUrlError } from "@/server/net-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const schema = z.object({
  url: z.string().trim().min(1, "Enter a website address.").max(2048),
  viewports: z.array(z.enum(["desktop", "tablet", "mobile"])).min(1, "Choose at least one viewport.").max(3),
  fullPage: z.boolean().default(true),
  themes: z.array(z.enum(["light", "dark"])).min(1).max(2).default(["light"]),
});

/** Captures screenshots of a public URL and stages them for the Add Reference form. */
export const POST = handle(async (req: Request) => {
  requireSameOrigin(req);
  rateLimit("capture", 10, 60_000);
  const body = schema.parse(await readJson(req));
  try {
    return ok(await capture(body));
  } catch (error) {
    if (error instanceof BlockedUrlError) throw new HttpError(400, error.message, "blocked_url");
    if (error instanceof CaptureError) throw new HttpError(422, error.message, "capture_failed");
    throw error;
  }
});

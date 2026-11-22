import { z } from "zod";
import { handle, ok, readJson, requireSameOrigin } from "@/server/http";
import { deleteSampleReferences } from "@/server/repositories/references";
import { getApiKey, regenerateApiKey } from "@/server/repositories/settings";
import { loadSampleData } from "@/server/sample-data";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  requireSameOrigin(req);
  return ok(await getApiKey());
});

export const POST = handle(async (req: Request) => {
  requireSameOrigin(req);
  const { action } = z
    .object({ action: z.enum(["regenerate_api_key", "load_sample_data", "remove_sample_data"]) })
    .parse(await readJson(req));
  if (action === "regenerate_api_key") return ok({ key: await regenerateApiKey() });
  if (action === "load_sample_data") return ok({ created: await loadSampleData() });
  return ok({ removed: await deleteSampleReferences() });
});

import { z } from "zod";
import { imageMetaSchema, referenceInputSchema } from "@/lib/domain";
import { getConfig } from "./config";
import { processImage, processVideo } from "./images";
import { addImages, createReference, replaceImage, updateReference, type NewImage } from "./repositories/references";
import { discardStaged, readStagedItem } from "./staging";

export const stagedImageSchema = z.object({
  uploadId: z.string().max(60),
  meta: imageMetaSchema.default({ label: null, viewport: "desktop", theme: "unknown", screenshotType: "full_page" }),
  source: z.enum(["upload", "capture"]).default("upload"),
});

export const createReferenceRequest = z.object({
  input: referenceInputSchema,
  images: z.array(stagedImageSchema).min(1, "Add at least one screenshot.").max(20),
});

async function processStaged(images: z.output<typeof stagedImageSchema>[]): Promise<NewImage[]> {
  const { maxUploadBytes, maxVideoBytes } = getConfig();
  const out: NewImage[] = [];
  for (const img of images) {
    const { data, video } = await readStagedItem(img.uploadId);
    const processed = video ? await processVideo(data, video.poster, video.meta, maxVideoBytes) : await processImage(data, maxUploadBytes);
    out.push({ processed, meta: img.meta, source: img.source });
  }
  return out;
}

export async function createFromStaged(body: unknown) {
  const { input, images } = createReferenceRequest.parse(body);
  const processed = await processStaged(images);
  const id = await createReference(input, processed);
  await discardStaged(images.map((i) => i.uploadId));
  return id;
}

export async function updateFromBody(id: string, body: unknown) {
  const input = referenceInputSchema.parse(body);
  await updateReference(id, input);
}

export async function addStagedImages(referenceId: string, body: unknown) {
  const { images } = z.object({ images: z.array(stagedImageSchema).min(1).max(20) }).parse(body);
  const processed = await processStaged(images);
  const ids = await addImages(referenceId, processed);
  await discardStaged(images.map((i) => i.uploadId));
  return ids;
}

export async function replaceWithStaged(imageId: string, body: unknown) {
  const img = stagedImageSchema.parse(body);
  const [processed] = await processStaged([img]);
  await replaceImage(imageId, processed);
  await discardStaged([img.uploadId]);
}

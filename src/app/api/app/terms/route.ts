import { z } from "zod";
import { TERM_KINDS } from "@/lib/domain";
import { handle, ok, readJson, requireSameOrigin } from "@/server/http";
import { createTerm, deleteTerm, listTerms, renameTerm } from "@/server/repositories/taxonomy";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  requireSameOrigin(req);
  return ok(await listTerms());
});

export const POST = handle(async (req: Request) => {
  requireSameOrigin(req);
  const { kind, name } = z.object({ kind: z.enum(TERM_KINDS), name: z.string().trim().min(1).max(60) }).parse(await readJson(req));
  return ok(await createTerm(kind, name), { status: 201 });
});

export const PATCH = handle(async (req: Request) => {
  requireSameOrigin(req);
  const { id, name } = z.object({ id: z.string().max(40), name: z.string().trim().min(1).max(60) }).parse(await readJson(req));
  const term = await renameTerm(id, name);
  return ok(term);
});

export const DELETE = handle(async (req: Request) => {
  requireSameOrigin(req);
  const { id } = z.object({ id: z.string().max(40) }).parse(await readJson(req));
  await deleteTerm(id);
  return ok({ deleted: true });
});

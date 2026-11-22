import { handle, requireSameOrigin } from "@/server/http";
import { exportLibrary } from "@/server/backup";

export const dynamic = "force-dynamic";

/** Portable JSON export of all metadata (images are backed up with `npm run backup`). */
export const GET = handle(async (req: Request) => {
  requireSameOrigin(req);
  const data = await exportLibrary();
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="design-vault-export-${stamp}.json"`,
    },
  });
});

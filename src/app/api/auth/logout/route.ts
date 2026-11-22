import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/server/auth";
import { handle, requireSameOrigin } from "@/server/http";

export const dynamic = "force-dynamic";

/** Signs out by clearing the session cookie. */
export const POST = handle(async (req: Request) => {
  requireSameOrigin(req);
  const res = NextResponse.json({ data: { ok: true } });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0, sameSite: "lax" });
  return res;
});

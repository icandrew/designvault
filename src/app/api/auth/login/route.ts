import { NextResponse } from "next/server";
import { authSettings, checkPassword, createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_S } from "@/server/auth";
import { handle, HttpError, rateLimit, readJson, requireSameOrigin } from "@/server/http";

export const dynamic = "force-dynamic";

/** Signs in with the vault password and sets the session cookie. */
export const POST = handle(async (req: Request) => {
  requireSameOrigin(req);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  rateLimit(`login:${ip}`, 8, 5 * 60_000);
  const s = authSettings();
  if (!s.password) throw new HttpError(400, "Login is not enabled on this vault.", "bad_request");
  const body = (await readJson(req)) as { password?: unknown };
  const password = typeof body.password === "string" ? body.password : "";
  if (!checkPassword(password, s)) {
    // Small fixed delay slows down guessing.
    await new Promise((r) => setTimeout(r, 600));
    throw new HttpError(401, "That password isn’t right.", "unauthorized");
  }
  const res = NextResponse.json({ data: { ok: true } });
  res.cookies.set(SESSION_COOKIE, createSessionToken(s), {
    httpOnly: true,
    secure: new URL(req.url).protocol === "https:" || s.onVercel,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
});

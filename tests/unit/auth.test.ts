import { describe, expect, it } from "vitest";
import { checkPassword, createSessionToken, safeNextPath, SESSION_MAX_AGE_S, verifySessionToken, type AuthSettings } from "@/server/auth";

const settings: AuthSettings = { password: "correct horse battery staple", sessionSecret: null, onVercel: true };

describe("hosted login", () => {
  it("accepts only the right password", () => {
    expect(checkPassword("correct horse battery staple", settings)).toBe(true);
    expect(checkPassword("Correct horse battery staple", settings)).toBe(false);
    expect(checkPassword("", settings)).toBe(false);
    expect(checkPassword("anything", { ...settings, password: null })).toBe(false);
  });

  it("issues session tokens that verify, and rejects tampered or expired ones", () => {
    const now = Date.now();
    const token = createSessionToken(settings, now);
    expect(verifySessionToken(token, settings, now)).toBe(true);

    const [v, expiry, sig] = token.split(".");
    expect(verifySessionToken(`${v}.${Number(expiry) + 1000}.${sig}`, settings, now)).toBe(false);
    expect(verifySessionToken(`${v}.${expiry}.${sig.slice(0, -2)}xx`, settings, now)).toBe(false);
    expect(verifySessionToken(token, settings, now + SESSION_MAX_AGE_S * 1000 + 1)).toBe(false);
    expect(verifySessionToken("garbage", settings, now)).toBe(false);
    expect(verifySessionToken(undefined, settings, now)).toBe(false);
  });

  it("signs everyone out when the password or secret changes", () => {
    const token = createSessionToken(settings);
    expect(verifySessionToken(token, { ...settings, password: "a new password" })).toBe(false);
    expect(verifySessionToken(token, { ...settings, sessionSecret: "rotated" })).toBe(false);
    expect(verifySessionToken(token, { ...settings, password: null })).toBe(false);
  });

  it("only redirects back into the app after sign-in", () => {
    expect(safeNextPath("/references/new")).toBe("/references/new");
    expect(safeNextPath("/?q=hero")).toBe("/?q=hero");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});

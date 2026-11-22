import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"; // Crockford-style base32, no ambiguous chars

/** Stable, URL-safe identifiers with a readable type prefix, e.g. `ref_8m2k4q7x9c1d`. */
export function newId(prefix: "ref" | "img" | "col" | "trm", length = 12) {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % 32];
  return `${prefix}_${out}`;
}

export function slugify(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export const ID_PATTERN = /^(ref|img|col|trm)_[0-9a-z]{6,32}$/;

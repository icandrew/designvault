/**
 * SSRF protection for server-side URL capture. Only public http(s) hosts on
 * standard ports are allowed; every request the headless browser makes
 * (including redirects and subresources) is re-checked against this guard.
 */
import { lookup } from "node:dns/promises";
import net from "node:net";
import { getConfig } from "./config";

export class BlockedUrlError extends Error {
  constructor(message = "This address points to a private or local network and cannot be captured.") {
    super(message);
    this.name = "BlockedUrlError";
  }
}

const blocked = new net.BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(addr, prefix, "ipv4");
}
for (const [addr, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["64:ff9b::", 96],
  ["2001:db8::", 32],
  // Note: IPv4-mapped addresses (::ffff:a.b.c.d) are unwrapped and checked as IPv4 below.
  // Adding ::ffff:0:0/96 here would make Node's BlockList match every IPv4 address.
] as const) {
  blocked.addSubnet(addr, prefix, "ipv6");
}

export function isPrivateAddress(address: string) {
  const family = net.isIP(address);
  if (family === 4) return blocked.check(address, "ipv4");
  if (family === 6) {
    const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped) return blocked.check(mapped[1], "ipv4");
    return blocked.check(address, "ipv6");
  }
  return true;
}

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".corp", ".intranet"];

/** Validates the URL shape. Throws a user-friendly error when not allowed. */
export function parsePublicUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new BlockedUrlError("Enter a full website address, starting with https://");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedUrlError("Only http:// and https:// addresses can be captured.");
  }
  if (url.username || url.password) throw new BlockedUrlError("Addresses with embedded credentials are not supported.");
  if (getConfig().captureAllowPrivateHosts) return url;
  if (url.port && !["80", "443"].includes(url.port)) {
    throw new BlockedUrlError("Only standard web ports (80 and 443) can be captured.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || BLOCKED_SUFFIXES.some((s) => host.endsWith(s)) || !host.includes(".") && !net.isIP(host)) {
    throw new BlockedUrlError();
  }
  if (net.isIP(host) && isPrivateAddress(host)) throw new BlockedUrlError();
  return url;
}

/** Resolves the host and rejects if any resolved address is private. Results are cached per guard. */
export function createHostGuard() {
  const cache = new Map<string, Promise<boolean>>();
  const allowPrivate = getConfig().captureAllowPrivateHosts;
  return async function isAllowed(rawUrl: string): Promise<boolean> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return false;
    }
    if (url.protocol === "data:" || url.protocol === "blob:") return true;
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (allowPrivate) return true;
    try {
      parsePublicUrl(rawUrl);
    } catch {
      return false;
    }
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host)) return !isPrivateAddress(host);
    if (!cache.has(host)) {
      cache.set(
        host,
        lookup(host, { all: true, verbatim: true })
          .then((addrs) => addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address)))
          .catch(() => false),
      );
    }
    return cache.get(host)!;
  };
}

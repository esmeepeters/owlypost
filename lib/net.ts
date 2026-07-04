import { lookup } from "node:dns/promises";
import net from "node:net";

// SSRF protection for outbound fetches of user- and feed-supplied URLs.
// Everything the app fetches (feed detection, feed bodies, full-text
// extraction) points at hosts the operator does not control, so a request
// could otherwise be aimed at loopback, the container's own services, the LAN,
// or a cloud metadata endpoint. We resolve the host and reject private,
// loopback, link-local and reserved addresses before connecting — on the
// initial URL and again on every redirect hop.

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

// Keeps only http(s) URLs. Feed-supplied links (item links, site URLs) are
// attacker-controlled, so a "javascript:" or "data:" value must never reach an
// href in the UI. Anything else becomes null.
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function ipv4ToInt(ip: string): number {
  const p = ip.split(".").map(Number);
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}

function ipv4InRange(n: number, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (n & mask) === (ipv4ToInt(base) & mask);
}

function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return (
    ipv4InRange(n, "0.0.0.0", 8) || // "this network"
    ipv4InRange(n, "10.0.0.0", 8) || // private
    ipv4InRange(n, "100.64.0.0", 10) || // carrier-grade NAT
    ipv4InRange(n, "127.0.0.0", 8) || // loopback
    ipv4InRange(n, "169.254.0.0", 16) || // link-local (incl. cloud metadata)
    ipv4InRange(n, "172.16.0.0", 12) || // private
    ipv4InRange(n, "192.0.0.0", 24) || // IETF protocol assignments
    ipv4InRange(n, "192.168.0.0", 16) || // private
    ipv4InRange(n, "198.18.0.0", 15) || // benchmarking
    ipv4InRange(n, "224.0.0.0", 4) || // multicast
    ipv4InRange(n, "240.0.0.0", 4) // reserved
  );
}

// Expands an IPv6 literal (including "::" compression and IPv4-mapped tails)
// to its 16 bytes, or null when it is not a valid address.
function ipv6ToBytes(input: string): number[] | null {
  let ip = input;

  // Rewrite an IPv4-mapped tail (…:a.b.c.d) into two hex groups.
  const lastColon = ip.lastIndexOf(":");
  const tail = ip.slice(lastColon + 1);
  if (tail.includes(".")) {
    const p = tail.split(".").map(Number);
    if (p.length !== 4 || p.some((x) => Number.isNaN(x) || x < 0 || x > 255)) {
      return null;
    }
    const hi = ((p[0] << 8) | p[1]).toString(16);
    const lo = ((p[2] << 8) | p[3]).toString(16);
    ip = `${ip.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1) {
    if (head.length !== 8) return null;
  }
  const missing = 8 - head.length - rest.length;
  if (missing < 0) return null;
  const groups = [
    ...head,
    ...(halves.length === 2 ? Array(missing).fill("0") : []),
    ...rest,
  ];
  if (groups.length !== 8) return null;

  const bytes: number[] = [];
  for (const g of groups) {
    const v = parseInt(g || "0", 16);
    if (Number.isNaN(v) || v < 0 || v > 0xffff) return null;
    bytes.push((v >> 8) & 0xff, v & 0xff);
  }
  return bytes;
}

function isBlockedIpv6(ip: string): boolean {
  const b = ipv6ToBytes(ip);
  if (!b) return true; // unparseable → treat as unsafe

  // IPv4-mapped (::ffff:a.b.c.d): validate the embedded IPv4 instead.
  const mappedPrefix = b.slice(0, 10).every((x) => x === 0);
  if (mappedPrefix && b[10] === 0xff && b[11] === 0xff) {
    return isBlockedIpv4(`${b[12]}.${b[13]}.${b[14]}.${b[15]}`);
  }

  const allZero = b.every((x) => x === 0);
  if (allZero) return true; // unspecified ::
  if (b.slice(0, 15).every((x) => x === 0) && b[15] === 1) return true; // ::1
  if ((b[0] & 0xfe) === 0xfc) return true; // fc00::/7 unique-local
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // fe80::/10 link-local
  if (b[0] === 0xff) return true; // ff00::/8 multicast
  return false;
}

// True when the literal IP address falls in a private/loopback/reserved range.
export function isBlockedAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isBlockedIpv4(ip);
  if (family === 6) return isBlockedIpv6(ip);
  return true; // not a valid IP literal → refuse
}

// Throws SsrfError unless the URL is http(s) and resolves only to public
// addresses. IP literals are checked directly; hostnames are resolved and
// every returned address must be public (a name resolving to any private
// address is rejected).
export async function assertPublicUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError(`Not a valid URL: ${rawUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfError(`Blocked non-http(s) URL: ${url.protocol}`);
  }

  const host = url.hostname.startsWith("[")
    ? url.hostname.slice(1, -1)
    : url.hostname;

  let addresses: string[];
  if (net.isIP(host)) {
    addresses = [host];
  } else {
    const resolved = await lookup(host, { all: true }).catch(() => []);
    addresses = resolved.map((r) => r.address);
    if (addresses.length === 0) {
      throw new SsrfError(`Could not resolve host: ${host}`);
    }
  }

  for (const address of addresses) {
    if (isBlockedAddress(address)) {
      throw new SsrfError(`Blocked private address for ${host}: ${address}`);
    }
  }
}

const MAX_REDIRECTS = 5;

// Drop-in fetch that enforces assertPublicUrl before the initial request and
// before following each redirect (redirects are followed manually so an
// off-limits Location can't be chased automatically). Any caller-supplied
// `redirect` option is overridden.
export async function safeFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(current);
    const response = await fetch(current, { ...init, redirect: "manual" });

    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current).toString();
      continue;
    }
    return response;
  }
  throw new SsrfError(`Too many redirects while fetching ${url}`);
}

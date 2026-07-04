import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Owly Post has no authentication (single-user, self-hosted). That makes two
// browser-borne attacks worth blocking even on a private network:
//
//  - CSRF: a page the user visits elsewhere can fire cross-site POST/DELETE at
//    the app (delete sources, overwrite the profile, burn LLM credits). We
//    reject any state-changing request whose Origin isn't the app itself.
//  - DNS rebinding: an attacker who controls DNS can point a hostname at the
//    app's address and read responses. Validating the Host header against an
//    allowlist defeats it.
//
// This is defense in depth, not a replacement for the reverse proxy / VPN the
// README calls for.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Hostnames always considered the app's own (loopback for local/dev use).
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Explicit allowlist from ALLOWED_HOSTS (comma-separated), falling back to the
// host of SITE_URL. Ports are ignored in the comparison.
function allowedHosts(): Set<string> {
  const hosts = new Set(LOCAL_HOSTS);
  const raw = process.env.ALLOWED_HOSTS ?? "";
  for (const entry of raw.split(",")) {
    const host = entry.trim().toLowerCase();
    if (host) hosts.add(host);
  }
  if (process.env.SITE_URL) {
    try {
      hosts.add(new URL(process.env.SITE_URL).hostname.toLowerCase());
    } catch {
      // Ignore an unparseable SITE_URL.
    }
  }
  return hosts;
}

function hostname(hostHeader: string | null): string | null {
  if (!hostHeader) return null;
  // Strip the port; keep IPv6 brackets so "[::1]" matches LOCAL_HOSTS.
  const trimmed = hostHeader.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    return trimmed.slice(0, trimmed.indexOf("]") + 1) || trimmed;
  }
  return trimmed.split(":")[0];
}

export function middleware(request: NextRequest): NextResponse {
  const allowed = allowedHosts();

  // 1. DNS-rebinding guard: the Host must be one we recognise.
  const host = hostname(request.headers.get("host"));
  if (!host || !allowed.has(host)) {
    return NextResponse.json({ error: "Invalid host." }, { status: 403 });
  }

  // 2. CSRF guard: for mutating requests, a present Origin must match an
  //    allowed host. Same-origin fetches always send Origin; a missing Origin
  //    (e.g. curl, server-to-server) is allowed through since it isn't a
  //    browser cross-site request.
  if (!SAFE_METHODS.has(request.method)) {
    const origin = request.headers.get("origin");
    if (origin) {
      let originHost: string | null = null;
      try {
        originHost = new URL(origin).hostname.toLowerCase();
      } catch {
        originHost = null;
      }
      if (!originHost || !allowed.has(originHost)) {
        return NextResponse.json(
          { error: "Cross-origin request blocked." },
          { status: 403 },
        );
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  // Guard the API surface, where every state-changing action lives.
  matcher: "/api/:path*",
};

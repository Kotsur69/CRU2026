import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Session gate for every request except sign-in, NextAuth's own API and static files.
 *
 * Verifying the JWT signature is not enough: a session revoked by a password change
 * or deactivation still carries a valid signature until it expires. Revocation lives
 * in the database (User.sessionVersion), which the edge runtime cannot reach — so we
 * ask the Node side, whose /api/auth/session runs the jwt callback in lib/auth.ts.
 *
 * It has to be here, not in a layout or template: on client-side navigation Next
 * renders only the changed segments, and a revoked cookie could read pages through
 * RSC requests that never touch the layout (verified). Every request — pages, RSC,
 * route handlers, server actions — passes through middleware. Any failure denies.
 */

/** Where the middleware reaches the Node server; the app listens on loopback only. */
const INTERNAL_ORIGIN = process.env.INTERNAL_APP_URL ?? "http://127.0.0.1:3100";
const SESSION_CHECK_TIMEOUT_MS = 5000;

function deny(req: NextRequest): NextResponse {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return NextResponse.redirect(loginUrl(req));
}

const HOST_PATTERN = /^[a-z0-9.-]+(?::\d{1,5})?$/i;

/**
 * Absolute /login URL on the host the browser used. req.url can't be used: under
 * `next start` it carries Next's own bind address (localhost:3100), while the public
 * hostname arrives in the Host header (cloudflared preserves it, verified) and changes
 * with every quick tunnel. Middleware rejects relative Location headers.
 */
function loginUrl(req: NextRequest): URL {
  const host = req.headers.get("host");
  // Built from scratch: setting .host on a clone of req.nextUrl keeps Next's port.
  if (host && HOST_PATTERN.test(host)) {
    return new URL("/login", `${req.nextUrl.protocol}//${host}`);
  }
  return new URL("/login", req.url);
}

async function hasLiveSession(req: NextRequest): Promise<boolean> {
  try {
    const res = await fetch(new URL("/api/auth/session", INTERNAL_ORIGIN), {
      headers: { cookie: req.headers.get("cookie") ?? "" },
      cache: "no-store",
      signal: AbortSignal.timeout(SESSION_CHECK_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const session: unknown = await res.json();
    return typeof session === "object" && session !== null && "user" in session;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  // Cheap first gate: no validly signed, unexpired token means no DB round trip.
  // The cookie name (__Secure- prefix or not) must follow the protocol the browser
  // actually used. getToken's default reads NEXTAUTH_URL, which Next inlines into the
  // middleware bundle at BUILD time (.env value) — not the runtime one from run-prod.ps1.
  const secureCookie = req.nextUrl.protocol === "https:";
  if (!(await getToken({ req, secureCookie }))) return deny(req);
  if (!(await hasLiveSession(req))) return deny(req);
  return NextResponse.next();
}

// Exclusions are anchored to whole path segments: an unanchored `login` would also
// exempt any future route that merely starts with it (`/login-export`, `/api/authz`).
export const config = {
  matcher: [
    "/((?!(?:login|api/auth|_next/static|_next/image|fonts)(?:/|$)|favicon\\.ico$).*)",
  ],
};

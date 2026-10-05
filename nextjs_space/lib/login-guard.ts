import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * Brute-force defences for the credentials sign-in.
 *
 * Every rule here runs on the server inside `authorize`, so nothing a browser sends —
 * edited HTML, removed `required` attributes, hand-crafted POSTs — can skip it.
 *
 * Both limits RESERVE the attempt before the password is checked. Checking first and
 * recording after the (slow, async) bcrypt compare would let a burst of parallel
 * requests all pass the check before any of them is counted.
 */

/** Consecutive failures before an account is locked. */
export const MAX_FAILED_ATTEMPTS = 5;
/** How long a lock lasts. The counter is NOT reset when it expires, so after a lock
 *  every further attempt re-locks immediately: one guess per window. */
export const LOCK_MINUTES = 15;
/** Failed attempts allowed from one IP inside the window, across all accounts. */
export const MAX_FAILED_PER_IP = 30;
export const IP_WINDOW_MS = 15 * 60 * 1000;

export const MAX_LOGIN_LENGTH = 64;
/** bcrypt silently ignores everything past 72 bytes — reject instead of truncating. */
export const MAX_PASSWORD_BYTES = 72;

/** Used when no proxy header is present (direct local access). Never rate-limited as
 *  a bucket: lumping unknown clients together would let anyone lock out everyone. */
export const UNKNOWN_IP = "unknown";

/**
 * Hash of a random throwaway secret. Compared against when the account does not exist
 * or is locked, so every rejected attempt costs one bcrypt round and response time
 * does not reveal which logins are real.
 */
const DUMMY_HASH = "$2a$12$lM4hjnT21NpNto4AVhuWZezKuF0ttkhbqxdJRCIo9KNGQSr9ok.tq";

export type LoginReason = "ok" | "bad_credentials" | "locked" | "ip_limited" | "invalid_input";

export interface Credentials {
  login: string;
  password: string;
}

/** Shape check only; returns null for anything that cannot be a real credential pair. */
export function parseCredentials(raw: unknown): Credentials | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { login, password } = raw as Record<string, unknown>;
  if (typeof login !== "string" || typeof password !== "string") return null;

  const trimmed = login.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_LOGIN_LENGTH) return null;
  if (password.length === 0 || Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    return null;
  }
  return { login: trimmed, password };
}

/**
 * Client address for rate limiting. The app only listens on 127.0.0.1 behind a
 * reverse proxy (Tailscale Funnel / cloudflared), which appends the real peer to
 * X-Forwarded-For — so the LAST entry is the trustworthy one; earlier entries are
 * whatever the client chose to send. Re-verify this when the proxy changes.
 */
export function clientIp(headers: Record<string, unknown> | undefined): string {
  const forwarded = headers?.["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded.join(",") : forwarded;
  if (typeof value === "string" && value.trim() !== "") {
    const last = value.split(",").pop()?.trim();
    if (last) return last.slice(0, 64);
  }
  return UNKNOWN_IP;
}

/** Burns the same CPU time as a real check; the result is always discarded. */
export async function equalizeTiming(password: string): Promise<void> {
  await bcrypt.compare(password, DUMMY_HASH);
}

/**
 * Opens the audit row for this attempt BEFORE any check, then counts the IP's recent
 * failures including still-running attempts (reason "pending" counts as a failure
 * until finished). Returns the row id and whether the IP is over its limit.
 */
export async function beginAttempt(
  login: string,
  ip: string,
): Promise<{ eventId: number; isIpLimited: boolean }> {
  const { id } = await prisma.loginEvent.create({
    data: { login: login.slice(0, MAX_LOGIN_LENGTH), ip, reason: "pending", success: false },
    select: { id: true },
  });
  if (ip === UNKNOWN_IP) return { eventId: id, isIpLimited: false };

  const failures = await prisma.loginEvent.count({
    where: { ip, success: false, createdAt: { gte: new Date(Date.now() - IP_WINDOW_MS) } },
  });
  return { eventId: id, isIpLimited: failures > MAX_FAILED_PER_IP };
}

export async function finishAttempt(
  eventId: number,
  reason: LoginReason,
  userId: number | null = null,
): Promise<void> {
  await prisma.loginEvent.update({
    where: { id: eventId },
    data: { reason, success: reason === "ok", userId },
  });
}

/**
 * Atomically counts this attempt against the account and applies the lock once the
 * threshold is reached — a single UPDATE, so parallel requests serialise on the row.
 * Returns false when the account is currently locked (nothing was reserved).
 * A successful sign-in then clears the counter via `registerSuccess`.
 *
 * Timestamps are compared in UTC: Prisma stores `timestamp(3)` values as UTC while
 * the database session runs in Europe/Warsaw.
 */
export async function reserveAttempt(userId: number): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ id: number }[]>`
    UPDATE "User"
    SET "failedLoginCount" = "failedLoginCount" + 1,
        "lockedUntil" = CASE
          WHEN "failedLoginCount" + 1 >= ${MAX_FAILED_ATTEMPTS}
          THEN (now() AT TIME ZONE 'UTC') + make_interval(mins => ${LOCK_MINUTES}::int)
          ELSE "lockedUntil"
        END
    WHERE id = ${userId}
      AND ("lockedUntil" IS NULL OR "lockedUntil" <= (now() AT TIME ZONE 'UTC'))
    RETURNING id`;
  return rows.length > 0;
}

export async function registerSuccess(userId: number): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      loginCount: { increment: 1 },
    },
  });
}

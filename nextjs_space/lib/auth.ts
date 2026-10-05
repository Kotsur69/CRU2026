import type { NextAuthOptions, User as AuthUser } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  beginAttempt,
  clientIp,
  equalizeTiming,
  finishAttempt,
  parseCredentials,
  registerSuccess,
  reserveAttempt,
} from "@/lib/login-guard";

/**
 * Every session is a JWT signed with this secret; whoever knows it can mint a token
 * for any user id. Refuse to run in production with a missing or placeholder value.
 */
const MIN_SECRET_LENGTH = 32;
function assertStrongSecret(): void {
  if (process.env.NODE_ENV !== "production") return;
  const secret = process.env.NEXTAUTH_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH || secret.includes("zmien-mnie")) {
    throw new Error(
      `NEXTAUTH_SECRET is missing or weak — set at least ${MIN_SECRET_LENGTH} random characters ` +
        "(e.g. `openssl rand -base64 48`) in .env.",
    );
  }
}
assertStrongSecret();

/** Session expires after this much inactivity (the cookie slides while in use). */
const IDLE_TIMEOUT_S = 8 * 60 * 60;
/** Hard cap from the moment of sign-in, however active the session is. */
const ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000;

/** Thrown from the jwt callback; NextAuth then drops the session and clears the cookie. */
const SESSION_REVOKED = "SESSION_REVOKED";

interface NamedUser {
  id: number;
  login: string | null;
  firstName: string | null;
  lastName: string | null;
}

function displayName(user: NamedUser): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return full || user.login || String(user.id);
}

function submittedLogin(raw: unknown): string {
  const login = (raw as { login?: unknown } | null)?.login;
  return typeof login === "string" ? login : "";
}

/**
 * Credential check. Rejections are indistinguishable from the outside: same generic
 * error, and (via `equalizeTiming`) the same bcrypt cost whether the login exists,
 * the account is locked, or the password is wrong.
 */
async function authorizeCredentials(
  raw: unknown,
  headers: Record<string, unknown> | undefined,
): Promise<AuthUser | null> {
  const ip = clientIp(headers);
  const credentials = parseCredentials(raw);
  const { eventId, isIpLimited } = await beginAttempt(
    credentials?.login ?? submittedLogin(raw),
    ip,
  );
  if (!credentials) {
    await finishAttempt(eventId, "invalid_input");
    return null;
  }
  const { login, password } = credentials;

  if (isIpLimited) {
    await equalizeTiming(password);
    await finishAttempt(eventId, "ip_limited");
    return null;
  }

  const user = await prisma.user.findUnique({ where: { login } });
  // Placeholder rows imported from the legacy directory carry no password and
  // cannot sign in until an administrator activates the account.
  if (!user || !user.active || user.isPlaceholder || !user.passwordHash) {
    await equalizeTiming(password);
    await finishAttempt(eventId, "bad_credentials", user?.id ?? null);
    return null;
  }

  // The attempt is counted before the password is checked; while locked nothing is
  // reserved and the real hash is never consulted, so guessing stays impossible.
  if (!(await reserveAttempt(user.id))) {
    await equalizeTiming(password);
    await finishAttempt(eventId, "locked", user.id);
    return null;
  }

  if (!(await bcrypt.compare(password, user.passwordHash))) {
    await finishAttempt(eventId, "bad_credentials", user.id);
    return null;
  }

  await registerSuccess(user.id);
  await finishAttempt(eventId, "ok", user.id);

  return {
    id: String(user.id),
    name: displayName(user),
    email: user.email ?? undefined,
    login: user.login ?? undefined,
    role: user.isAdmin ? "admin" : "user",
    sessionVersion: user.sessionVersion,
  };
}

function isRevocation(metadata: unknown): boolean {
  if (metadata instanceof Error) return metadata.message === SESSION_REVOKED;
  const nested = (metadata as { error?: unknown } | null)?.error;
  return nested instanceof Error && nested.message === SESSION_REVOKED;
}

// Natywny login (login + hasło) — BEZ SSO/Entra ID. Zgodnie z legacy.
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: IDLE_TIMEOUT_S },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Login i hasło",
      credentials: {
        login: { label: "Login", type: "text" },
        password: { label: "Hasło", type: "password" },
      },
      authorize: (credentials, req) =>
        authorizeCredentials(credentials, req?.headers as Record<string, unknown> | undefined),
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // The numeric legacy id is what every write is attributed to (modifiedById,
        // ContractHistory.userId, the contract ACL), so it has to survive in the token.
        token.uid = Number(user.id);
        token.role = user.role;
        token.login = user.login;
        token.sv = user.sessionVersion;
        token.authTime = Date.now();
        return token;
      }

      if (typeof token.authTime !== "number" || Date.now() - token.authTime > ABSOLUTE_TIMEOUT_MS) {
        throw new Error(SESSION_REVOKED);
      }

      // Re-validated on every server-side session read: a password change, a
      // deactivation or a demotion takes effect on the next request, not at expiry.
      const current = token.uid
        ? await prisma.user.findUnique({
            where: { id: token.uid },
            select: {
              id: true, login: true, firstName: true, lastName: true,
              active: true, isAdmin: true, sessionVersion: true,
            },
          })
        : null;
      if (!current || !current.active || current.sessionVersion !== token.sv) {
        throw new Error(SESSION_REVOKED);
      }

      token.role = current.isAdmin ? "admin" : "user";
      token.login = current.login ?? undefined;
      token.name = displayName(current);
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as number;
        session.user.role = token.role;
        session.user.login = token.login;
        session.user.name = token.name;
      }
      return session;
    },
  },
  logger: {
    error(code, metadata) {
      // A revoked session is the expected outcome of a password change, not a fault.
      if (isRevocation(metadata)) return;
      console.error(`[next-auth] ${code}`, metadata);
    },
  },
};

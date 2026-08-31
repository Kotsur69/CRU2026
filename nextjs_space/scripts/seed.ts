/**
 * Bootstrap seed for CRU2026 — creates the single local administrator account.
 *
 * Real data comes from `scripts/legacy/import.ts` (the AMDS CRU dump), so this script
 * no longer seeds dictionaries or demo contracts. It exists because the legacy `users`
 * table is a VIEW over the corporate directory `am_admin`, which was NOT part of the
 * dump: every imported user is an inactive placeholder with no password hash and
 * therefore nobody can sign in. Until that directory is exported, this account is the
 * only way into the application.
 *
 * Run: yarn db:seed
 * Requires SEED_ADMIN_LOGIN and SEED_ADMIN_PASSWORD in the environment — no default
 * credential is shipped, and the password is never written to the log.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 12;

/**
 * `User.id` mirrors the legacy directory id and is not generated, so a locally created
 * account must take an id high enough that no future `am_admin` row can collide with it.
 */
const LOCAL_ID_BASE = 1_000_000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Set it in .env — this script ships no default credential.`);
  }
  return value;
}

function optionalEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : null;
}

async function nextLocalUserId(): Promise<number> {
  const highest = await prisma.user.findFirst({ orderBy: { id: "desc" }, select: { id: true } });
  return Math.max(LOCAL_ID_BASE, (highest?.id ?? 0) + 1);
}

async function main() {
  const login = requireEnv("SEED_ADMIN_LOGIN");
  const password = requireEnv("SEED_ADMIN_PASSWORD");
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`SEED_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const email = optionalEnv("SEED_ADMIN_EMAIL");
  const firstName = optionalEnv("SEED_ADMIN_FIRST_NAME");
  const lastName = optionalEnv("SEED_ADMIN_LAST_NAME") ?? "Administrator";
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const existing = await prisma.user.findUnique({ where: { login }, select: { id: true } });
  const id = existing?.id ?? (await nextLocalUserId());

  // Idempotent: re-running rotates the password of the same account rather than
  // creating a second administrator.
  const user = await prisma.user.upsert({
    where: { login },
    update: {
      passwordHash,
      email,
      firstName,
      lastName,
      active: true,
      isAdmin: true,
      isPlaceholder: false,
    },
    create: {
      id,
      login,
      passwordHash,
      email,
      firstName,
      lastName,
      active: true,
      isAdmin: true,
      isPlaceholder: false,
    },
  });

  const action = existing ? "updated" : "created";
  console.log(`Administrator ${action}: login=${user.login} id=${user.id}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

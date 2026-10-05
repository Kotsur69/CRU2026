/**
 * Local account management for the test phase (there is no admin UI for it yet).
 *
 *   yarn users:create-test             creates test1…test5 (skips ones that exist)
 *   yarn users:reset-password <login>  new random password + signs the user out everywhere
 *
 * Passwords are generated here, printed ONCE to this terminal and stored only as a
 * bcrypt hash — copy them to the testers over a private channel, never into git.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generatePassword } from "../lib/password-policy";

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;
const TEST_ACCOUNT_COUNT = 5;
/** Same rule as scripts/seed.ts: local ids live above the legacy directory range. */
const LOCAL_ID_BASE = 1_000_000;

interface Issued {
  login: string;
  password: string;
}

async function nextLocalUserId(): Promise<number> {
  const highest = await prisma.user.findFirst({ orderBy: { id: "desc" }, select: { id: true } });
  return Math.max(LOCAL_ID_BASE, highest?.id ?? 0) + 1;
}

async function createTestAccounts(): Promise<Issued[]> {
  const issued: Issued[] = [];
  for (let n = 1; n <= TEST_ACCOUNT_COUNT; n++) {
    const login = `test${n}`;
    const existing = await prisma.user.findUnique({ where: { login }, select: { id: true } });
    if (existing) {
      console.log(`skip    ${login} — already exists (id=${existing.id}); use users:reset-password`);
      continue;
    }
    const password = generatePassword();
    const user = await prisma.user.create({
      data: {
        id: await nextLocalUserId(),
        login,
        firstName: "Test",
        lastName: `Test${n}`,
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
        passwordChangedAt: new Date(),
        active: true,
        isAdmin: false,
        isPlaceholder: false,
      },
      select: { id: true },
    });
    console.log(`created ${login} (id=${user.id})`);
    issued.push({ login, password });
  }
  return issued;
}

async function resetPassword(login: string): Promise<Issued[]> {
  const user = await prisma.user.findUnique({ where: { login }, select: { id: true } });
  if (!user) throw new Error(`No account with login "${login}".`);
  const password = generatePassword();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      passwordChangedAt: new Date(),
      sessionVersion: { increment: 1 },
      failedLoginCount: 0,
      lockedUntil: null,
      active: true,
      isPlaceholder: false,
    },
  });
  console.log(`reset   ${login} — every open session of this account is now invalid`);
  return [{ login, password }];
}

async function main() {
  const [command, arg] = process.argv.slice(2);
  let issued: Issued[];
  if (command === "create-test") {
    issued = await createTestAccounts();
  } else if (command === "reset-password" && arg) {
    issued = await resetPassword(arg);
  } else {
    throw new Error("Usage: accounts.ts create-test | reset-password <login>");
  }

  if (issued.length > 0) {
    console.log("\nCredentials (shown once — store them in a password manager):");
    console.table(issued);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

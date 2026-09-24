import type { Prisma, PrismaClient } from "@prisma/client";
import { PLACEHOLDER_LOGIN_PREFIX, type ContactNames, type LoginEntry } from "./match";

type Reader = PrismaClient | Prisma.TransactionClient;

/**
 * What the matching tool reads — one definition for the script and the contact page, so
 * both show the same proposal. Only real logins count (a `legacy-<id>` placeholder has no
 * name in it), and an account or a contact that already has an approved match is taken.
 * Reads only; sequential, because the script runs it inside a read-only transaction.
 */
export async function loadMatchInputs(
  db: Reader,
): Promise<{ logins: LoginEntry[]; contacts: ContactNames[] }> {
  const users = await db.user.findMany({
    where: {
      login: { not: null },
      NOT: { login: { startsWith: PLACEHOLDER_LOGIN_PREFIX } },
      mailingContact: { is: null },
    },
    select: { id: true, login: true },
    orderBy: { id: "asc" },
  });
  const contacts = await db.mailingContact.findMany({
    where: { userId: null },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: { id: "asc" },
  });
  return {
    logins: users.flatMap((u) => (u.login ? [{ login: u.login, userId: u.id }] : [])),
    contacts,
  };
}

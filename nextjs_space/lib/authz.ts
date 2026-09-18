import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Who is acting, and what they may do to a contract.
 *
 * The rule comes from the imported data, not from a guess: `contract_users` is the
 * assignment list ("Właściciel umowy") and `onlyRead` grades editing rights inside it
 * (see lib/contract-access.ts). So an editor is an assignee with `readOnly = false`;
 * administrators bypass the list entirely, which is how the legacy admin panel behaves.
 *
 * Route middleware only proves that *someone* is signed in. Authorisation belongs next
 * to the write itself, so every server action calls these helpers again.
 */

export interface Actor {
  id: number;
  login: string | null;
  isAdmin: boolean;
}

/** The signed-in actor, or null when there is no valid session. */
export async function currentActor(): Promise<Actor | null> {
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;
  if (!id || !Number.isSafeInteger(id)) return null;
  return {
    id,
    login: session?.user?.login ?? null,
    isAdmin: session?.user?.role === "admin",
  };
}

/** The signed-in actor; throws when absent, for use at the top of a server action. */
export async function requireActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) throw new Error("Brak sesji — zaloguj się ponownie.");
  return actor;
}

export async function canEditContract(actor: Actor, contractId: number): Promise<boolean> {
  if (actor.isAdmin) return true;
  const grant = await prisma.contractUser.findUnique({
    where: { contractId_userId: { contractId, userId: actor.id } },
    select: { readOnly: true },
  });
  return grant !== null && !grant.readOnly;
}

/** Deleting is the same right as editing — legacy has no separate delete grant. */
export async function canDeleteContract(actor: Actor, contractId: number): Promise<boolean> {
  return canEditContract(actor, contractId);
}

/**
 * Asking a question is not editing: anyone who can open the record may ask about it,
 * which is why the button sits in the read-only preview in legacy too.
 */
export function canAskQuestion(actor: Actor | null): boolean {
  return actor !== null;
}

export async function assertCanEditContract(actor: Actor, contractId: number): Promise<void> {
  if (!(await canEditContract(actor, contractId))) {
    throw new Error("Brak uprawnień do edycji tego rekordu.");
  }
}

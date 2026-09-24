import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
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

/**
 * The administration screens — Dostępy, Grupy, Lokalizacje — and their actions are for
 * administrators only (docs/features/03). Anyone else gets a 404 rather than "access
 * denied": the map of who sees what is not disclosed, not even that the screen exists.
 */
export async function requireAdmin(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor?.isAdmin) notFound();
  return actor;
}

/**
 * Whether the actor may see a record — and everything hanging off it: its files, its
 * history, its notes. Today every signed-in user may read every live record; the real
 * visibility rules are docs/features/03, blocked on Q18. This is the one place they will
 * slot into, so every reader already calls it. Soft-deleted records are for
 * administrators only.
 */
export async function canReadContract(actor: Actor, contractId: number): Promise<boolean> {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { isDeleted: true },
  });
  if (!contract) return false;
  return !contract.isDeleted || actor.isAdmin;
}

/**
 * Legacy `edittable = 0` freezes a record — 6 829 of 20 624 in the dump. A frozen record
 * is read-only for everyone except an administrator (docs/features/03, 09).
 */
export async function canEditContract(actor: Actor, contractId: number): Promise<boolean> {
  if (actor.isAdmin) return true;
  const grant = await prisma.contractUser.findUnique({
    where: { contractId_userId: { contractId, userId: actor.id } },
    select: { readOnly: true, contract: { select: { isEditable: true } } },
  });
  return grant !== null && !grant.readOnly && grant.contract.isEditable;
}

export type RowPermission = "edit" | "read" | "frozen";

/**
 * The same rule as `canEditContract`, over a row already loaded with its assignment list —
 * for the register's "Uprawnienia" column, where one query per row is not an option.
 */
export function rowPermission(
  actor: Actor | null,
  row: { isEditable: boolean; userAccess: readonly { userId: number; readOnly: boolean }[] },
): RowPermission {
  if (actor?.isAdmin) return "edit";
  const grant = actor ? row.userAccess.find((a) => a.userId === actor.id) : undefined;
  if (!grant || grant.readOnly) return "read";
  return row.isEditable ? "edit" : "frozen";
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

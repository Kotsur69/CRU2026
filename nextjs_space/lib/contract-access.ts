import { prisma } from "@/lib/prisma";
import { userOptionLabel } from "@/lib/format";

/**
 * Legacy `contract_users` is the assignment list behind "Właściciel umowy". The audit
 * (section 1.4) records several owners per contract and an owner dictionary with
 * hundreds of entries; the imported data agrees — 370 distinct people, 1–8 per contract,
 * and group "Właściciele umów" holds 343 of them.
 *
 * `onlyRead` does NOT separate owners from non-owners. It only says whether an assignee
 * may edit the record. Narrowing the list to `readOnly: false` collapses it to 8 accounts,
 * one of which is a blanket grant covering 17 035 of 20 624 contracts — so both the owner
 * column and the owner filter must read the whole assignment list.
 */
export const ASSIGNEE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  login: true,
} as const;

export interface DictOption {
  id: string;
  name: string;
}

/**
 * Options for the "Właściciel umowy" filter — only people actually assigned somewhere.
 * Inactive accounts carry legacy's `[na]` suffix (`userOptionLabel`).
 */
export async function loadOwnerOptions(): Promise<DictOption[]> {
  const users = await prisma.user.findMany({
    where: { contractAccess: { some: {} } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { login: "asc" }],
    select: { ...ASSIGNEE_SELECT, active: true, isPlaceholder: true },
  });
  return users.map((u) => ({ id: String(u.id), name: userOptionLabel(u) }));
}

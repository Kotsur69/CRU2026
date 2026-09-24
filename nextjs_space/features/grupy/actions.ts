"use server";

import { revalidatePath } from "next/cache";
import type { GroupMembershipAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, type Actor } from "@/lib/authz";
import { flattenIssues } from "@/lib/contracts/form-schema";
import {
  formId,
  formText,
  readGroupForm,
  readMembershipForm,
  type FormErrors,
} from "@/lib/groups";

/**
 * Grupy — zapisy (docs/features/21).
 *
 * Każda akcja sama woła `requireAdmin` (sesja + prawo administratora): akcja serwerowa
 * jest publicznym wejściem jak endpoint HTTP, a to, że strona odpowiada 404, niczego tu
 * nie zabezpiecza.
 *
 * Tylko członkostwa i cztery pola grupy. Zakładania i usuwania grup nie ma (Q62):
 * piętnaście grup w czternaście lat, każda wpięta w rodzaj opinii albo regułę dostępu,
 * a usunięta grupa osierociłaby rodzaj opinii.
 */

export interface GroupActionState {
  /** Błędy pól i całego formularza (`_form`). */
  errors: FormErrors;
  /** Chwila udanego zapisu — formularz po niej czyści się albo zamyka. */
  savedAt?: number;
}

const BAD_REQUEST: GroupActionState = { errors: { _form: "Nieprawidłowe żądanie." } };

/**
 * Nieaktywna grupa ma zamrożony skład. Grupa 7 „ograniczony dostęp rodzaj umowy" jest
 * wyłączona, a dziewięć osób wciąż w niej siedzi — ich członkostwo to jedyny zapis, kto
 * kiedyś miał to ograniczenie. Kto chce zmienić skład, najpierw grupę aktywuje.
 */
const FROZEN =
  "Grupa jest nieaktywna — jej skład jest zamrożony. Aby go zmienić, najpierw aktywuj grupę.";

function refresh(groupId: number, userId?: number) {
  revalidatePath("/grupy");
  revalidatePath(`/grupy/${groupId}`);
  // Karta osoby w Dostępach wymienia jej grupy.
  if (userId !== undefined) revalidatePath(`/dostepy/${userId}`);
}

type Outcome = "ok" | "no-group" | "frozen" | "no-user" | "unchanged";

/**
 * Członkostwo i wpis w historii powstają albo znikają w jednej transakcji. Wpis niesie
 * datę, autora i rodzaj zmiany — dokładnie to, czego 391 wierszy z legacy nie ma.
 * Wstawienie i usunięcie są warunkowe (`ON CONFLICT DO NOTHING`, `DELETE … WHERE`), więc
 * dwa równoległe kliknięcia nie zapiszą tej samej zmiany dwa razy.
 */
async function changeMembership(
  actor: Actor,
  groupId: number,
  userId: number,
  action: GroupMembershipAction,
): Promise<Outcome> {
  return prisma.$transaction(async (tx) => {
    // Wiersz grupy zostaje zablokowany do końca transakcji: równoległe „Edytuj"
    // wyłączające grupę czeka, więc zmiana składu nie prześlizgnie się obok zamrożenia.
    const [group] = await tx.$queryRaw<{ active: boolean }[]>`
      SELECT "active" FROM "Group" WHERE "id" = ${groupId} FOR UPDATE`;
    if (!group) return "no-group";
    if (!group.active) return "frozen";

    let count: number;
    if (action === "ADDED") {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) return "no-user";
      ({ count } = await tx.userGroup.createMany({
        data: [{ userId, groupId }],
        skipDuplicates: true,
      }));
    } else {
      ({ count } = await tx.userGroup.deleteMany({ where: { userId, groupId } }));
    }
    if (count === 0) return "unchanged";

    await tx.userGroupHistory.create({
      data: { userId, groupId, action, changedAt: new Date(), changedById: actor.id },
    });
    return "ok";
  });
}

/** „Dodaj członka". */
export async function addMember(
  _state: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const actor = await requireAdmin();

  const { groupId, userId } = readMembershipForm(formData);
  if (groupId === undefined) return BAD_REQUEST;
  if (userId === undefined) return { errors: { userId: "Wybierz osobę." } };

  const outcome = await changeMembership(actor, groupId, userId, "ADDED");
  refresh(groupId, userId);

  switch (outcome) {
    case "ok":
      return { errors: {}, savedAt: Date.now() };
    case "unchanged":
      return { errors: { userId: "Ta osoba już należy do grupy." } };
    case "no-user":
      return { errors: { userId: "Wskazana osoba nie istnieje." } };
    case "frozen":
      return { errors: { _form: FROZEN } };
    case "no-group":
      return { errors: { _form: "Grupa nie istnieje." } };
  }
}

/**
 * „Usuń członka". Usuwa samo członkostwo — historia zostaje nietknięta i dostaje nowy
 * wpis, więc usunięcie nie kasuje śladu, że ktoś w grupie był.
 */
export async function removeMember(
  _state: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const actor = await requireAdmin();

  const { groupId, userId } = readMembershipForm(formData);
  if (groupId === undefined || userId === undefined) return BAD_REQUEST;

  const outcome = await changeMembership(actor, groupId, userId, "REMOVED");
  refresh(groupId, userId);

  if (outcome === "ok") return { errors: {}, savedAt: Date.now() };
  if (outcome === "frozen") return { errors: { _form: FROZEN } };
  if (outcome === "unchanged") return { errors: { _form: "Ta osoba nie należy już do grupy." } };
  return { errors: { _form: "Grupa nie istnieje." } };
}

/**
 * „Edytuj" — nazwa, aktywność, właściciel, buissnesline. Legacy nie prowadzi historii
 * zmian grupy i tu też jej nie ma: jedyna tabela historii dotyczy członkostw.
 */
export async function updateGroup(
  _state: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  await requireAdmin();

  const groupId = formId(formText(formData.get("groupId")));
  if (groupId === undefined) return BAD_REQUEST;

  const parsed = readGroupForm(formData);
  if (!parsed.success) return { errors: flattenIssues(parsed.error) };
  const values = parsed.data;

  const [group, owner, businessline] = await Promise.all([
    prisma.group.findUnique({ where: { id: groupId }, select: { businesslineId: true } }),
    values.ownerId === null
      ? null
      : prisma.user.findUnique({ where: { id: values.ownerId }, select: { id: true } }),
    values.businesslineId === null
      ? null
      : prisma.businessline.findUnique({
          where: { id: values.businesslineId },
          select: { active: true },
        }),
  ]);
  if (!group) return { errors: { _form: "Grupa nie istnieje." } };
  if (values.ownerId !== null && !owner) {
    return { errors: { ownerId: "Wskazana osoba nie istnieje." } };
  }
  if (values.businesslineId !== null) {
    if (!businessline) {
      return { errors: { businesslineId: "Wskazany buissnesline nie istnieje." } };
    }
    // Wygaszony buissnesline można zostawić, ale nie wybrać na nowo — tak jak w formularzu.
    if (!businessline.active && values.businesslineId !== group.businesslineId) {
      return { errors: { businesslineId: "Ten buissnesline jest wygaszony." } };
    }
  }

  await prisma.group.update({ where: { id: groupId }, data: values });
  refresh(groupId);
  return { errors: {}, savedAt: Date.now() };
}

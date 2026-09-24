import { z } from "zod";
import type { GroupMembershipAction } from "@prisma/client";
import { intParam } from "@/lib/utils";

/**
 * Grupy (docs/features/21) — część bez bazy danych: walidacja formularzy, podział
 * historii członkostwa i kolejność list osób. Zapisy są w features/grupy/actions.ts.
 */

/** Legacy `group.name` to `varchar(50)`. */
export const GROUP_NAME_MAX = 50;

/** Błędy formularza: pole → komunikat, `_form` dla całego formularza. */
export type FormErrors = Partial<Record<string, string>>;

/** Wartość pola formularza jako tekst; plik albo brak pola to `undefined`. */
export function formText(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Identyfikator z formularza — wyłącznie kanoniczna dodatnia liczba całkowita.
 * `intParam` przepuszcza „12abc" jako 12, co w adresie jest wygodą, ale w zapisie
 * oznaczałoby zmianę członkostwa kogoś, kogo nikt nie wskazał.
 */
export function formId(value: string | undefined): number | undefined {
  const text = value?.trim() ?? "";
  const id = intParam(text);
  return id !== undefined && String(id) === text ? id : undefined;
}

/**
 * Select bez wyboru przysyła "" — to brak wskazania. Cokolwiek innego musi być
 * dodatnią liczbą całkowitą: po cichu wyczyszczony właściciel byłby gorszy niż błąd.
 */
const optionalId = z
  .string()
  .optional()
  .transform((raw, ctx) => {
    if ((raw?.trim() ?? "") === "") return null;
    const id = formId(raw);
    if (id === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Nieprawidłowa wartość." });
      return z.NEVER;
    }
    return id;
  });

/** „Edytuj" — nazwa, aktywność, właściciel i buissnesline; nic więcej grupa nie ma. */
export const groupFormSchema = z.object({
  name: z
    .string({ required_error: "Podaj nazwę grupy." })
    .trim()
    .min(1, "Podaj nazwę grupy.")
    .max(GROUP_NAME_MAX, `Nazwa może mieć najwyżej ${GROUP_NAME_MAX} znaków.`),
  // Checkbox: zaznaczony przysyła "1", odznaczony nie przysyła nic.
  active: z
    .string()
    .optional()
    .transform((v) => v === "1"),
  ownerId: optionalId,
  businesslineId: optionalId,
});

export type GroupFormValues = z.infer<typeof groupFormSchema>;

export function readGroupForm(formData: FormData) {
  return groupFormSchema.safeParse({
    name: formText(formData.get("name")),
    active: formText(formData.get("active")),
    ownerId: formText(formData.get("ownerId")),
    businesslineId: formText(formData.get("businesslineId")),
  });
}

/** Grupa i osoba z formularza członkostwa; `undefined`, gdy czegoś brakuje. */
export function readMembershipForm(formData: FormData): {
  groupId: number | undefined;
  userId: number | undefined;
} {
  return {
    groupId: formId(formText(formData.get("groupId"))),
    userId: formId(formText(formData.get("userId"))),
  };
}

export const MEMBERSHIP_ACTION_LABEL: Record<GroupMembershipAction, string> = {
  ADDED: "dodano do grupy",
  REMOVED: "usunięto z grupy",
};

/**
 * Listy osób po polsku („Ł" przed „M", czego kolacja bazy nie umie) i numerycznie, żeby
 * `legacy-495` stało przed `legacy-50272`.
 */
const polish = new Intl.Collator("pl", { numeric: true });

export function sortByLabel<T>(rows: readonly T[], label: (row: T) => string): T[] {
  return [...rows].sort((a, b) => polish.compare(label(a), label(b)));
}

export interface HistoryEntry {
  id: number;
  action: GroupMembershipAction | null;
  changedAt: Date | null;
}

/**
 * `UserGroupHistory` niesie dwa różne rodzaje wierszy. Nasze mają rodzaj zmiany, datę
 * i autora — idą od najnowszego. Legacy nie ma żadnego z nich, więc nie ma też
 * kolejności w czasie: dostaje alfabet, bo porządek po id udawałby chronologię, której
 * nikt nie zapisał.
 */
export function splitGroupHistory<T extends HistoryEntry>(
  rows: readonly T[],
  label: (row: T) => string,
): { changes: T[]; legacy: T[] } {
  const changes = rows
    .filter((r) => r.action !== null)
    .sort(
      (a, b) =>
        (b.changedAt?.getTime() ?? 0) - (a.changedAt?.getTime() ?? 0) || b.id - a.id,
    );
  const legacy = sortByLabel(
    rows.filter((r) => r.action === null),
    label,
  );
  return { changes, legacy };
}

/**
 * Byli członkowie według naszych wpisów: ostatnia zmiana danej osoby to usunięcie i nie
 * wróciła do grupy. Wiersz niesie datę i autora tego usunięcia. `changes` w kolejności
 * od najnowszej, jak zwraca `splitGroupHistory`.
 */
export function formerMembers<T extends HistoryEntry & { userId: number }>(
  changes: readonly T[],
  currentMemberIds: ReadonlySet<number>,
): T[] {
  const latest = new Map<number, T>();
  for (const change of changes) {
    if (!latest.has(change.userId)) latest.set(change.userId, change);
  }
  return [...latest.values()].filter(
    (c) => c.action === "REMOVED" && !currentMemberIds.has(c.userId),
  );
}

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { contractorLabel } from "@/lib/format";
import { REGISTER_MODULES } from "@/lib/contracts/modules";
import {
  nipDigits,
  nipFormatError,
  normaliseVatId,
  type ContractorFormErrors,
  type ContractorFormValues,
  type ContractorOption,
} from "@/lib/contractors";

/**
 * Zapytania słownika kontrahentów, które widzą NIP tak jak człowiek — jako same cyfry.
 * Legacy zapisywał numer i z kreskami, i bez („526-025-09-95" obok „5260250995"), więc
 * porównanie surowej kolumny gubi część dopasowań i część duplikatów (docs/features/20).
 * Stąd `regexp_replace` w SQL zamiast `contains` Prismy.
 */

const NIP_SQL = Prisma.sql`regexp_replace(coalesce(k."vatId", ''), '[^0-9]', '', 'g')`;

type Db = Prisma.TransactionClient;

/** Rekord widoczny w rejestrach: nieusunięty i z jednego z trzech modułów (bez LEGACY_2021). */
export const LIVE_RECORD: Prisma.ContractWhereInput = {
  isDeleted: false,
  module: { in: [...REGISTER_MODULES] },
};

export interface DuplicateGroup {
  /** NIP jako same cyfry. */
  nip: string;
  /** Wiersze z tym numerem, rosnąco — także usunięte, bo i na nich wiszą umowy. */
  ids: number[];
}

/**
 * NIP-y zapisane na więcej niż jednym wierszu (177 w dumpie, licząc surową kolumnę).
 * Grupujemy po cyfrach, więc zapis „z kreskami" i „bez" trafia do jednej grupy — to jeden
 * numer. Niczego nie scalamy: to raport dla działu prawnego (Q58).
 */
export async function duplicateGroups(): Promise<DuplicateGroup[]> {
  const rows = await prisma.$queryRaw<{ id: number; nip: string }[]>`
    SELECT q."id", q."nip"
    FROM (
      SELECT k."id", ${NIP_SQL} AS nip, count(*) OVER (PARTITION BY ${NIP_SQL}) AS copies
      FROM "Contractor" AS k
    ) AS q
    WHERE q."nip" <> '' AND q."copies" > 1
    ORDER BY q."nip", q."id"`;

  const groups: DuplicateGroup[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last?.nip === row.nip) last.ids.push(row.id);
    else groups.push({ nip: row.nip, ids: [row.id] });
  }
  return groups;
}

/** Wiersze, których NIP (cyfry) zawiera fragment — filtr listy i podpowiedzi. */
export async function idsWithNipFragment(digits: string, liveOnly = false): Promise<number[]> {
  if (digits === "") return [];
  const rows = await prisma.$queryRaw<{ id: number }[]>`
    SELECT k."id" FROM "Contractor" AS k
    WHERE strpos(${NIP_SQL}, ${digits}) > 0 AND (${!liveOnly} OR NOT k."isDeleted")`;
  return rows.map((r) => r.id);
}

/** Wiersze o dokładnie tym NIP-ie (cyfry), rosnąco po id. */
export async function idsWithNip(digits: string, liveOnly = false): Promise<number[]> {
  if (digits === "") return [];
  const rows = await prisma.$queryRaw<{ id: number }[]>`
    SELECT k."id" FROM "Contractor" AS k
    WHERE ${NIP_SQL} = ${digits} AND (${!liveOnly} OR NOT k."isDeleted")
    ORDER BY k."id"`;
  return rows.map((r) => r.id);
}

export interface NipCollision extends ContractorOption {
  /** Numer, o który się zderzyliśmy — potwierdzenie „zapisz mimo to" odsyła właśnie jego. */
  nip: string;
}

/**
 * Żywy kontrahent z tym samym NIP-em (poza `exceptId`). Usunięty wpis kolizją nie jest —
 * nie ma go w podpowiedziach, więc nie ma czego zaproponować. Przy kilku kopiach wygrywa
 * ta z największą liczbą rekordów: to ją ktoś najpewniej chciał wybrać.
 */
async function findNipCollision(
  db: Db,
  nip: string,
  exceptId: number | null,
): Promise<NipCollision | null> {
  const digits = nipDigits(nip);
  const [row] = await db.$queryRaw<
    { id: number; shortName: string | null; fullName: string | null; vatId: string | null }[]
  >`
    SELECT k."id", k."shortName", k."fullName", k."vatId"
    FROM "Contractor" AS k
    WHERE NOT k."isDeleted" AND ${NIP_SQL} = ${digits} AND k."id" <> ${exceptId ?? 0}::int
    ORDER BY (SELECT count(*) FROM "Contract" AS c
              WHERE c."contractorId" = k."id" AND NOT c."isDeleted") DESC,
             k."id"
    LIMIT 1`;
  return row ? { id: row.id, name: contractorLabel(row), vatId: row.vatId, nip } : null;
}

/**
 * Serializuje zapisy jednego NIP-u do końca transakcji. Bez tego dwa równoczesne „dodaj"
 * przeszłyby sprawdzenie kolizji i założyły duplikat; unikalnego indeksu mieć nie możemy,
 * bo 177 NIP-ów już się powtarza.
 */
async function lockNip(tx: Db, nip: string): Promise<void> {
  const key = `contractor-nip:${nipDigits(nip)}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

export type CreateContractorResult =
  | { ok: true; contractor: ContractorOption }
  | { ok: false; conflict: NipCollision };

/**
 * Dopisanie firmy do słownika. NIP już obecny na żywym wpisie odmawia zapisu i oddaje
 * ten wpis — decyzję podejmuje człowiek, nigdy podmiana po cichu (docs/features/20).
 * Format NIP-u sprawdza wołający.
 */
export async function createContractorRecord(
  values: ContractorFormValues,
  actorId: number,
): Promise<CreateContractorResult> {
  return prisma.$transaction(async (tx): Promise<CreateContractorResult> => {
    if (values.vatId) {
      await lockNip(tx, values.vatId);
      const conflict = await findNipCollision(tx, values.vatId, null);
      if (conflict) return { ok: false, conflict };
    }
    const row = await tx.contractor.create({
      data: { ...values, registeredAt: new Date(), registeredById: actorId },
      select: { id: true, shortName: true, fullName: true, vatId: true },
    });
    return { ok: true, contractor: { id: row.id, name: contractorLabel(row), vatId: row.vatId } };
  });
}

export type UpdateContractorResult =
  | { ok: true }
  | { ok: false; errors: ContractorFormErrors }
  | { ok: false; conflict: NipCollision };

/**
 * Edycja wpisu (tylko administrator — sprawdza wołający).
 *
 * NIP sprawdzamy wtedy, gdy się zmienia. Niezmieniony zapis legacy, który nie jest
 * 10-cyfrowym NIP-em (np. numer zagraniczny), zostaje, jak był — inaczej poprawka adresu
 * wymagałaby skasowania numeru. Nowy numer zajęty przez inny żywy wpis wymaga
 * potwierdzenia: administrator poprawiający literówkę może świadomie ujawnić duplikat.
 */
export async function updateContractorRecord(
  id: number,
  values: ContractorFormValues,
  actorId: number,
  confirmedNip: string | null,
): Promise<UpdateContractorResult> {
  return prisma.$transaction(async (tx): Promise<UpdateContractorResult> => {
    const current = await tx.contractor.findUnique({ where: { id }, select: { vatId: true } });
    if (!current) return { ok: false, errors: { _form: "Kontrahent nie istnieje." } };

    let vatId = values.vatId;
    if (values.vatId === normaliseVatId(current.vatId)) {
      if (nipFormatError(values.vatId)) vatId = current.vatId;
    } else if (values.vatId) {
      const formatError = nipFormatError(values.vatId);
      if (formatError) return { ok: false, errors: { vatId: formatError } };
      await lockNip(tx, values.vatId);
      const conflict = await findNipCollision(tx, values.vatId, id);
      if (conflict && confirmedNip !== conflict.nip) return { ok: false, conflict };
    }

    await tx.contractor.update({
      where: { id },
      data: { ...values, vatId, modifiedAt: new Date(), modifiedById: actorId },
    });
    return { ok: true };
  });
}

/** Miękkie usunięcie albo przywrócenie. False, gdy wpis nie istnieje lub już jest w tym stanie. */
export async function setContractorDeleted(
  id: number,
  deleted: boolean,
  actorId: number,
): Promise<boolean> {
  const { count } = await prisma.contractor.updateMany({
    where: { id, isDeleted: !deleted },
    data: { isDeleted: deleted, modifiedAt: new Date(), modifiedById: actorId },
  });
  return count > 0;
}

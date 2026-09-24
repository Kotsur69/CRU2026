import { prisma } from "@/lib/prisma";
import type { ContractFormValues } from "./form-schema";

/**
 * Wczytanie rekordu do formularza i wypełnianie wstępne aneksów.
 *
 * Pola `@db.Date` wracają z Prismy jako północ UTC, więc do `<input type="date">`
 * idą przez `toISOString()` — `toLocaleDateString` cofnąłby je o dobę w strefie CET.
 */

const DATE_ONLY = 10;

function toDateInput(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, DATE_ONLY) : null;
}

export function fromDateInput(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00Z`) : null;
}

export const CONTRACT_FORM_INCLUDE = {
  userAccess: { select: { userId: true, readOnly: true } },
  opinions: { where: { active: true }, select: { userId: true } },
  contractor: { select: { id: true, shortName: true, fullName: true, vatId: true } },
  debtor: { select: { id: true, shortName: true, fullName: true, vatId: true } },
  status: { select: { id: true, kind: true } },
  // Umowa nadrzędna — formularz pokazuje ją odnośnikiem („Aneks do umowy" w legacy).
  // Jej rejestr wynika z jej własnego modułu: projekt aneksu wisi pod umową, więc
  // odnośnik prowadzi do /umowy, a nie do rejestru, w którym stoi rekord potomny.
  parent: { select: { id: true, identifier: true, module: true } },
} as const;

export type ContractForForm = NonNullable<Awaited<ReturnType<typeof loadContractForForm>>>;

export async function loadContractForForm(id: number) {
  return prisma.contract.findUnique({ where: { id }, include: CONTRACT_FORM_INCLUDE });
}

export function contractToFormValues(c: ContractForForm): ContractFormValues {
  return {
    identifier: c.identifier,
    documentTypeId: c.documentTypeId,
    statusId: c.statusId,
    companyId: c.companyId,
    businesslineId: c.businesslineId,
    primaryLocationId: c.primaryLocationId,
    domainId: c.domainId,
    natureId: c.natureId,
    tradeId: c.tradeId,
    deliveryMethodId: c.deliveryMethodId,
    noticePeriodId: c.noticePeriodId,
    contractReference: c.contractReference,
    description: c.description,

    dateBegin: toDateInput(c.dateBegin),
    dateEnd: toDateInput(c.dateEnd),
    // Brak daty zakończenia JEST zapisem „na czas nieokreślony" — dump nie ma osobnej flagi.
    indefinite: c.dateEnd === null,
    sentOn: toDateInput(c.sentOn),

    salary: c.salary === null ? null : c.salary.toString(),
    currencyId: c.currencyId,
    specificSalaryTerms: c.specificSalaryTerms,
    paymentTerm: c.paymentTerm,

    contractorId: c.contractorId,
    debtorId: c.debtorId,
    companiesConnected: c.companiesConnected,

    tempForm: c.tempForm,
    obsc: c.obsc,
    obscDescription: c.obscDescription,
    insuranceGuarantee: c.insuranceGuarantee,
    bill: c.bill,

    ownerIds: c.userAccess.map((a) => a.userId),
    editorIds: c.userAccess.filter((a) => !a.readOnly).map((a) => a.userId),
    reviewerIds: c.opinions.map((o) => o.userId).filter((id): id is number => id !== null),
    remarks: c.remarks,

    formSession: null,
  };
}

/**
 * Pusty formularz „Dodaj nowy wpis" — rekordu jeszcze nie ma, więc wszystko startuje
 * puste. Wartości domyślne (status rejestru, „(brak danych)" w słownikach, PLN)
 * dokłada strona formularza, bo bierze je z już wczytanych list, zamiast dopytywać
 * bazę o identyfikatory, które i tak ma pod ręką.
 *
 * Identyfikatora tu nie ma celowo: formularz nowego wpisu w legacy go nie pokazuje,
 * bo numer zależy od spółki i businessline'u wybranych dopiero w tym formularzu.
 * Nadaje go serwer przy zapisie (patrz `nextRecordIdentifier`).
 */
export function emptyFormValues(defaults: Partial<ContractFormValues> = {}): ContractFormValues {
  return {
    identifier: null,
    documentTypeId: null,
    statusId: null,
    companyId: null,
    businesslineId: null,
    primaryLocationId: null,
    domainId: null,
    natureId: null,
    tradeId: null,
    deliveryMethodId: null,
    noticePeriodId: null,
    contractReference: null,
    description: null,

    dateBegin: null,
    dateEnd: null,
    indefinite: false,
    sentOn: null,

    salary: null,
    currencyId: null,
    specificSalaryTerms: null,
    paymentTerm: null,

    contractorId: null,
    debtorId: null,
    companiesConnected: false,

    tempForm: null,
    obsc: false,
    obscDescription: null,
    insuranceGuarantee: false,
    bill: false,

    ownerIds: [],
    editorIds: [],
    reviewerIds: [],
    remarks: null,

    formSession: null,
    ...defaults,
  };
}

/**
 * Wypełnienie wstępne aneksu danymi umowy nadrzędnej (docs/features/11).
 *
 * Z rodzica przechodzi to, co aneks z nim dzieli: spółka, businessline, lokalizacja,
 * kontrahent i dłużnik, rodzaj i charakter umowy, właściciele z prawem edycji — oraz
 * forma doręczenia, numer umowy kontrahenta i waluta. Typ dokumentu to „Aneks", ale
 * wolno go zmienić (127 aneksów to „Porozumienie").
 *
 * Puste zostaje to, co aneks zmienia: daty, kwota i przedmiot (Q51). W dumpie 3 149
 * z 3 278 aneksów ma kontrahenta rodzica, ale tylko 433 jego datę zawarcia —
 * wypełniona wartość zostałaby odpowiedzią, gdy nikt jej nie poprawi. Status też
 * startuje pusty: nowy aneks nie obowiązuje z automatu.
 */
export function annexDefaultsFrom(
  parent: ContractForForm,
  options: { identifier: string | null; documentTypeId: number | null; statusId: number | null },
): ContractFormValues {
  const base = contractToFormValues(parent);
  return {
    ...base,
    identifier: options.identifier,
    documentTypeId: options.documentTypeId ?? base.documentTypeId,
    statusId: options.statusId,
    description: null,
    dateBegin: null,
    dateEnd: null,
    indefinite: false,
    sentOn: null,
    salary: null,
    specificSalaryTerms: null,
    paymentTerm: null,
    // Opiniowanie aneksu zaczyna się od zera — opinie rodzica dotyczą innego dokumentu.
    reviewerIds: [],
    remarks: null,
    formSession: null,
  };
}

/** Rekord jest aneksem: umowa, której rodzicem jest umowa (docs/features/07, 11). */
export function isAnnex(record: {
  module: string;
  parent: { module: string } | null;
}): boolean {
  return record.module === "CONTRACT" && record.parent?.module === "CONTRACT";
}

/** Etykiety kontrahenta i dłużnika do wpisów historii (patrz `withCounterparties`). */
export async function counterpartyLabels(
  contractorId: number | null,
  debtorId: number | null,
): Promise<{ contractor: string | null; debtor: string | null }> {
  const ids = [contractorId, debtorId].filter((id): id is number => id !== null);
  if (ids.length === 0) return { contractor: null, debtor: null };

  const rows = await prisma.contractor.findMany({
    where: { id: { in: ids } },
    select: { id: true, shortName: true, fullName: true },
  });
  const nameOf = (id: number | null) => {
    if (id === null) return null;
    const row = rows.find((r) => r.id === id);
    return row ? row.shortName || row.fullName || `#${id}` : `#${id}`;
  };
  return { contractor: nameOf(contractorId), debtor: nameOf(debtorId) };
}

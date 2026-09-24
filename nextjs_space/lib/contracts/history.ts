import type { ContractFormValues } from "./form-schema";
import type { FormDictionaries, Option } from "./dictionaries";

/**
 * Wpisy do `contracthistory` — jeden wiersz na zmienioną kolumnę.
 *
 * Dwie rzeczy są przepisane wprost z zaimportowanych 237 402 wierszy, bo nowe edycje
 * mają dopisywać się do TEJ SAMEJ ścieżki audytowej, a nie zakładać obok własnej:
 *
 *  1. `columnName` to nazwa kolumny z MySQL-a (snake_case, plus dwa wyjątki pisane
 *     inaczej: `OBSC` i `descOBSC`). Pełny słownik 31 nazw pochodzi z zapytania po
 *     zaimportowanych danych, nie z tłumaczenia nazw pól Prismy.
 *  2. Wartości są ZRESOLWOWANE do etykiet, nie do identyfikatorów — w dumpie
 *     `status_id` ma „Obowiązująca", a nie „2". Daty są w ISO, flagi jako 0/1,
 *     a brak wartości to pusty tekst.
 */

export interface HistoryRow {
  columnName: string;
  oldValue: string;
  newValue: string;
}

/** Migawka rekordu: nazwa kolumny legacy → wartość w postaci, w jakiej zapisuje ją dump. */
export type HistorySnapshot = Record<string, string>;

function label(options: Option[], id: number | null): string {
  if (id === null) return "";
  return options.find((o) => o.id === String(id))?.name ?? String(id);
}

function flag(value: boolean | null): string {
  if (value === null) return "";
  return value ? "1" : "0";
}

function text(value: string | null): string {
  return value ?? "";
}

/**
 * Kwota bez zer na końcu — dump zapisuje „5086.8", nie „5086.80", więc identyczna
 * kwota zapisana ponownie nie może wyglądać na zmianę.
 */
function money(value: string | null): string {
  if (value === null || value === "") return "";
  const n = Number(value);
  return Number.isNaN(n) ? value : String(n);
}

export function buildSnapshot(
  values: ContractFormValues,
  dicts: FormDictionaries,
): HistorySnapshot {
  return {
    identifier: text(values.identifier),
    type_id: label(dicts.documentTypes, values.documentTypeId),
    status_id: label(dicts.statuses, values.statusId),
    company_id: label(dicts.companies, values.companyId),
    buissnesline_id: label(dicts.businesslines, values.businesslineId),
    location_id: label(dicts.locations, values.primaryLocationId),
    domain_id: label(dicts.domains, values.domainId),
    contract_nature_id: label(dicts.natures, values.natureId),
    trade_id: label(dicts.trades, values.tradeId),
    delivery_id: label(dicts.deliveryMethods, values.deliveryMethodId),
    notice_period_id: label(dicts.noticePeriods, values.noticePeriodId),
    currency_id: label(dicts.currencies, values.currencyId),
    contract_reference: text(values.contractReference),
    description: text(values.description),
    date_begin: text(values.dateBegin),
    date_end: text(values.dateEnd),
    date_send: text(values.sentOn),
    date_payment: text(values.paymentTerm),
    salary: money(values.salary),
    specific_salary_terms: text(values.specificSalaryTerms),
    remarks: text(values.remarks),
    companies_connected: flag(values.companiesConnected),
    temp_form: flag(values.tempForm),
    OBSC: flag(values.obsc),
    descOBSC: text(values.obscDescription),
    insurance_guarantee: flag(values.insuranceGuarantee),
    bill: flag(values.bill),
  };
}

/**
 * Kontrahent i dłużnik nie są w słownikach formularza (autocomplete), więc ich
 * etykiety dokłada wywołujący, który i tak musi je pobrać do zapisu.
 */
export function withCounterparties(
  snapshot: HistorySnapshot,
  contractorName: string | null,
  debtorName: string | null,
): HistorySnapshot {
  return {
    ...snapshot,
    contractor_id: text(contractorName),
    debtor_id: text(debtorName),
  };
}

/**
 * `giveopinions` — otwarcie rundy opiniowania jest osobnym wpisem w historii. Legacy
 * zapisuje tam surowe id koordynatora, a `0` dla braku (`0` → `50463`), więc tak samo.
 */
export function withOpinionRound(
  snapshot: HistorySnapshot,
  requestedById: number | null,
): HistorySnapshot {
  return { ...snapshot, giveopinions: String(requestedById ?? 0) };
}

export function diffSnapshots(before: HistorySnapshot, after: HistorySnapshot): HistoryRow[] {
  const rows: HistoryRow[] = [];
  for (const columnName of Object.keys(after)) {
    const oldValue = before[columnName] ?? "";
    const newValue = after[columnName] ?? "";
    if (oldValue !== newValue) rows.push({ columnName, oldValue, newValue });
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────
// Odczyt — odwrotność `buildSnapshot` (docs/features/13)
//
// Wpisy z legacy trzymają przy kolumnach słownikowych surowe id („2" → „3"), nasze
// zapisy — etykiety („Obowiązująca"). Odczyt przyjmuje oba: liczbę tłumaczy przez pełny
// słownik (z pozycjami wygaszonymi), tekst pokazuje wprost.
// ─────────────────────────────────────────────────────────────────────────

/** Etykiety pól z formularza — nie nazwy kolumn MySQL-a. */
export const HISTORY_COLUMN_LABEL: Record<string, string> = {
  identifier: "Identyfikator",
  type_id: "Typ dokumentu",
  status_id: "Status",
  company_id: "Spółka",
  buissnesline_id: "Buissnesline",
  location_id: "Lokalizacja",
  domain_id: "Rodzaj umowy",
  contract_nature_id: "Charakter umowy",
  trade_id: "Eksport/Import",
  delivery_id: "Forma doręczenia",
  notice_period_id: "Okres wypowiedzenia",
  currency_id: "Waluta",
  contract_reference: "Numer umowy",
  description: "Przedmiot umowy",
  date_begin: "Data zawarcia",
  date_end: "Data zakończenia",
  date_send: "Data wysłania do podpisu",
  date_payment: "Termin płatności",
  salary: "Wynagrodzenie",
  specific_salary_terms: "Inne określenie wynagrodzenia",
  remarks: "Uwagi",
  companies_connected: "Podmiot powiązane",
  temp_form: "Formularz",
  OBSC: "OBSC",
  descOBSC: "Opis OBSC",
  insurance_guarantee: "Gwarancja/ubezpieczenie",
  bill: "Weksel",
  contractor_id: "Kontrahent",
  debtor_id: "Dłużnik",
  giveopinions: "Koordynator obiegu opinii",
  project: "Moduł",
  deleted: "Usunięty",
};

/** Kolumna słownikowa → klucz słownika, którym tłumaczymy id na nazwę. */
export const HISTORY_DICTIONARY_COLUMN = {
  type_id: "documentTypes",
  status_id: "statuses",
  company_id: "companies",
  buissnesline_id: "businesslines",
  location_id: "locations",
  domain_id: "domains",
  contract_nature_id: "natures",
  trade_id: "trades",
  delivery_id: "deliveryMethods",
  notice_period_id: "noticePeriods",
  currency_id: "currencies",
  contractor_id: "contractors",
  debtor_id: "contractors",
  giveopinions: "users",
} as const;

export type HistoryLookupName = (typeof HISTORY_DICTIONARY_COLUMN)[keyof typeof HISTORY_DICTIONARY_COLUMN];
export type HistoryLookups = Record<HistoryLookupName, ReadonlyMap<number, string>>;

const FLAG_COLUMNS = new Set([
  "companies_connected",
  "temp_form",
  "OBSC",
  "insurance_guarantee",
  "bill",
  "deleted",
]);
const DATE_COLUMNS = new Set(["date_begin", "date_end", "date_send"]);
/** Pola tekstowe, które legacy zapisywało w `varchar(50)` — dłuższe wartości ucinało. */
const TEXT_COLUMNS = new Set([
  "identifier",
  "contract_reference",
  "description",
  "date_payment",
  "specific_salary_terms",
  "remarks",
  "descOBSC",
]);
/** `contracthistory.oldvalue/newvalue` to `varchar(50)` w legacy. */
export const LEGACY_HISTORY_VALUE_LIMIT = 50;

const MODULE_LABEL: Record<string, string> = {
  "0": "Umowy",
  "1": "Projekty",
  "2": "Dział ryzyka",
  "3": "Eksperyment 2021",
};

export interface HistoryValue {
  /** Tekst do pokazania; null = brak wartości („—"). */
  text: string | null;
  /** Wartość z legacy mogła zostać ucięta do 50 znaków — nie nadaje się do odtworzenia. */
  truncated: boolean;
}

export function isHistoryColumnKnown(column: string): boolean {
  return column in HISTORY_COLUMN_LABEL;
}

/**
 * Wartość wpisu historii w postaci do przeczytania. `formatDate`/`formatMoney` podaje
 * wywołujący, żeby ten plik został czysty (bez zależności od formatowania i bazy).
 */
export function renderHistoryValue(
  column: string,
  raw: string | null,
  lookups: HistoryLookups,
  format: { date: (iso: string) => string; money: (value: string) => string },
): HistoryValue {
  const value = raw?.trim() ?? "";
  if (value === "" || value === "0000-00-00" || value.startsWith("0000-00-00")) {
    return { text: null, truncated: false };
  }

  if (column in HISTORY_DICTIONARY_COLUMN) {
    if (!/^\d+$/.test(value)) return { text: value, truncated: false }; // nasz zapis: etykieta
    const id = Number(value);
    if (id === 0) return { text: null, truncated: false }; // legacy: 0 = brak
    const lookup = lookups[HISTORY_DICTIONARY_COLUMN[column as keyof typeof HISTORY_DICTIONARY_COLUMN]];
    return { text: lookup.get(id) ?? `#${id} (usunięty)`, truncated: false };
  }
  if (FLAG_COLUMNS.has(column)) {
    if (value === "1") return { text: "Tak", truncated: false };
    if (value === "0") return { text: "Nie", truncated: false };
    if (value === "-1") return { text: "nie wskazano", truncated: false };
    return { text: value, truncated: false };
  }
  if (DATE_COLUMNS.has(column)) {
    return { text: /^\d{4}-\d{2}-\d{2}/.test(value) ? format.date(value.slice(0, 10)) : value, truncated: false };
  }
  if (column === "salary") {
    return { text: Number.isNaN(Number(value)) ? value : format.money(value), truncated: false };
  }
  if (column === "project") return { text: MODULE_LABEL[value] ?? value, truncated: false };

  return {
    text: value,
    truncated: TEXT_COLUMNS.has(column) && value.length === LEGACY_HISTORY_VALUE_LIMIT,
  };
}

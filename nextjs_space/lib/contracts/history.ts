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

/** `giveopinions` — otwarcie rundy opiniowania jest osobnym wpisem w historii. */
export function withOpinionRound(snapshot: HistorySnapshot, requested: boolean): HistorySnapshot {
  return { ...snapshot, giveopinions: flag(requested) };
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

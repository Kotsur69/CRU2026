// Rejestr kolumn listy Umów — 1:1 z panelem wyboru kolumn legacy (prawy klik na siatce).
// Identyfikator jest zablokowany (locked): to jedyny gwarantowany link/cel klawiatury w wierszu.

export type ColumnId =
  | "identifier"
  | "documentType"
  | "contractNumber"
  | "status"
  | "company"
  | "location"
  | "companyConnected"
  | "nature"
  | "subject"
  | "dateStart"
  | "dateEnd"
  | "noticePeriod"
  | "amount"
  | "obsc"
  | "currency"
  | "owners"
  | "businessline"
  | "contractors"
  | "otherAmountDesc"
  | "domain"
  | "formularz"
  | "remarks"
  | "permition"
  | "annex"
  | "attachments";

export interface ColumnDef {
  id: ColumnId;
  label: string;
  defaultVisible: boolean;
  locked?: boolean;
}

// Kolejność i domyślna widoczność odwzorowują panel legacy dokładnie.
export const COLUMN_DEFS: ColumnDef[] = [
  { id: "identifier", label: "Identyfikator", defaultVisible: true, locked: true },
  { id: "documentType", label: "Typ dokumentu", defaultVisible: true },
  { id: "contractNumber", label: "Numer umowy", defaultVisible: true },
  { id: "status", label: "Status", defaultVisible: true },
  { id: "company", label: "Spółka", defaultVisible: true },
  { id: "location", label: "Lokalizacja", defaultVisible: true },
  { id: "companyConnected", label: "Podmiot powiązane", defaultVisible: false },
  { id: "nature", label: "Charakter umowy", defaultVisible: false },
  { id: "subject", label: "Przedmiot umowy", defaultVisible: true },
  { id: "dateStart", label: "Data zawarcia", defaultVisible: false },
  { id: "dateEnd", label: "Data zakończenia", defaultVisible: false },
  { id: "noticePeriod", label: "Okres wypowiedzenia", defaultVisible: false },
  { id: "amount", label: "Wynagrodzenie", defaultVisible: true },
  { id: "obsc", label: "OBSC", defaultVisible: true },
  { id: "currency", label: "Waluta", defaultVisible: false },
  { id: "owners", label: "Właściciel umowy", defaultVisible: true },
  { id: "businessline", label: "Buissnesline", defaultVisible: true },
  { id: "contractors", label: "Kontrahenci", defaultVisible: true },
  { id: "otherAmountDesc", label: "Inne określenie wynagrodzenia", defaultVisible: false },
  { id: "domain", label: "Rodzaj umowy", defaultVisible: false },
  { id: "formularz", label: "Formularz", defaultVisible: false },
  { id: "remarks", label: "Uwagi", defaultVisible: false },
  { id: "permition", label: "Uprawnienia", defaultVisible: true },
  { id: "annex", label: "Aneks", defaultVisible: true },
  { id: "attachments", label: "Załączniki", defaultVisible: true },
];

export const DEFAULT_VISIBLE_IDS: ColumnId[] = COLUMN_DEFS.filter((c) => c.defaultVisible).map(
  (c) => c.id,
);

export const LOCKED_IDS: ColumnId[] = COLUMN_DEFS.filter((c) => c.locked).map((c) => c.id);

export const COLUMN_STORAGE_KEY = "cru2026:umowy:columns";

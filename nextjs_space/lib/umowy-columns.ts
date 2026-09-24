// Rejestr kolumn listy Umów. Panel wyboru kolumn jest NASZĄ funkcją — żadne źródło
// (audyt, plan, status projektu) nie notuje go w legacy (docs/features/06, Q36). Zestaw
// wyszedł z dwunastu kolumn listy z audytu (§1.3, oznaczone `legacy: true`) plus pól
// podglądu rekordu (§1.4) i trzech naszych („Uprawnienia", „Aneks", „Załączniki").
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
  | "lastNote"
  | "permition"
  | "annex"
  | "attachments";

export interface ColumnDef {
  id: ColumnId;
  label: string;
  defaultVisible: boolean;
  locked?: boolean;
  /** Jedna z dwunastu kolumn listy zaobserwowanych w legacy (audyt §1.3). */
  legacy?: boolean;
  align?: "right" | "center";
}

// Kolejność: najpierw porządek z audytu, pola podglądu wstawione obok pokrewnych.
export const COLUMN_DEFS: ColumnDef[] = [
  { id: "identifier", label: "Identyfikator", defaultVisible: true, locked: true, legacy: true },
  { id: "documentType", label: "Typ dokumentu", defaultVisible: true, legacy: true },
  { id: "contractNumber", label: "Numer umowy", defaultVisible: true, legacy: true },
  { id: "status", label: "Status", defaultVisible: true, legacy: true },
  { id: "company", label: "Spółka", defaultVisible: true, legacy: true },
  { id: "location", label: "Lokalizacja", defaultVisible: true, legacy: true },
  { id: "companyConnected", label: "Podmiot powiązane", defaultVisible: false, align: "center" },
  { id: "nature", label: "Charakter umowy", defaultVisible: false },
  { id: "subject", label: "Przedmiot umowy", defaultVisible: true, legacy: true },
  { id: "dateStart", label: "Data zawarcia", defaultVisible: false },
  { id: "dateEnd", label: "Data zakończenia", defaultVisible: false },
  { id: "noticePeriod", label: "Okres wypowiedzenia", defaultVisible: false },
  { id: "amount", label: "Wynagrodzenie", defaultVisible: true, legacy: true, align: "right" },
  { id: "obsc", label: "OBSC", defaultVisible: true, legacy: true, align: "center" },
  { id: "currency", label: "Waluta", defaultVisible: false },
  { id: "owners", label: "Właściciel umowy", defaultVisible: true, legacy: true },
  // Pisownia legacy (audyt §1.3) — celowo nie „Businessline".
  { id: "businessline", label: "Buissnesline", defaultVisible: true, legacy: true },
  { id: "contractors", label: "Kontrahenci", defaultVisible: true, legacy: true },
  { id: "otherAmountDesc", label: "Inne określenie wynagrodzenia", defaultVisible: false },
  { id: "domain", label: "Rodzaj umowy", defaultVisible: false },
  { id: "formularz", label: "Formularz", defaultVisible: false, align: "center" },
  { id: "remarks", label: "Uwagi", defaultVisible: false },
  // Legacy ma tę kolumnę tylko na Projektach; tu jest nasza i domyślnie ukryta (Q14 pkt 4).
  { id: "lastNote", label: "Ostatnia notatka", defaultVisible: false },
  { id: "permition", label: "Uprawnienia", defaultVisible: true },
  { id: "annex", label: "Aneks", defaultVisible: true },
  { id: "attachments", label: "Załączniki", defaultVisible: true },
];

export const COLUMN_STORAGE_KEY = "cru2026:umowy:columns";

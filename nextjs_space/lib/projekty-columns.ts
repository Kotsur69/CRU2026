// Kolumny listy Projektów. Osiem pierwszych to lista legacy (audyt §2.3), w jej
// kolejności; „Umowa" jest nasza i domyślnie ukryta (docs/features/07, Q38) — to
// identyfikator umowy, którą projekt się stał, obecny na 7 013 rekordach.

export type ProjectColumnId =
  | "identifier"
  | "status"
  | "owners"
  | "contractors"
  | "subject"
  | "lastNote"
  | "reviewers"
  | "sentToSign"
  | "contract";

export interface ProjectColumnDef {
  id: ProjectColumnId;
  label: string;
  defaultVisible: boolean;
  locked?: boolean;
}

export const PROJECT_COLUMN_DEFS: ProjectColumnDef[] = [
  { id: "identifier", label: "Identyfikator", defaultVisible: true, locked: true },
  { id: "status", label: "Status", defaultVisible: true },
  { id: "owners", label: "Właściciel umowy", defaultVisible: true },
  { id: "contractors", label: "Kontrahenci", defaultVisible: true },
  { id: "subject", label: "Przedmiot umowy", defaultVisible: true },
  { id: "lastNote", label: "Ostatnia notatka", defaultVisible: true },
  { id: "reviewers", label: "Opiniujący", defaultVisible: true },
  { id: "sentToSign", label: "Wysł. do podp.", defaultVisible: true },
  { id: "contract", label: "Umowa", defaultVisible: false },
];

export const PROJECT_COLUMN_STORAGE_KEY = "cru2026:projekty:columns";

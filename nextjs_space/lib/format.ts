// Formatowanie prezentacyjne (PL).

export function formatMoney(
  amount: number | string | null | undefined,
  currency?: string | null,
): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (Number.isNaN(value)) return "—";
  const formatted = new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return currency ? `${formatted} ${currency}` : formatted;
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// Legacy pokazuje audyt co do sekundy (np. "2024-03-11 14:37:49") — sama data gubi
// informację, która w rejestrze umów bywa rozstrzygająca.
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

export function yesNo(value: boolean | null | undefined): string {
  return value ? "Tak" : "Nie";
}

/**
 * Display name for a user, "Nazwisko Imię" as legacy writes it (audyt §1.4: „Włodek
 * Karolina; Mazur Mateusz"). Rows imported as placeholders from the legacy directory
 * (`am_admin`) carry no name yet, so fall back to the login and then the id.
 */
export function userLabel(user: {
  id: number;
  firstName: string | null;
  lastName: string | null;
  login: string | null;
}): string {
  const full = [user.lastName, user.firstName].filter(Boolean).join(" ");
  return full || user.login || `#${user.id}`;
}

/** Display name for a contractor — legacy keeps a short and a full name. */
export function contractorLabel(contractor: {
  id: number;
  shortName: string | null;
  fullName: string | null;
}): string {
  return contractor.shortName || contractor.fullName || `#${contractor.id}`;
}

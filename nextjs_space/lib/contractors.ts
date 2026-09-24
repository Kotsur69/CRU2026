import { z } from "zod";
import { contractorLabel } from "@/lib/format";
import { flattenIssues } from "@/lib/contracts/form-schema";

/**
 * Słownik kontrahentów — reguły wspólne dla formularza, akcji serwerowych i
 * `/api/contractors` (docs/features/20). Moduł jest czysty, bez bazy: z normalizacji NIP-u
 * i ze schematu korzysta też formularz w przeglądarce. Zapytania są w `contractors-db.ts`.
 */

/** Polski NIP to 10 cyfr — kreski i spacje są tylko zapisem, nie częścią numeru. */
export const NIP_LENGTH = 10;

const NIP_PATTERN = /^\d{10}$/;

/** Separatory wpisywane w NIP: spacje (także twarde), kropki, kreski i pauzy. */
const NIP_SEPARATORS = /[\s.‐-―-]/g;

/**
 * NIP w postaci do zapisu i do porównań: bez separatorów i bez prefiksu `PL` (numer VAT
 * UE to ten sam NIP). `123-456-78-90` i `1234567890` to jeden numer. Pusty → null.
 */
export function normaliseVatId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const compact = value.replace(NIP_SEPARATORS, "").toUpperCase();
  const number = compact.startsWith("PL") ? compact.slice(2) : compact;
  return number === "" ? null : number;
}

/**
 * Same cyfry — tak porównuje baza (`regexp_replace(…, '[^0-9]', '')`, zapytanie nr 3
 * w specyfikacji), bo zapisy legacy bywają sformatowane dowolnie.
 */
export function nipDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** Błąd formatu albo null. Brak NIP-u błędem nie jest — kontrahent zagraniczny go nie ma. */
export function nipFormatError(nip: string | null): string | null {
  if (nip === null || NIP_PATTERN.test(nip)) return null;
  return `NIP musi mieć ${NIP_LENGTH} cyfr (kreski i spacje są pomijane).`;
}

export const NO_NIP_WARNING = "Brak NIP — kontrahent nie będzie wyszukiwalny po numerze.";

export function nipCollisionMessage(name: string): string {
  return `Kontrahent o tym NIP już istnieje: ${name}.`;
}

/** Pytanie przy dopisywaniu firmy — kolizja NIP-u nigdy nie podmienia kontrahenta po cichu. */
export function nipCollisionQuestion(name: string): string {
  return `${nipCollisionMessage(name)} Użyć go?`;
}

/** „Nazwa NIP: 1234567890" — tak legacy podpisuje kontrahenta w podglądzie (audyt §1.4). */
export function contractorLabelWithNip(contractor: {
  id: number;
  shortName: string | null;
  fullName: string | null;
  vatId: string | null;
}): string {
  const name = contractorLabel(contractor);
  return contractor.vatId ? `${name} NIP: ${contractor.vatId}` : name;
}

/** Pozycja podpowiedzi i odpowiedź API — nazwa i NIP osobno, klient składa je sam. */
export interface ContractorOption {
  id: number;
  name: string;
  vatId: string | null;
}

export const CONTRACTOR_LIMITS = {
  shortName: 190,
  fullName: 500,
  register: 190,
  address: 500,
} as const;

/** Tekst z formularza albo z JSON-a: brak pola i pusty tekst to null. */
const optionalText = (max: number) =>
  z
    .preprocess(
      (v) => (typeof v === "string" ? v : ""),
      z.string().trim().max(max, `Maksymalnie ${max} znaków.`),
    )
    .transform((v) => (v === "" ? null : v));

const flag = z.preprocess(
  (v) => v === true || v === "1" || v === "on" || v === "true",
  z.boolean(),
);

export const contractorFormSchema = z.object({
  shortName: optionalText(CONTRACTOR_LIMITS.shortName).transform((v, ctx) => {
    if (v === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Nazwa skrócona jest wymagana." });
      return z.NEVER;
    }
    return v;
  }),
  fullName: optionalText(CONTRACTOR_LIMITS.fullName),
  // Format (10 cyfr) sprawdza wołający: przy edycji niezmieniony zapis legacy przechodzi.
  vatId: z
    .preprocess((v) => (typeof v === "string" ? v : null), z.string().nullable())
    .transform(normaliseVatId),
  register: optionalText(CONTRACTOR_LIMITS.register),
  address: optionalText(CONTRACTOR_LIMITS.address),
  isCeidg: flag,
  isConnected: flag,
});

export type ContractorFormValues = z.infer<typeof contractorFormSchema>;

export type ContractorFormErrors = Partial<Record<string, string>>;

export type ContractorParseResult =
  | { ok: true; values: ContractorFormValues }
  | { ok: false; errors: ContractorFormErrors };

/** Walidacja wejścia — ta sama dla formularza (FormData) i dla API (JSON). */
export function parseContractorInput(input: Record<string, unknown>): ContractorParseResult {
  const parsed = contractorFormSchema.safeParse(input);
  return parsed.success
    ? { ok: true, values: parsed.data }
    : { ok: false, errors: flattenIssues(parsed.error) };
}

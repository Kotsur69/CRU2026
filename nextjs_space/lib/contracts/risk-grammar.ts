/**
 * Gramatyka numerów Działu ryzyka, `YYYY/L/NNNN` (docs/features/08) — część czysta,
 * bez bazy, więc używa jej też formularz w przeglądarce.
 *
 * L to inicjał rodzaju (domeny), a numeracja startuje od 1 w każdym roku i dla każdej
 * litery osobno. Trzy z 406 rekordów nie zgadzają się z własnym rodzajem (dwa `C` i
 * jeden `P` zapisane jako Ugoda), dlatego niezgodność jest ostrzeżeniem, nie błędem —
 * numer jest tym, co mają dokumenty kontrahenta, i nigdy go nie przenumerowujemy.
 */

/** Klucz to id domeny, nie nazwa — zmiana nazwy w słowniku nie może zmienić numeracji. */
export const RISK_DOMAIN_LETTER: Record<number, string> = {
  33: "U", // Ugoda
  34: "C", // Cesja
  35: "P", // Poręczenie
  36: "Z", // Zabezpieczenie
  37: "I", // Inne
};

const RISK_SEQUENCE_PAD = 4;
const RISK_IDENTIFIER = /^(\d{4})\/([A-Z])\/(\d+)$/;

export function riskIdentifierFor(letter: string, year: number, sequence: number): string {
  return `${year}/${letter}/${String(sequence).padStart(RISK_SEQUENCE_PAD, "0")}`;
}

/** Litera z numeru ryzyka, albo null, gdy numer nie ma kształtu `YYYY/L/NNNN`. */
export function riskLetterOf(identifier: string | null): string | null {
  if (!identifier) return null;
  return RISK_IDENTIFIER.exec(identifier.trim())?.[2] ?? null;
}

/**
 * Ostrzeżenie o niezgodności litery numeru z rodzajem — albo null, gdy się zgadzają
 * (albo nie ma czego porównać).
 */
export function riskLetterMismatch(
  identifier: string | null,
  domain: { id: number; name: string } | null,
): string | null {
  const letter = riskLetterOf(identifier);
  const expected = domain ? RISK_DOMAIN_LETTER[domain.id] : undefined;
  if (!domain || !letter || !expected || letter === expected) return null;
  return `Litera identyfikatora (${letter}) nie zgadza się z rodzajem (${domain.name})`;
}

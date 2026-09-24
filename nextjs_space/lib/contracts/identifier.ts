import { prisma } from "@/lib/prisma";

/**
 * Gramatyka i nadawanie identyfikatorów (docs/features/02).
 *
 * W zaimportowanym rejestrze widać m.in. takie kształty:
 *   `AMDSP/DYS/2026/0179`   umowa      (spółka / businessline / rok / numer)
 *   `AMDSP/DYS/2026/P0299`  projekt    (ta sama seria, numer z prefiksem P)
 *   `HK POM/2026/0020`      umowa bez segmentu businessline (spacja w skrócie spółki)
 *   `2019/0466`             stare rekordy bez prefiksu spółki
 *   `HK POM/2026/0020/A02`  aneks      (identyfikator rodzica + /A + kolejny numer)
 *   `/2019/P0134`           pusty pierwszy segment (23 rekordy)
 *   `2019/U/0466`           nienumeryczny segment roku (453 rekordy)
 *
 * Legacy rozkłada numer w widoku `contractview` (`cru.sql:447511`) na trzy liczby:
 * rok, numer i numer aneksu. `parseIdentifier` robi to samo z dwiema różnicami:
 *  - aneks rozpoznaje po kształcie tekstu (`/A01` na końcu), a nie po typie dokumentu —
 *    rekord typu „Aneks" bez sufiksu legacy czytało z przesuniętych segmentów;
 *  - segment nienumeryczny daje `null`, a nie 0 jak `abs()` w MySQL-u, więc takie
 *    rekordy sortują się na końcu, a nie skupiają jako „rok 0".
 */

export interface ParsedIdentifier {
  /** Wszystko przed segmentem roku, np. "AMDSP/DYS" albo "HK POM". Null, gdy brak. */
  prefix: string | null;
  /** Null, gdy segment nie jest liczbą — tu legacy `abs()` dałby 0. */
  year: number | null;
  /** Prefiks P przed numerem oznacza projekt. */
  isProject: boolean;
  /** Null, gdy segment nie jest liczbą (np. `S0466`). */
  sequence: number | null;
  /** 0, gdy identyfikator nie ma sufiksu /A — tak jak `n_anex` w legacy. */
  annex: number;
}

/** Sufiks aneksu: `A01`, ale w danych bywa też `A1` albo `A001`. */
const ANNEX_SEGMENT = /^A(\d{1,3})$/i;
const SEQUENCE_SEGMENT = /^(P?)(\d+)$/;
const NUMERIC_SEGMENT = /^\d+$/;

export const SEQUENCE_PAD = 4;
export const ANNEX_PAD = 2;

export function parseIdentifier(identifier: string): ParsedIdentifier {
  const segments = identifier.trim().split("/");

  let annex = 0;
  const annexMatch = segments.length > 1 ? ANNEX_SEGMENT.exec(segments.at(-1)!) : null;
  if (annexMatch) {
    annex = Number.parseInt(annexMatch[1]!, 10);
    segments.pop();
  }

  const sequenceMatch = SEQUENCE_SEGMENT.exec(segments.at(-1) ?? "");
  const yearSegment = segments.length > 1 ? segments.at(-2)! : null;
  const prefix = segments.slice(0, -2).join("/");

  return {
    prefix: prefix === "" ? null : prefix,
    year: yearSegment !== null && NUMERIC_SEGMENT.test(yearSegment) ? Number(yearSegment) : null,
    isProject: sequenceMatch?.[1] === "P",
    sequence: sequenceMatch ? Number.parseInt(sequenceMatch[2]!, 10) : null,
    annex,
  };
}

/**
 * Składa numer w kanonicznym kształcie: `[prefiks/]rok/[P]numer[/Ann]`.
 * Numer ma 4 cyfry (`0006`, `P0481`), aneks 2 (`A01`) — jak dominujące kształty w danych.
 */
export function composeIdentifier(parts: {
  prefix: string | null;
  year: number;
  isProject: boolean;
  sequence: number;
  annex?: number;
}): string {
  const number = `${parts.isProject ? "P" : ""}${String(parts.sequence).padStart(SEQUENCE_PAD, "0")}`;
  const base = parts.prefix ? `${parts.prefix}/${parts.year}/${number}` : `${parts.year}/${number}`;
  return parts.annex ? `${base}/A${String(parts.annex).padStart(ANNEX_PAD, "0")}` : base;
}

function compareNullable(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/**
 * Porządek numerów jak w legacy (rok, numer, aneks), liczbowo — `/A10` po `/A2`,
 * `P1000` po `P999`. Segmenty nienumeryczne idą na koniec zamiast na początek.
 */
export function compareIdentifiers(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const pa = parseIdentifier(a);
  const pb = parseIdentifier(b);
  return (
    compareNullable(pa.year, pb.year) ||
    compareNullable(pa.sequence, pb.sequence) ||
    pa.annex - pb.annex ||
    a.localeCompare(b, "pl")
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Nadawanie numerów
// ─────────────────────────────────────────────────────────────────────────

/** Seria numeracji: spółka + businessline + rejestr. Projekty mają numer z prefiksem P. */
export interface SeriesKey {
  companyId: number | null;
  businesslineId: number | null;
  module: "CONTRACT" | "PROJECT" | "RISK";
}

/**
 * Rekordy Działu ryzyka numerowano dotąd w serii umów — tak zachowuje się generator od
 * początku, a własną gramatykę ryzyka (`YYYY/L/NNNN`) opisuje docs/features/08.
 */
function seriesModule(key: SeriesKey): "CONTRACT" | "PROJECT" {
  return key.module === "PROJECT" ? "PROJECT" : "CONTRACT";
}

/**
 * Kolejny numer w serii spółka+businessline+rok. Gdy w danym roku nie ma jeszcze
 * rekordu, prefiks pochodzi z ostatniego rekordu tej serii z lat poprzednich,
 * a numeracja startuje od 1 — tak samo jak w danych na przełomie lat.
 *
 * Maksimum liczy baza, a nie pętla po ograniczonej próbce: `identifier` to tekst, więc
 * numer wyciągamy wyrażeniem i porównujemy jako liczbę (999 < 1000), a największa seria
 * (projekty AMDSP/DYS) ma już ponad 2 800 rekordów. Rekordy usunięte liczą się do
 * maksimum, żeby ich numery nie wracały.
 */
export async function nextRecordIdentifier(
  key: SeriesKey,
  year: number = new Date().getFullYear(),
): Promise<string> {
  const module = seriesModule(key);
  const isProject = module === "PROJECT";
  const p = isProject ? "P" : "";
  const inSeries = `^(.+/)?[0-9]{4}/${p}[0-9]{1,6}$`;
  const inYear = `^(.+/)?${year}/${p}[0-9]{1,6}$`;

  const [newest, highest] = await Promise.all([
    // Najświeższy prefiks w serii wygrywa, żeby zmiana konwencji nie cofała się w czasie.
    prisma.$queryRaw<{ prefix: string | null }[]>`
      SELECT substring(btrim(c."identifier") from '^(.*)/[0-9]{4}/P?[0-9]{1,6}$') AS prefix
      FROM "Contract" AS c
      WHERE c."companyId" IS NOT DISTINCT FROM ${key.companyId}::int
        AND c."businesslineId" IS NOT DISTINCT FROM ${key.businesslineId}::int
        AND c."module" = ${module}::"ContractModule"
        AND btrim(c."identifier") ~ ${inSeries}
      ORDER BY substring(btrim(c."identifier") from '([0-9]{4})/P?[0-9]{1,6}$')::int DESC,
               c."id" DESC
      LIMIT 1`,
    prisma.$queryRaw<{ highest: number | null }[]>`
      SELECT max(substring(btrim(c."identifier") from '([0-9]{1,6})$')::int) AS highest
      FROM "Contract" AS c
      WHERE c."companyId" IS NOT DISTINCT FROM ${key.companyId}::int
        AND c."businesslineId" IS NOT DISTINCT FROM ${key.businesslineId}::int
        AND c."module" = ${module}::"ContractModule"
        AND btrim(c."identifier") ~ ${inYear}`,
  ]);

  const prefix =
    newest.length > 0
      ? newest[0]!.prefix || null
      : // Pierwszy rekord tej spółki i businessline'u — prefiks składamy ze słowników.
        await composePrefixFromDictionaries(key);

  return composeIdentifier({ prefix, year, isProject, sequence: (highest[0]?.highest ?? 0) + 1 });
}

/** Pozycje-„braki" słowników — nie są skrótem, więc nie trafiają do numeru. */
const PLACEHOLDER_NAMES = new Set(["---", "(brak danych)"]);

function prefixSegment(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && !PLACEHOLDER_NAMES.has(trimmed) ? trimmed : null;
}

/**
 * Prefiks ze słowników: skrót spółki i skrót businessline'u. `Businessline.name` to
 * „DYSTRYBUCJA", a w numerze stoi „DYS" (`shortName`) — długą nazwę bierzemy tylko,
 * gdy skrótu brak. Pozycje-braki („---", „(brak danych)") pomijamy, jak w danych, gdzie
 * rekord bez businessline'u ma numer `AMDSP/2023/P0044`.
 */
export function composePrefix(
  company: { shortName: string } | null,
  businessline: { name: string; shortName: string | null } | null,
): string | null {
  const parts = [
    prefixSegment(company?.shortName),
    prefixSegment(businessline?.shortName ?? businessline?.name),
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join("/") : null;
}

async function composePrefixFromDictionaries(key: SeriesKey): Promise<string | null> {
  const [company, businessline] = await Promise.all([
    key.companyId ? prisma.company.findUnique({ where: { id: key.companyId } }) : null,
    key.businesslineId
      ? prisma.businessline.findUnique({ where: { id: key.businesslineId } })
      : null,
  ]);
  return composePrefix(company, businessline);
}

/**
 * Najwyższy numer aneksu wśród podanych identyfikatorów rodzeństwa. Liczy się każdy
 * rekord potomny, także usunięty: skasowany `A01` nie zwalnia swojego numeru (tak
 * zweryfikowano na umowie 21228 — po usuniętym 21235 kolejny aneks dostał `A02`).
 */
export function highestAnnex(siblings: readonly (string | null)[]): number {
  let highest = 0;
  for (const identifier of siblings) {
    if (!identifier) continue;
    const { annex } = parseIdentifier(identifier);
    if (annex > highest) highest = annex;
  }
  return highest;
}

/**
 * Kolejny aneks danej umowy: identyfikator rodzica + `/A01`, `/A02`, …
 * Numerujemy po rodzeństwie (maksimum + 1), a nie po jego liczbie, żeby skasowany
 * aneks nie spowodował ponownego użycia swojego numeru.
 */
export async function nextAnnexIdentifier(parentId: number): Promise<string | null> {
  const parent = await prisma.contract.findUnique({
    where: { id: parentId },
    select: {
      identifier: true,
      annexes: { select: { identifier: true } },
    },
  });
  if (!parent?.identifier) return null;

  const next = highestAnnex(parent.annexes.map((a) => a.identifier)) + 1;
  return `${parent.identifier}/A${String(next).padStart(ANNEX_PAD, "0")}`;
}

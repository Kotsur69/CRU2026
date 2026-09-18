import { prisma } from "@/lib/prisma";

/**
 * Nadawanie identyfikatorów, odtworzone z danych — nie z domysłu.
 *
 * W zaimportowanym rejestrze widać trzy kształty:
 *   `AMDSP/DYS/2026/0179`   umowa      (spółka / businessline / rok / numer)
 *   `AMDSP/DYS/2026/P0299`  projekt    (ta sama seria, numer z prefiksem P)
 *   `HK POM/2026/0020`      umowa bez segmentu businessline
 *   `2019/0466`             stare rekordy bez prefiksu spółki
 *   `HK POM/2026/0020/A02`  aneks      (identyfikator rodzica + /A + kolejny numer)
 *
 * Skrótów spółek i businessline'ów NIE budujemy sami — braliby się ze zgadywania
 * (skąd „DYS" dla Dystrybucji?). Zamiast tego prefiks jest przepisywany z ostatniego
 * rekordu tej samej serii, więc nowy numer zawsze wygląda jak numery obok niego.
 */

/** `[prefiks/]rok/[P]numer` — prefiks bywa pusty w najstarszych rekordach. */
const NUMBERED = /^(?:(.+)\/)?(\d{4})\/(P?)(\d{1,6})$/;
const ANNEX = /^(.+)\/A(\d{1,3})$/i;

const SEQUENCE_PAD = 4;
const ANNEX_PAD = 2;
/** Górny limit rekordów serii branych pod uwagę przy wyznaczaniu numeru. */
const SERIES_SCAN_LIMIT = 2000;

export interface SeriesKey {
  companyId: number | null;
  businesslineId: number | null;
  isProject: boolean;
}

interface ParsedIdentifier {
  prefix: string | null;
  year: number;
  isProject: boolean;
  sequence: number;
}

function parseIdentifier(identifier: string): ParsedIdentifier | null {
  const m = NUMBERED.exec(identifier.trim());
  if (!m) return null;
  return {
    prefix: m[1] ?? null,
    year: Number.parseInt(m[2], 10),
    isProject: m[3].toUpperCase() === "P",
    sequence: Number.parseInt(m[4], 10),
  };
}

function compose(prefix: string | null, year: number, isProject: boolean, sequence: number) {
  const number = `${isProject ? "P" : ""}${String(sequence).padStart(SEQUENCE_PAD, "0")}`;
  return prefix ? `${prefix}/${year}/${number}` : `${year}/${number}`;
}

/**
 * Kolejny numer w serii spółka+businessline+rok. Gdy w danym roku nie ma jeszcze
 * rekordu, prefiks pochodzi z ostatniego rekordu tej serii z lat poprzednich,
 * a numeracja startuje od 1 — tak samo jak w danych na przełomie lat.
 */
export async function nextRecordIdentifier(
  key: SeriesKey,
  year: number = new Date().getFullYear(),
): Promise<string> {
  // Cała seria jednej spółki i businessline'u to setki rekordów, więc numer wyznaczamy
  // w pamięci — `identifier` jest tekstem, a sortowanie tekstowe pomyliłoby 999 z 1000.
  const rows = await prisma.contract.findMany({
    where: {
      companyId: key.companyId,
      businesslineId: key.businesslineId,
      isProject: key.isProject,
      identifier: { not: null },
    },
    select: { identifier: true },
    orderBy: { id: "desc" },
    take: SERIES_SCAN_LIMIT,
  });

  let prefix: string | null = null;
  let prefixFromYear = -1;
  let highest = 0;

  for (const row of rows) {
    const parsed = row.identifier ? parseIdentifier(row.identifier) : null;
    if (!parsed || parsed.isProject !== key.isProject) continue;

    // Najświeższy prefiks w serii wygrywa, żeby zmiana konwencji nie cofała się w czasie.
    if (parsed.year > prefixFromYear) {
      prefix = parsed.prefix;
      prefixFromYear = parsed.year;
    }
    if (parsed.year === year && parsed.sequence > highest) highest = parsed.sequence;
  }

  if (prefixFromYear === -1) {
    // Pierwszy rekord tej spółki i businessline'u — prefiks składamy ze słowników.
    prefix = await composePrefixFromDictionaries(key);
  }

  return compose(prefix, year, key.isProject, highest + 1);
}

async function composePrefixFromDictionaries(key: SeriesKey): Promise<string | null> {
  const [company, businessline] = await Promise.all([
    key.companyId ? prisma.company.findUnique({ where: { id: key.companyId } }) : null,
    key.businesslineId
      ? prisma.businessline.findUnique({ where: { id: key.businesslineId } })
      : null,
  ]);
  const parts = [company?.shortName, businessline?.name].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join("/") : null;
}

/**
 * Kolejny aneks danej umowy: identyfikator rodzica + `/A01`, `/A02`, …
 * Numerujemy po rodzeństwie, a nie po ich liczbie, żeby skasowany aneks nie
 * spowodował ponownego użycia swojego numeru.
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

  let highest = 0;
  for (const annex of parent.annexes) {
    const m = annex.identifier ? ANNEX.exec(annex.identifier) : null;
    if (!m) continue;
    const n = Number.parseInt(m[2], 10);
    if (n > highest) highest = n;
  }

  return `${parent.identifier}/A${String(highest + 1).padStart(ANNEX_PAD, "0")}`;
}

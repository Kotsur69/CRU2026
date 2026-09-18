import type { ContractStatusKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { userLabel } from "@/lib/format";

/**
 * Listy wyboru formularza umowy.
 *
 * Kontrahentów tu NIE ma: słownik liczy tysiące firm i legacy obsługuje go
 * autocomplete'em (audyt 1.6), więc wybór idzie przez `/api/contractors`, a nie
 * przez `<select>` z kilkoma tysiącami `<option>`.
 *
 * Pozycje wygaszone (`active = false`) są ukryte — tak samo jak w filtrach rejestru
 * i tak samo jak na zrzutach legacy, gdzie „Typ dokumentu" ma sześć pozycji, a nie
 * dziewięć (wygaszone „Kontrakt", „Przetarg" i „(brak danych)" się tam nie pokazują).
 * Wartość już wpisana w rekordzie zostaje jednak na liście nawet po wygaszeniu:
 * 40 żywych umów ma typ „Kontrakt" albo „Przetarg" i ukrycie go kasowałoby im typ
 * przy pierwszym zapisie.
 *
 * „Rodzaj umowy" jest dodatkowo dzielony `DomainKind`: pozycje ryzyka (Cesja, Ugoda,
 * Poręczenie, Zabezpieczenie, Inne) nie wchodzą do formularza umowy ani projektu.
 * W danych nie ma ani jednego wyjątku — wszystkie 422 rekordy z takim rodzajem stoją
 * w Dziale ryzyka.
 */

export interface Option {
  id: string;
  name: string;
}

/**
 * Większość słowników niesie własny wiersz „braku" (id 1) zamiast pustego wyboru —
 * tak wyglądają zrzuty legacy, gdzie nowy wpis otwiera się z „(brak danych)" w polach
 * Forma doręczenia, Spółka, Lokalizacja, Rodzaj umowy i Okres wypowiedzenia.
 */
export const BLANK_OPTION_NAME = "(brak danych)";

/** Identyfikator pozycji o danej nazwie — `null`, gdy słownik jej nie ma. */
export function optionId(options: Option[], name: string): number | null {
  const row = options.find((o) => o.name === name);
  return row ? Number.parseInt(row.id, 10) : null;
}

/** Wartości już wpisane w rekordzie — muszą zostać wybieralne mimo wygaszenia. */
export interface CurrentDictionaryValues {
  documentTypeId?: number | null;
  statusId?: number | null;
  companyId?: number | null;
  domainId?: number | null;
}

export interface FormDictionaries {
  documentTypes: Option[];
  statuses: Option[];
  companies: Option[];
  businesslines: Option[];
  locations: Option[];
  domains: Option[];
  natures: Option[];
  trades: Option[];
  deliveryMethods: Option[];
  noticePeriods: Option[];
  currencies: Option[];
  people: Option[];
}

const byName = { name: "asc" } as const;

/**
 * Listy słownikowe idą alfabetycznie, po polsku.
 *
 * Alfabetycznie, bo tak wyglądają na zrzutach legacy — w „Lokalizacji" Bydgoszcz (id 35,
 * dodana najpóźniej) stoi zaraz po Białymstoku, a „Handlowe - Zbrojarnia" (id 30) między
 * „Handlowe" a „Informatyką". Kolejność z `sortOrder` wypychałaby je na koniec.
 *
 * Po polsku, bo baza stoi na kolacji, w której „Ł" i „Ś" lądują za „Z" — a legacy ma
 * Słupsk przed Starachowicami i Świętochłowice zaraz za Szczecinem. Prisma nie umie
 * wskazać kolacji w `orderBy`, więc porządkujemy w pamięci; listy mają po kilkadziesiąt
 * pozycji, więc koszt jest żaden.
 */
const polish = new Intl.Collator("pl");

/**
 * Pozycje trzymane na liście mimo wygaszenia, bo któryś ze stanów rekordu już je ma
 * wpisane. Historia zmian resolwuje identyfikatory na nazwy przez te same listy, więc
 * przy edycji podajemy oba stany — stan sprzed zapisu i zapisywany.
 */
function keep(sources: CurrentDictionaryValues[], field: keyof CurrentDictionaryValues) {
  const ids = new Set<number>();
  for (const source of sources) {
    const id = source[field];
    if (typeof id === "number" && id > 0) ids.add(id);
  }
  return [...ids].map((id) => ({ id }));
}

export async function loadFormDictionaries(
  kind: ContractStatusKind,
  ...current: CurrentDictionaryValues[]
): Promise<FormDictionaries> {
  const [
    documentTypes,
    statuses,
    companies,
    businesslines,
    locations,
    domains,
    natures,
    trades,
    deliveryMethods,
    noticePeriods,
    currencies,
    people,
  ] = await Promise.all([
    prisma.documentType.findMany({
      where: { OR: [{ active: true }, ...keep(current, "documentTypeId")] },
      orderBy: byName,
    }),
    // Statusy są rozłączne per moduł: umowa nigdy nie dostaje statusu projektu.
    // Jako jedyne zostają w kolejności `sortOrder` — to lista ułożona ręcznie,
    // od „w toku" po „zakończony", a nie zbiór haseł do przewinięcia alfabetem.
    prisma.contractStatus.findMany({
      where: { OR: [{ active: true, kind }, ...keep(current, "statusId")] },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.company.findMany({
      where: { OR: [{ active: true }, ...keep(current, "companyId")] },
      orderBy: { shortName: "asc" },
    }),
    prisma.businessline.findMany({ where: { active: true }, orderBy: byName }),
    prisma.location.findMany({ where: { active: true }, orderBy: byName }),
    prisma.domain.findMany({
      // Rodzaje ryzyka tylko w Dziale ryzyka — patrz komentarz na górze pliku.
      where: {
        OR: [
          { active: true, kind: kind === "RISK" ? "RISK" : "GENERAL" },
          ...keep(current, "domainId"),
        ],
      },
      orderBy: byName,
    }),
    prisma.contractNature.findMany({ where: { active: true }, orderBy: byName }),
    prisma.trade.findMany({ where: { active: true }, orderBy: byName }),
    prisma.deliveryMethod.findMany({ where: { active: true }, orderBy: byName }),
    prisma.noticePeriod.findMany({ where: { active: true }, orderBy: byName }),
    // Legacy `pri` rośnie od najczęstszej waluty: PLN 1, EUR 2, USD 3, „???" 4.
    // Sortowanie malejąco stawiało „???" na czele listy — stąd kierunek rosnący.
    prisma.currency.findMany({ orderBy: [{ priority: "asc" }, { code: "asc" }] }),
    prisma.user.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { login: "asc" }],
      select: { id: true, firstName: true, lastName: true, login: true },
    }),
  ]);

  /** Nazwy do etykiet, kolejność ustalona po polsku — patrz `polish`. */
  const named = (rows: { id: number; name: string }[]) =>
    rows
      .map((r) => ({ id: String(r.id), name: r.name }))
      .sort((a, b) => polish.compare(a.name, b.name));

  return {
    documentTypes: named(documentTypes),
    // Statusy zostają w kolejności z bazy — jako jedyne nie idą alfabetem.
    statuses: statuses.map((s) => ({ id: String(s.id), name: s.name })),
    companies: named(companies.map((c) => ({ id: c.id, name: c.shortName }))),
    businesslines: named(businesslines),
    locations: named(locations),
    domains: named(domains),
    natures: named(natures),
    trades: named(trades),
    deliveryMethods: named(deliveryMethods),
    noticePeriods: named(noticePeriods),
    // Waluty idą po `pri`: PLN, EUR, USD, „???" — częstość, nie alfabet.
    currencies: currencies.map((c) => ({ id: String(c.id), name: c.code.toUpperCase() })),
    people: people.map((u) => ({ id: String(u.id), name: userLabel(u) })),
  };
}

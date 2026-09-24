/**
 * Słownik lokalizacji z liczbami użycia (docs/features/22) — część bez bazy: scalanie
 * trzech zapytań grupujących, filtr po nazwie, kolejność i polskie liczebniki.
 */

export interface LocationUsageRow {
  id: number;
  name: string;
  active: boolean;
  /** Rekordy (bez usuniętych), których pole „Lokalizacja" wskazuje tę pozycję. */
  primary: number;
  /** Wiersze tabeli powiązań `contract_has_location` — „Lokalizacje dodatkowe" (spec 12). */
  linked: number;
  /** Przypisania `users_locations` — starszy z dwóch mechanizmów dostępu. */
  grants: number;
}

export interface UsageCounts {
  primary: ReadonlyMap<number | null, number>;
  linked: ReadonlyMap<number, number>;
  grants: ReadonlyMap<number, number>;
}

export function toUsageRows(
  locations: readonly { id: number; name: string; active: boolean }[],
  counts: UsageCounts,
): LocationUsageRow[] {
  return locations.map((l) => ({
    id: l.id,
    name: l.name,
    active: l.active,
    primary: counts.primary.get(l.id) ?? 0,
    linked: counts.linked.get(l.id) ?? 0,
    grants: counts.grants.get(l.id) ?? 0,
  }));
}

/** Nieużywana — żaden rekord jej nie wskazuje, ani jako głównej, ani jako dodatkowej. */
export function isUnused(row: Pick<LocationUsageRow, "primary" | "linked">): boolean {
  return row.primary === 0 && row.linked === 0;
}

/**
 * Filtr „Nazwa" — fragment nazwy, bez rozróżniania wielkości liter. Słownik ma 35 pozycji
 * i strona wczytuje go w całości, więc filtr działa w pamięci, z polskimi regułami
 * wielkości liter niezależnie od kolacji bazy.
 */
export function matchesName(name: string, query: string | undefined): boolean {
  const needle = query?.trim().toLocaleLowerCase("pl") ?? "";
  return needle === "" || name.toLocaleLowerCase("pl").includes(needle);
}

export type LocationSort = "records" | "name";

export function sortParam(value: string | undefined): LocationSort {
  return value === "name" ? "name" : "records";
}

const polish = new Intl.Collator("pl");

/**
 * Domyślnie od najczęściej używanej — „(brak danych)", Katowice, Warszawa mówi więcej niż
 * alfabet. Po nazwie: kolacja polska, więc Ł, Ś i Ż stoją po swoich literach, a nie za Z.
 */
export function sortLocations(
  rows: readonly LocationUsageRow[],
  sort: LocationSort,
): LocationUsageRow[] {
  const byName = (a: LocationUsageRow, b: LocationUsageRow) => polish.compare(a.name, b.name);
  return [...rows].sort(sort === "name" ? byName : (a, b) => b.primary - a.primary || byName(a, b));
}

/** „8 161" — tysiące oddzielone twardą spacją, także w liczbach czterocyfrowych. */
export function formatCount(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

const plural = new Intl.PluralRules("pl");

/** „1 rekord", „3 rekordy", „8 161 rekordów" — liczba nie odrywa się od rzeczownika. */
export function recordsLabel(n: number): string {
  const category = plural.select(n);
  const noun = category === "one" ? "rekord" : category === "few" ? "rekordy" : "rekordów";
  return `${formatCount(n)} ${noun}`;
}

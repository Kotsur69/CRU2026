import Link from "next/link";
import { requireAdmin } from "@/lib/authz";
import { yesNo } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { ClickableRow } from "@/components/ui/clickable-row";
import { Cell, DataTable, type DataColumn } from "@/components/ui/data-table";
import { FilterBar, type FilterField } from "@/components/ui/filter-bar";
import { loadLocationUsage } from "@/features/lokalizacje/queries";
import {
  formatCount,
  isUnused,
  matchesName,
  sortLocations,
  sortParam,
} from "@/features/lokalizacje/usage";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

// Legacy „Lokalizacja dostępy" łączy dwie rzeczy: słownik lokalizacji (`contract_location`)
// i przypisania użytkowników (`users_locations`), które zawężają widoczność. Rekord wiąże
// się z lokalizacją dwiema drogami — kolumną `location_id` ORAZ tabelą
// `contract_has_location` — więc obie liczymy osobno (docs/features/12, 22).
// To mapa dostępów, więc tylko dla administratora; 35 pozycji, więc bez paginacji.

const COLUMNS: DataColumn[] = [
  { id: "name", label: "Nazwa" },
  { id: "primary", label: "Rekordy (główna)", align: "right" },
  { id: "linked", label: "Rekordy (dodatkowe)", align: "right" },
  { id: "grants", label: "Użytkownicy z dostępem", align: "right" },
  { id: "active", label: "Aktywna" },
];

const FIELDS: FilterField[] = [
  { name: "name", label: "Nazwa" },
  {
    name: "sort",
    label: "Kolejność",
    blankLabel: "Najwięcej rekordów",
    options: [{ id: "name", name: "Nazwa (A–Ż)" }],
  },
];

export default async function LokalizacjePage({ searchParams }: { searchParams: SP }) {
  await requireAdmin();

  const all = await loadLocationUsage();
  const rows = sortLocations(
    all.filter((l) => matchesName(l.name, searchParams.name)),
    sortParam(searchParams.sort),
  );
  const grants = all.reduce((sum, l) => sum + l.grants, 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">Lokalizacje i dostępy</h1>
        <span className="text-sm text-muted-foreground">
          Lokalizacji: <strong className="text-foreground">{rows.length}</strong>
          {rows.length !== all.length && ` z ${all.length}`} · przypisań użytkowników:{" "}
          <strong className="text-foreground">{formatCount(grants)}</strong>
        </span>
      </div>

      <FilterBar action="/lokalizacje" fields={FIELDS} values={searchParams} />

      <DataTable
        columns={COLUMNS}
        isEmpty={rows.length === 0}
        emptyTitle="Brak lokalizacji spełniających kryteria."
      >
        {rows.map((l) => (
          <ClickableRow key={l.id} href={`/lokalizacje/${l.id}`}>
            <Cell>
              <span className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/lokalizacje/${l.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {l.name}
                </Link>
                {isUnused(l) && <Badge tone="neutral">nieużywana</Badge>}
              </span>
            </Cell>
            <Cell align="right" className="tabular-nums">
              {formatCount(l.primary)}
            </Cell>
            <Cell align="right" className="tabular-nums">
              {formatCount(l.linked)}
            </Cell>
            <Cell align="right" className="tabular-nums">
              {formatCount(l.grants)}
            </Cell>
            <Cell>
              <Badge tone={l.active ? "success" : "neutral"}>{yesNo(l.active)}</Badge>
            </Cell>
          </ClickableRow>
        ))}
      </DataTable>

      <p className="mt-3 max-w-4xl text-xs text-muted-foreground">
        „Rekordy (główna)" — rekordy Umów, Projektów i Działu ryzyka (bez usuniętych), których
        pole „Lokalizacja" wskazuje tę pozycję. „Rekordy (dodatkowe)" — wiersze tabeli powiązań{" "}
        <code>contract_has_location</code>; obie drogi rzadko się pokrywają. „Użytkownicy z
        dostępem" — przypisania <code>users_locations</code>; zakresy z metamodelu dostępów
        pokazuje strona lokalizacji.
      </p>
    </div>
  );
}

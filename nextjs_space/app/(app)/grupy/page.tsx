import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { userLabel, yesNo } from "@/lib/format";
import { ASSIGNEE_SELECT } from "@/lib/contract-access";
import { Badge } from "@/components/ui/badge";
import { ClickableRow } from "@/components/ui/clickable-row";
import { Cell, DataTable, type DataColumn } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filter-bar";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

const COLUMNS: DataColumn[] = [
  { id: "name", label: "Nazwa" },
  { id: "active", label: "Aktywna" },
  { id: "owner", label: "Właściciel" },
  { id: "businessline", label: "Buissnesline" },
  { id: "members", label: "Członkowie", align: "right" },
  { id: "opinionTypes", label: "Rodzaje opinii" },
];

// Legacy `group` — role funkcjonalne (Dział prawny, Właściciele umów, Opiniujący, …).
// Piętnaście wierszy, więc bez stronicowania (docs/features/21). Ekran pokazuje skład
// każdej grupy, dlatego jest tylko dla administratora.
function nameWhere(sp: SP): Prisma.GroupWhereInput[] {
  return sp.name ? [{ name: { contains: sp.name, mode: "insensitive" } }] : [];
}

export default async function GrupyPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin();

  // Dwie grupy są wyłączone (4 i 7), ale zostają — w siódmej wciąż siedzi dziewięć osób.
  const showInactive = searchParams.inactive === "1";
  const where: Prisma.GroupWhereInput = {
    AND: [...(showInactive ? [] : [{ active: true }]), ...nameWhere(searchParams)],
  };

  const [groups, hiddenInactive] = await Promise.all([
    prisma.group.findMany({
      where,
      include: {
        owner: { select: ASSIGNEE_SELECT },
        businessline: true,
        opinionTypes: { orderBy: { id: "asc" } },
        _count: { select: { members: true } },
      },
      orderBy: { id: "asc" },
    }),
    showInactive
      ? 0
      : prisma.group.count({ where: { AND: [{ active: false }, ...nameWhere(searchParams)] } }),
  ]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">Grupy</h1>
        <span className="text-sm text-muted-foreground">
          Znaleziono: <strong className="text-foreground">{groups.length}</strong>
          {hiddenInactive > 0 && <> · nieaktywne ukryte: {hiddenInactive}</>}
        </span>
      </div>

      <FilterBar
        action="/grupy"
        values={searchParams}
        fields={[
          { name: "name", label: "Nazwa" },
          { name: "inactive", label: "pokaż nieaktywne", checkbox: true },
        ]}
      />

      <DataTable
        columns={COLUMNS}
        emptyTitle="Brak grup spełniających kryteria."
        isEmpty={groups.length === 0}
      >
        {groups.map((g) => (
          <ClickableRow key={g.id} href={`/grupy/${g.id}`}>
            <Cell col="name">
              <Link href={`/grupy/${g.id}`} className="font-medium text-primary hover:underline">
                {g.name}
              </Link>
            </Cell>
            <Cell col="active">
              <Badge tone={g.active ? "success" : "neutral"}>{yesNo(g.active)}</Badge>
            </Cell>
            <Cell col="owner">{g.owner ? userLabel(g.owner) : "—"}</Cell>
            <Cell col="businessline">{g.businessline?.name ?? "—"}</Cell>
            <Cell col="members" align="right">
              <span className="tabular-nums">{g._count.members}</span>
            </Cell>
            {/* Jedyna kolumna, która mówi, do czego grupa służy: obieg opinii (spec 16). */}
            <Cell col="opinionTypes">
              {g.opinionTypes.length === 0 ? "—" : g.opinionTypes.map((t) => t.name).join(", ")}
            </Cell>
          </ClickableRow>
        ))}
      </DataTable>
    </div>
  );
}

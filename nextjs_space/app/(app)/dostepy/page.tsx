import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { userLabel } from "@/lib/format";
import { intParam, pageParam, pageSizeParam } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ClickableRow } from "@/components/ui/clickable-row";
import { FilterBar } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

const DEFAULT_PAGE_SIZE = 50;

/**
 * Legacy `users` jest WIDOKIEM na korporacyjny katalog (`am_admin`), którego nie ma
 * w dumpie — import tworzy więc rekordy zastępcze dla każdego id, do którego cokolwiek
 * się odwołuje. Dlatego prawie każdy wiersz jest oznaczony „katalog" i nie ma nazwiska
 * ani loginu poza `legacy-<id>`; uzupełni je dopiero eksport katalogu.
 */
function buildWhere(sp: SP): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [];

  if (sp.name) {
    and.push({
      OR: [
        { login: { contains: sp.name, mode: "insensitive" } },
        { firstName: { contains: sp.name, mode: "insensitive" } },
        { lastName: { contains: sp.name, mode: "insensitive" } },
        { email: { contains: sp.name, mode: "insensitive" } },
      ],
    });
  }

  const group = intParam(sp.group);
  if (group !== undefined) and.push({ groups: { some: { groupId: group } } });

  const location = intParam(sp.location);
  if (location !== undefined) and.push({ locations: { some: { locationId: location } } });

  if (sp.admin === "1") and.push({ isAdmin: true });
  if (sp.activeOnly === "1") and.push({ active: true });
  if (sp.withScopes === "1") and.push({ accessScopes: { some: {} } });
  if (sp.withContracts === "1") and.push({ contractAccess: { some: {} } });

  return and.length > 0 ? { AND: and } : {};
}

export default async function DostepyPage({ searchParams }: { searchParams: SP }) {
  const page = pageParam(searchParams.page);
  const pageSize = pageSizeParam(searchParams.pageSize, DEFAULT_PAGE_SIZE);
  const where = buildWhere(searchParams);

  const [groups, locations, total, users] = await Promise.all([
    prisma.group.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.location.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      include: {
        groups: { include: { group: { select: { id: true, name: true } } } },
        _count: {
          select: { locations: true, accessScopes: true, contractAccess: true, opinions: true },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { login: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <h1 className="font-heading text-2xl font-semibold">Dostępy</h1>
        <span className="text-sm text-muted-foreground">
          Znaleziono: <strong className="text-foreground">{total}</strong>
        </span>
      </div>

      <FilterBar
        action="/dostepy"
        defaultPageSize={DEFAULT_PAGE_SIZE}
        values={searchParams}
        fields={[
          { name: "name", label: "Login / nazwisko / e-mail" },
          {
            name: "group",
            label: "Grupa",
            options: groups.map((g) => ({ id: String(g.id), name: g.name })),
          },
          {
            name: "location",
            label: "Lokalizacja",
            options: locations.map((l) => ({ id: String(l.id), name: l.name })),
          },
          { name: "admin", label: "Tylko administratorzy", checkbox: true },
          { name: "activeOnly", label: "Tylko aktywni", checkbox: true },
          { name: "withScopes", label: "Z zawężeniem dostępu", checkbox: true },
          { name: "withContracts", label: "Przypisani do umów", checkbox: true },
        ]}
      />

      <div className="overflow-x-auto rounded-lg border shadow-sm">
        <table className="w-full text-xs">
          <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 font-semibold">Użytkownik</th>
              <th className="px-2 py-1.5 font-semibold">Stan</th>
              <th className="px-2 py-1.5 font-semibold">Grupy</th>
              <th className="px-2 py-1.5 text-right font-semibold">Lokalizacje</th>
              <th className="px-2 py-1.5 text-right font-semibold">Zawężenia</th>
              <th className="px-2 py-1.5 text-right font-semibold">Umowy</th>
              <th className="px-2 py-1.5 text-right font-semibold">Opinie</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center text-muted-foreground">
                  <p className="font-medium text-foreground">
                    Brak użytkowników spełniających kryteria
                  </p>
                  <p className="mt-1 text-sm">Zmień lub wyczyść filtry wyszukiwania powyżej.</p>
                </td>
              </tr>
            )}
            {users.map((u) => (
              <ClickableRow key={u.id} href={`/dostepy/${u.id}`}>
                <td className="whitespace-normal break-words px-2 py-1.5 align-top">
                  <Link
                    href={`/dostepy/${u.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {userLabel(u)}
                  </Link>
                </td>
                <td className="px-2 py-1.5 align-top">
                  <div className="flex flex-wrap gap-1">
                    {u.isAdmin && <Badge tone="warning">admin</Badge>}
                    {u.isPlaceholder ? (
                      <Badge tone="neutral">katalog</Badge>
                    ) : (
                      <Badge tone={u.active ? "success" : "neutral"}>
                        {u.active ? "aktywny" : "nieaktywny"}
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="whitespace-normal break-words px-2 py-1.5 align-top">
                  {u.groups.length === 0 ? "—" : u.groups.map((m) => m.group.name).join(", ")}
                </td>
                <td className="px-2 py-1.5 text-right align-top tabular-nums">
                  {u._count.locations}
                </td>
                <td className="px-2 py-1.5 text-right align-top tabular-nums">
                  {u._count.accessScopes}
                </td>
                <td className="px-2 py-1.5 text-right align-top tabular-nums">
                  {u._count.contractAccess}
                </td>
                <td className="px-2 py-1.5 text-right align-top tabular-nums">
                  {u._count.opinions}
                </td>
              </ClickableRow>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        basePath="/dostepy"
        searchParams={searchParams}
        page={page}
        pageSize={pageSize}
        total={total}
      />
    </div>
  );
}

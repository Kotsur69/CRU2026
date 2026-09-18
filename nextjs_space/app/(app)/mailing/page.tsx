import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { intParam, pageParam, pageSizeParam } from "@/lib/utils";
import { FilterBar } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

const DEFAULT_PAGE_SIZE = 50;

function buildWhere(sp: SP): Prisma.MailingContactWhereInput {
  const and: Prisma.MailingContactWhereInput[] = [];

  if (sp.name) {
    and.push({
      OR: [
        { firstName: { contains: sp.name, mode: "insensitive" } },
        { lastName: { contains: sp.name, mode: "insensitive" } },
      ],
    });
  }
  if (sp.email) and.push({ email: { contains: sp.email, mode: "insensitive" } });

  const group = intParam(sp.group);
  if (group !== undefined) and.push({ mailingGroupId: group });
  if (sp.ungrouped === "1") and.push({ mailingGroupId: null });

  return and.length > 0 ? { AND: and } : {};
}

export default async function MailingPage({ searchParams }: { searchParams: SP }) {
  const page = pageParam(searchParams.page);
  const pageSize = pageSizeParam(searchParams.pageSize, DEFAULT_PAGE_SIZE);
  const where = buildWhere(searchParams);

  const [groups, total, contacts, ungrouped] = await Promise.all([
    prisma.mailingGroup.findMany({
      include: { _count: { select: { contacts: true } } },
      orderBy: { id: "asc" },
    }),
    prisma.mailingContact.count({ where }),
    prisma.mailingContact.findMany({
      where,
      include: { mailingGroup: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.mailingContact.count({ where: { mailingGroupId: null } }),
  ]);

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <h1 className="font-heading text-2xl font-semibold">Mailing</h1>
        <span className="text-sm text-muted-foreground">
          Znaleziono: <strong className="text-foreground">{total}</strong>
        </span>
      </div>

      {/* Dump niesie 54 odwołania do nieistniejących grup mailingowych — import wyzerował
          je zamiast przerywać ładowanie, więc kontakty bez grupy to stan faktyczny danych. */}
      {ungrouped > 0 && (
        <p className="mb-4 rounded-md border border-amber-600/25 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {ungrouped} kontaktów nie ma przypisanej grupy — w <code>cru.sql</code> wskazywały
          na grupy, których w dumpie nie ma.
        </p>
      )}

      <FilterBar
        action="/mailing"
        defaultPageSize={DEFAULT_PAGE_SIZE}
        values={searchParams}
        fields={[
          { name: "name", label: "Imię / nazwisko" },
          { name: "email", label: "E-mail" },
          {
            name: "group",
            label: "Grupa mailingowa",
            options: groups.map((g) => ({
              id: String(g.id),
              name: `${g.name} (${g._count.contacts})`,
            })),
          },
          { name: "ungrouped", label: "Tylko bez grupy", checkbox: true },
        ]}
      />

      <div className="overflow-x-auto rounded-lg border shadow-sm">
        <table className="w-full text-xs">
          <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 font-semibold">Nazwisko</th>
              <th className="px-2 py-1.5 font-semibold">Imię</th>
              <th className="px-2 py-1.5 font-semibold">E-mail</th>
              <th className="px-2 py-1.5 font-semibold">Grupa</th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-12 text-center text-muted-foreground">
                  <p className="font-medium text-foreground">
                    Brak kontaktów spełniających kryteria
                  </p>
                  <p className="mt-1 text-sm">Zmień lub wyczyść filtry wyszukiwania powyżej.</p>
                </td>
              </tr>
            )}
            {contacts.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-2 py-1.5 align-top font-medium">{c.lastName ?? "—"}</td>
                <td className="px-2 py-1.5 align-top">{c.firstName ?? "—"}</td>
                <td className="whitespace-normal break-words px-2 py-1.5 align-top">
                  {c.email ? (
                    <a href={`mailto:${c.email}`} className="text-primary hover:underline">
                      {c.email}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-2 py-1.5 align-top">{c.mailingGroup?.name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        basePath="/mailing"
        searchParams={searchParams}
        page={page}
        pageSize={pageSize}
        total={total}
      />
    </div>
  );
}

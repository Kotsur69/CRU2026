import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { contractorLabel, formatDate, formatDateTime, formatMoney, userLabel } from "@/lib/format";
import { currentActor } from "@/lib/authz";
import { dateParam, intParam, pageParam, pageSizeParam } from "@/lib/utils";
import { FilterBar } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";
import {
  HISTORY_COLUMN_LABEL,
  HISTORY_DICTIONARY_COLUMN,
  LEGACY_HISTORY_VALUE_LIMIT,
  renderHistoryValue,
  type HistoryLookups,
  type HistoryValue,
} from "@/lib/contracts/history";

/**
 * „Historia zmian" rekordu (docs/features/13) — odczyt `contracthistory`, 237 405 wierszy,
 * których dotąd nic nie czytało.
 *
 * Ekranu historii w legacy nikt nie widział, więc układ jest nasz: jedna pozycja na
 * zapis, a nie na wiersz tabeli. Zapis zostawia po jednym wierszu na zmienione pole
 * z tym samym znacznikiem czasu, więc grupujemy po (autor, sekunda).
 */

const DEFAULT_PAGE_SIZE = 50;
/** Dłuższe wartości zwijamy do jednej linii z rozwinięciem. */
const LONG_VALUE = 120;
const DAY_MS = 86_400_000;

type SP = Record<string, string | undefined>;

interface Group {
  userId: number | null;
  at: Date;
  n: number;
}

function groupKey(userId: number | null, at: Date): string {
  return `${userId ?? "-"}|${Math.floor(at.getTime() / 1000)}`;
}

/** Pełne słowniki, z pozycjami wygaszonymi — wpis sprzed lat może wskazywać „Kontrakt". */
async function loadLookups(contractorIds: number[], userIds: number[]): Promise<HistoryLookups> {
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
    contractors,
    users,
  ] = await Promise.all([
    prisma.documentType.findMany({ select: { id: true, name: true } }),
    prisma.contractStatus.findMany({ select: { id: true, name: true } }),
    prisma.company.findMany({ select: { id: true, shortName: true } }),
    prisma.businessline.findMany({ select: { id: true, name: true } }),
    prisma.location.findMany({ select: { id: true, name: true } }),
    prisma.domain.findMany({ select: { id: true, name: true } }),
    prisma.contractNature.findMany({ select: { id: true, name: true } }),
    prisma.trade.findMany({ select: { id: true, name: true } }),
    prisma.deliveryMethod.findMany({ select: { id: true, name: true } }),
    prisma.noticePeriod.findMany({ select: { id: true, name: true } }),
    prisma.currency.findMany({ select: { id: true, code: true } }),
    prisma.contractor.findMany({
      where: { id: { in: contractorIds } },
      select: { id: true, shortName: true, fullName: true },
    }),
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true, login: true },
    }),
  ]);

  const map = <T extends { id: number }>(rows: T[], name: (row: T) => string) =>
    new Map(rows.map((row) => [row.id, name(row)]));

  return {
    documentTypes: map(documentTypes, (r) => r.name),
    statuses: map(statuses, (r) => r.name),
    companies: map(companies, (r) => r.shortName),
    businesslines: map(businesslines, (r) => r.name),
    locations: map(locations, (r) => r.name),
    domains: map(domains, (r) => r.name),
    natures: map(natures, (r) => r.name),
    trades: map(trades, (r) => r.name),
    deliveryMethods: map(deliveryMethods, (r) => r.name),
    noticePeriods: map(noticePeriods, (r) => r.name),
    currencies: map(currencies, (r) => r.code.toUpperCase()),
    contractors: map(contractors, contractorLabel),
    users: map(users, userLabel),
  };
}

function Value({ value }: { value: HistoryValue }) {
  if (value.text === null) return <span className="text-muted-foreground">—</span>;
  const marker = value.truncated ? (
    <span
      className="text-muted-foreground"
      title={`Legacy zapisywało w historii tylko pierwsze ${LEGACY_HISTORY_VALUE_LIMIT} znaków — wartość może być ucięta i nie nadaje się do odtworzenia.`}
    >
      …
    </span>
  ) : null;
  if (value.text.length <= LONG_VALUE) {
    return (
      <span className="whitespace-pre-line break-words">
        {value.text}
        {marker}
      </span>
    );
  }
  return (
    <details>
      <summary className="cursor-pointer break-words">{value.text.slice(0, LONG_VALUE)}…</summary>
      <span className="whitespace-pre-line break-words">
        {value.text}
        {marker}
      </span>
    </details>
  );
}

export interface HistoryPageProps {
  id: number;
  basePath: string;
  searchParams: SP;
}

export async function HistoryPage({ id, basePath, searchParams }: HistoryPageProps) {
  const actor = await currentActor();
  if (!actor) redirect("/login");

  const contract = await prisma.contract.findUnique({
    where: { id },
    select: { id: true, identifier: true, description: true, isDeleted: true },
  });
  if (!contract || contract.isDeleted) notFound();

  const recordHref = `${basePath}/${id}`;
  const historyHref = `${recordHref}/historia`;
  const page = pageParam(searchParams.page);
  const pageSize = pageSizeParam(searchParams.pageSize, DEFAULT_PAGE_SIZE);

  // Filtry: pole, autor, zakres dat (koniec włącznie).
  const column = searchParams.field && searchParams.field in HISTORY_COLUMN_LABEL ? searchParams.field : undefined;
  const author = intParam(searchParams.user);
  const from = dateParam(searchParams.from);
  const toDay = dateParam(searchParams.to);
  const to = toDay ? new Date(toDay.getTime() + DAY_MS) : undefined;

  const conditions: Prisma.Sql[] = [Prisma.sql`"contractId" = ${id}`];
  if (column) conditions.push(Prisma.sql`"columnName" = ${column}`);
  if (author !== undefined) conditions.push(Prisma.sql`"userId" = ${author}`);
  if (from) conditions.push(Prisma.sql`"createdAt" >= ${from}`);
  if (to) conditions.push(Prisma.sql`"createdAt" < ${to}`);
  const where = Prisma.join(conditions, " AND ");

  const [groups, [{ total }], columnsPresent, authorsPresent] = await Promise.all([
    prisma.$queryRaw<Group[]>`
      SELECT "userId", date_trunc('second', "createdAt") AS at, count(*)::int AS n
      FROM "ContractHistory" WHERE ${where}
      GROUP BY 1, 2 ORDER BY 2 DESC, 1
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    prisma.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total FROM (
        SELECT 1 FROM "ContractHistory" WHERE ${where}
        GROUP BY "userId", date_trunc('second', "createdAt")
      ) AS g`,
    prisma.contractHistory.findMany({
      where: { contractId: id },
      distinct: ["columnName"],
      select: { columnName: true },
    }),
    prisma.contractHistory.findMany({
      where: { contractId: id, userId: { not: null } },
      distinct: ["userId"],
      select: { user: { select: { id: true, firstName: true, lastName: true, login: true } } },
    }),
  ]);

  // Wiersze strony: zakres czasu grup + te same filtry, potem przydział do grup w pamięci.
  const pageKeys = new Set(groups.map((g) => groupKey(g.userId, g.at)));
  const rows =
    groups.length === 0
      ? []
      : await prisma.contractHistory.findMany({
          where: {
            contractId: id,
            createdAt: {
              gte: groups[groups.length - 1]!.at,
              lt: new Date(groups[0]!.at.getTime() + 1000),
            },
            ...(column ? { columnName: column } : {}),
            ...(author !== undefined ? { userId: author } : {}),
          },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        });

  const byGroup = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = groupKey(row.userId, row.createdAt);
    if (!pageKeys.has(key)) continue;
    byGroup.set(key, [...(byGroup.get(key) ?? []), row]);
  }

  const idsIn = (columns: readonly string[]) => {
    const ids = new Set<number>();
    for (const row of rows) {
      if (!row.columnName || !columns.includes(row.columnName)) continue;
      for (const v of [row.oldValue, row.newValue]) if (v && /^\d+$/.test(v.trim())) ids.add(Number(v));
    }
    return [...ids];
  };
  const contractorColumns = Object.entries(HISTORY_DICTIONARY_COLUMN)
    .filter(([, lookup]) => lookup === "contractors")
    .map(([col]) => col);
  const lookups = await loadLookups(idsIn(contractorColumns), [
    ...idsIn(["giveopinions"]),
    ...groups.map((g) => g.userId).filter((u): u is number => u !== null),
  ]);
  const format = { date: formatDate, money: (v: string) => formatMoney(v) };

  const authorName = (userId: number | null) =>
    userId === null ? "—" : (lookups.users.get(userId) ?? `#${userId}`);

  const fieldOptions = columnsPresent
    .map((c) => c.columnName)
    .filter((c): c is string => c !== null)
    .map((c) => ({ id: c, name: HISTORY_COLUMN_LABEL[c] ?? c }))
    .sort((a, b) => a.name.localeCompare(b.name, "pl"));
  const authorOptions = authorsPresent
    .map((a) => a.user)
    .filter((u): u is NonNullable<typeof u> => u !== null)
    .map((u) => ({ id: String(u.id), name: userLabel(u) }))
    .sort((a, b) => a.name.localeCompare(b.name, "pl"));
  const filtered = Boolean(column || author !== undefined || from || to);

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <Link href={recordHref} className="text-sm text-muted-foreground hover:text-foreground">
          ← Wróć do rekordu
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-semibold">Historia zmian</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {contract.identifier ?? `#${contract.id}`}
          {contract.description ? ` · ${contract.description}` : ""}
        </p>
      </div>

      <FilterBar
        action={historyHref}
        values={searchParams}
        defaultPageSize={DEFAULT_PAGE_SIZE}
        fields={[
          { name: "field", label: "Pole", options: fieldOptions },
          { name: "user", label: "Autor zmiany", options: authorOptions },
          { name: "from", label: "Od dnia", date: true },
          { name: "to", label: "Do dnia", date: true },
        ]}
      />

      {groups.length === 0 ? (
        <p className="rounded-lg border bg-card p-5 text-sm text-muted-foreground shadow-sm">
          {filtered ? "Brak zmian spełniających kryteria." : "Brak zapisanej historii zmian."}
        </p>
      ) : (
        <ol className="space-y-3">
          {groups.map((g) => {
            const key = groupKey(g.userId, g.at);
            return (
              <li key={key} className="rounded-lg border bg-card p-4 shadow-sm">
                <div className="mb-2 text-sm">
                  <span className="tabular-nums">{formatDateTime(g.at)}</span>
                  <span className="text-muted-foreground"> · </span>
                  <span className="font-medium">{authorName(g.userId)}</span>
                </div>
                <dl className="divide-y divide-border/60 text-sm">
                  {(byGroup.get(key) ?? []).map((row) => {
                    const col = row.columnName ?? "";
                    return (
                      <div key={row.id} className="grid grid-cols-3 gap-3 py-1.5">
                        <dt className="text-muted-foreground">{HISTORY_COLUMN_LABEL[col] ?? col}</dt>
                        <dd className="col-span-2 flex flex-wrap items-baseline gap-2">
                          <Value value={renderHistoryValue(col, row.oldValue, lookups, format)} />
                          <span aria-label="zmieniono na" className="text-muted-foreground">
                            →
                          </span>
                          <Value value={renderHistoryValue(col, row.newValue, lookups, format)} />
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </li>
            );
          })}
        </ol>
      )}

      <Pagination
        basePath={historyHref}
        searchParams={searchParams}
        page={page}
        pageSize={pageSize}
        total={total}
      />
    </div>
  );
}

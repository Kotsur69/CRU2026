import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buttonClass } from "@/components/ui/button";
import { FilterBar, type FilterField } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";
import { Fact } from "@/components/ui/section";
import { contractorLabel, formatMoney, userLabel } from "@/lib/format";
import { amountParam, intParam, pageParam, pageSizeParam } from "@/lib/utils";
import { ASSIGNEE_SELECT, loadOwnerOptions } from "@/lib/contract-access";
import { registerWhere } from "@/lib/contracts/scope";
import { riskSummary } from "@/lib/contracts/risk";
import { RiskTable, type RiskRow } from "@/components/ryzyko/risk-table";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

/** 406 rekordów — przy 50 na stronę cały rejestr to dziewięć stron (docs/features/08). */
const DEFAULT_PAGE_SIZE = 50;

// Dział ryzyka nie ma własnej tabeli: to wiersze `contract` z modułem RISK.
function buildWhere(sp: SP): Prisma.ContractWhereInput {
  const and: Prisma.ContractWhereInput[] = registerWhere("RISK");

  if (sp.identifier) and.push({ identifier: { contains: sp.identifier, mode: "insensitive" } });

  const status = intParam(sp.status);
  if (status !== undefined) and.push({ statusId: status });

  const company = intParam(sp.company);
  if (company !== undefined) and.push({ companyId: company });

  const domain = intParam(sp.domain);
  if (domain !== undefined) and.push({ domainId: domain });

  const documentType = intParam(sp.type);
  if (documentType !== undefined) and.push({ documentTypeId: documentType });

  const location = intParam(sp.location);
  if (location !== undefined) {
    and.push({
      OR: [{ primaryLocationId: location }, { locations: { some: { locationId: location } } }],
    });
  }

  const contractor = intParam(sp.contractor);
  if (contractor !== undefined) and.push({ contractorId: contractor });

  const debtor = intParam(sp.debtor);
  if (debtor !== undefined) and.push({ debtorId: debtor });

  const owner = intParam(sp.owner);
  if (owner !== undefined) and.push({ userAccess: { some: { userId: owner } } });

  // NIP może należeć do którejkolwiek strony — na 214 rekordach dłużnik to ktoś inny
  // niż kontrahent, a szukanie tylko po kontrahencie by je gubiło.
  if (sp.nip) {
    and.push({
      OR: [
        { contractor: { vatId: { contains: sp.nip } } },
        { debtor: { vatId: { contains: sp.nip } } },
      ],
    });
  }

  const amountFrom = amountParam(sp.amountFrom);
  if (amountFrom !== undefined) and.push({ salary: { gte: amountFrom } });
  const amountTo = amountParam(sp.amountTo);
  if (amountTo !== undefined) and.push({ salary: { lte: amountTo } });

  return { AND: and };
}

/** Kwota jest tu sednem ekranu, więc — jedynie w tym rejestrze — można po niej sortować (Q44). */
function orderBy(sp: SP): Prisma.ContractOrderByWithRelationInput[] {
  if (sp.sort === "amount") return [{ salary: { sort: "desc", nulls: "last" } }, { id: "desc" }];
  return [{ registeredAt: "desc" }, { id: "desc" }];
}

async function loadDictionaries(contractorId: number | undefined, debtorId: number | undefined) {
  const party = (id: number | undefined) =>
    id === undefined
      ? null
      : prisma.contractor.findUnique({
          where: { id },
          select: { id: true, shortName: true, fullName: true },
        });

  const [statuses, companies, domains, documentTypes, locations, contractor, debtor, owners] =
    await Promise.all([
      prisma.contractStatus.findMany({
        where: { active: true, kind: "RISK" },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.company.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { shortName: "asc" }],
      }),
      prisma.domain.findMany({
        where: { active: true, kind: "RISK" },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.documentType.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.location.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      party(contractorId),
      party(debtorId),
      loadOwnerOptions(),
    ]);

  const opts = <T extends { id: number }>(rows: T[], name: (row: T) => string) =>
    rows.map((row) => ({ id: String(row.id), name: name(row) }));
  const selected = (row: { id: number; shortName: string | null; fullName: string | null } | null) =>
    row ? { id: String(row.id), name: contractorLabel(row) } : null;

  return {
    statuses: opts(statuses, (s) => s.name),
    companies: opts(companies, (c) => c.shortName),
    domains: opts(domains, (d) => d.name),
    documentTypes: opts(documentTypes, (d) => d.name),
    locations: opts(locations, (l) => l.name),
    contractor: selected(contractor),
    debtor: selected(debtor),
    owners,
  };
}

type Dicts = Awaited<ReturnType<typeof loadDictionaries>>;

/** Filtry są nasze — legacy tego ekranu nikt nie widział (docs/features/08, Q42). */
function filterFields(d: Dicts): FilterField[] {
  return [
    { name: "identifier", label: "Identyfikator" },
    { name: "status", label: "Status", options: d.statuses },
    { name: "company", label: "Spółka", options: d.companies },
    { name: "domain", label: "Rodzaj", options: d.domains },
    { name: "owner", label: "Właściciel", options: d.owners },
    { name: "debtor", label: "Dłużnik", contractor: { selected: d.debtor } },
    { name: "contractor", label: "Kontrahent", contractor: { selected: d.contractor } },
    { name: "nip", label: "NIP", hint: "Kontrahenta albo dłużnika" },
    { name: "location", label: "Lokalizacja", options: d.locations },
    { name: "type", label: "Typ dokumentu", options: d.documentTypes },
    { name: "amountFrom", label: "Kwota od", number: true },
    { name: "amountTo", label: "Kwota do", number: true },
    {
      name: "sort",
      label: "Kolejność",
      blankLabel: "Najnowsze najpierw",
      options: [{ id: "amount", name: "Kwota malejąco" }],
    },
  ];
}

export default async function RyzykoPage({ searchParams }: { searchParams: SP }) {
  const page = pageParam(searchParams.page);
  const pageSize = pageSizeParam(searchParams.pageSize, DEFAULT_PAGE_SIZE);
  const where = buildWhere(searchParams);

  const [dicts, summary, records] = await Promise.all([
    loadDictionaries(intParam(searchParams.contractor), intParam(searchParams.debtor)),
    riskSummary(where),
    prisma.contract.findMany({
      where,
      include: {
        status: true,
        company: true,
        domain: true,
        contractor: true,
        debtor: true,
        currency: true,
        userAccess: {
          orderBy: { readOnly: "asc" },
          include: { user: { select: ASSIGNEE_SELECT } },
        },
      },
      orderBy: orderBy(searchParams),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const rows: RiskRow[] = records.map((c) => ({
    id: c.id,
    identifier: c.identifier ?? `#${c.id}`,
    statusName: c.status?.name ?? null,
    company: c.company?.shortName ?? null,
    debtor: c.debtor ? contractorLabel(c.debtor) : null,
    debtorIsContractor: c.debtorId !== null && c.debtorId === c.contractorId,
    contractor: c.contractor ? contractorLabel(c.contractor) : null,
    domain: c.domain?.name ?? null,
    amount: c.salary ? c.salary.toString() : null,
    currencyCode: c.currency?.code?.toUpperCase() ?? null,
    dateBegin: c.dateBegin ? c.dateBegin.toISOString() : null,
    dateEnd: c.dateEnd ? c.dateEnd.toISOString() : null,
    owners: c.userAccess.map((a) => userLabel(a.user)),
  }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">Dział ryzyka</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            Znaleziono: <strong className="text-foreground">{summary.records}</strong>
          </span>
          <Link href="/ryzyko/nowy" className={buttonClass("primary")}>
            Dodaj nowy wpis
          </Link>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Fact label="Rekordów">
          <span className="tabular-nums">{summary.records}</span>
        </Fact>
        <Fact label="Łączna kwota" emphasize>
          <span className="tabular-nums">
            {summary.totals.length === 0
              ? "—"
              : summary.totals.map((t) => formatMoney(t.amount, t.currency)).join(" + ")}
          </span>
        </Fact>
        <Fact label="Aktywne">
          <span className="tabular-nums">{summary.active}</span>
        </Fact>
        <Fact label="W sądzie">
          <span className={summary.inCourt > 0 ? "tabular-nums text-red-700" : "tabular-nums"}>
            {summary.inCourt}
          </span>
        </Fact>
      </div>

      <FilterBar
        action="/ryzyko"
        fields={filterFields(dicts)}
        values={searchParams}
        defaultPageSize={DEFAULT_PAGE_SIZE}
      />

      <RiskTable records={rows} />

      <Pagination
        basePath="/ryzyko"
        searchParams={searchParams}
        page={page}
        pageSize={pageSize}
        total={summary.records}
      />
    </div>
  );
}

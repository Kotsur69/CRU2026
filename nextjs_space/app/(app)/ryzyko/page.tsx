import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buttonClass } from "@/components/ui/button";
import { contractorLabel, userLabel } from "@/lib/format";
import { intParam, pageParam, pageSizeParam } from "@/lib/utils";
import { ASSIGNEE_SELECT, loadOwnerOptions } from "@/lib/contract-access";
import { SearchForm } from "@/features/ryzyko/search-form";
import { RiskTable, type RiskRow } from "@/components/ryzyko/risk-table";
import { Pagination } from "@/components/ui/pagination";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

const DEFAULT_PAGE_SIZE = 25;

// Dział ryzyka nie ma własnej tabeli: to wiersze `contract`, których status niesie
// dyskryminator `project = 2` (audyt sekcja 2 + `contract_status.kind`).
function buildWhere(sp: SP): Prisma.ContractWhereInput {
  const and: Prisma.ContractWhereInput[] = [
    { isDeleted: false },
    { status: { kind: "RISK" } },
  ];

  if (sp.identifier) and.push({ identifier: { contains: sp.identifier, mode: "insensitive" } });
  if (sp.subject) and.push({ description: { contains: sp.subject, mode: "insensitive" } });

  const status = intParam(sp.status);
  if (status !== undefined) and.push({ statusId: status });

  const company = intParam(sp.company);
  if (company !== undefined) and.push({ companyId: company });

  const domain = intParam(sp.domain);
  if (domain !== undefined) and.push({ domainId: domain });

  const contractor = intParam(sp.contractor);
  if (contractor !== undefined) and.push({ contractorId: contractor });

  const debtor = intParam(sp.debtor);
  if (debtor !== undefined) and.push({ debtorId: debtor });

  const owner = intParam(sp.owner);
  if (owner !== undefined) and.push({ userAccess: { some: { userId: owner } } });

  // NIP may sit on either side of the risk record, so both are matched.
  if (sp.nip) {
    and.push({
      OR: [
        { contractor: { vatId: { contains: sp.nip } } },
        { debtor: { vatId: { contains: sp.nip } } },
      ],
    });
  }

  return { AND: and };
}

/**
 * Dictionaries for the filter form. Contractor and debtor lists are narrowed to the
 * counterparties that actually appear on risk records — the full contractor dictionary
 * would be unusable here and would not match the register.
 */
async function loadDictionaries() {
  const [statuses, companies, domains, contractors, debtors, owners] = await Promise.all([
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
    prisma.contractor.findMany({
      where: { contracts: { some: { status: { kind: "RISK" } } } },
      orderBy: [{ shortName: "asc" }, { fullName: "asc" }],
      select: { id: true, shortName: true, fullName: true },
    }),
    prisma.contractor.findMany({
      where: { debtorFor: { some: { status: { kind: "RISK" } } } },
      orderBy: [{ shortName: "asc" }, { fullName: "asc" }],
      select: { id: true, shortName: true, fullName: true },
    }),
    loadOwnerOptions(),
  ]);

  return {
    statuses: statuses.map((s) => ({ id: String(s.id), name: s.name })),
    companies: companies.map((c) => ({ id: String(c.id), name: c.shortName })),
    domains: domains.map((d) => ({ id: String(d.id), name: d.name })),
    contractors: contractors.map((k) => ({ id: String(k.id), name: contractorLabel(k) })),
    debtors: debtors.map((k) => ({ id: String(k.id), name: contractorLabel(k) })),
    owners,
  };
}

export default async function RyzykoPage({ searchParams }: { searchParams: SP }) {
  const page = pageParam(searchParams.page);
  const pageSize = pageSizeParam(searchParams.pageSize, DEFAULT_PAGE_SIZE);
  const where = buildWhere(searchParams);

  const [dicts, total, records] = await Promise.all([
    loadDictionaries(),
    prisma.contract.count({ where }),
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
      orderBy: [{ registeredAt: "desc" }, { id: "desc" }],
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
    contractor: c.contractor ? contractorLabel(c.contractor) : null,
    domain: c.domain?.name ?? null,
    subject: c.description,
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
            Znaleziono: <strong className="text-foreground">{total}</strong>
          </span>
          <Link href="/ryzyko/nowy" className={buttonClass("primary")}>
            Dodaj nowy wpis
          </Link>
        </div>
      </div>

      <SearchForm dicts={dicts} />

      <RiskTable records={rows} />

      <Pagination
        basePath="/ryzyko"
        searchParams={searchParams}
        page={page}
        pageSize={pageSize}
        total={total}
      />
    </div>
  );
}

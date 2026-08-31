import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { contractorLabel, userLabel } from "@/lib/format";
import { SearchForm } from "@/features/umowy/search-form";
import { ContractsTable, type ContractRow } from "@/components/umowy/contracts-table";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

const MAX_PAGE_SIZE = 500;
const MIN_PAGE_SIZE = 10;
const DEFAULT_PAGE_SIZE = 25;

/** Query-string values are untrusted: only a clean positive integer is accepted. */
function intParam(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function dateParam(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function buildWhere(sp: SP): Prisma.ContractWhereInput {
  const and: Prisma.ContractWhereInput[] = [
    // Legacy soft delete — deleted rows never appear in the register.
    { isDeleted: false },
    // Projects and risk records live in their own modules, keyed off the status kind.
    { OR: [{ status: { kind: "CONTRACT" } }, { statusId: null }] },
  ];

  if (sp.identifier) and.push({ identifier: { contains: sp.identifier, mode: "insensitive" } });
  if (sp.contractNumber) {
    and.push({ contractReference: { contains: sp.contractNumber, mode: "insensitive" } });
  }
  if (sp.subject) and.push({ description: { contains: sp.subject, mode: "insensitive" } });

  const documentType = intParam(sp.type);
  if (documentType !== undefined) and.push({ documentTypeId: documentType });

  const status = intParam(sp.status);
  if (status !== undefined) and.push({ statusId: status });

  const company = intParam(sp.company);
  if (company !== undefined) and.push({ companyId: company });

  // A contract carries one primary location plus any number of linked ones; the legacy
  // register matches either.
  const location = intParam(sp.location);
  if (location !== undefined) {
    and.push({
      OR: [{ primaryLocationId: location }, { locations: { some: { locationId: location } } }],
    });
  }

  const domain = intParam(sp.domain);
  if (domain !== undefined) and.push({ domainId: domain });

  const nature = intParam(sp.nature);
  if (nature !== undefined) and.push({ natureId: nature });

  const businessline = intParam(sp.businessline);
  if (businessline !== undefined) and.push({ businesslineId: businessline });

  const contractor = intParam(sp.contractor);
  if (contractor !== undefined) and.push({ contractorId: contractor });

  // The contract owner is a full-access row in contract_users, not a read-only grant.
  const owner = intParam(sp.owner);
  if (owner !== undefined) and.push({ userAccess: { some: { userId: owner, readOnly: false } } });

  if (sp.nip) and.push({ contractor: { vatId: { contains: sp.nip } } });
  if (sp.obsc === "1") and.push({ obsc: true });
  if (sp.companyConnected === "1") and.push({ companiesConnected: true });

  const dateEnd = dateParam(sp.dateEnd);
  if (dateEnd) and.push({ dateEnd: { lte: dateEnd } });

  return { AND: and };
}

/** Dictionary options for the filter form. Ids are stringified for the select values. */
async function loadDictionaries() {
  const [
    documentTypes,
    statuses,
    companies,
    locations,
    domains,
    natures,
    businesslines,
    contractors,
    owners,
  ] = await Promise.all([
    prisma.documentType.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.contractStatus.findMany({
      where: { active: true, kind: "CONTRACT" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.company.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { shortName: "asc" }],
    }),
    prisma.location.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.domain.findMany({
      where: { active: true, kind: "GENERAL" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.contractNature.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.businessline.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.contractor.findMany({
      where: { isDeleted: false },
      orderBy: [{ shortName: "asc" }, { fullName: "asc" }],
      select: { id: true, shortName: true, fullName: true },
    }),
    prisma.user.findMany({
      where: { active: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { login: "asc" }],
      select: { id: true, firstName: true, lastName: true, login: true },
    }),
  ]);

  return {
    documentTypes: documentTypes.map((d) => ({ id: String(d.id), name: d.name })),
    statuses: statuses.map((s) => ({ id: String(s.id), name: s.name })),
    companies: companies.map((c) => ({ id: String(c.id), name: c.shortName })),
    locations: locations.map((l) => ({ id: String(l.id), name: l.name })),
    domains: domains.map((d) => ({ id: String(d.id), name: d.name })),
    natures: natures.map((n) => ({ id: String(n.id), name: n.name })),
    businesslines: businesslines.map((b) => ({ id: String(b.id), name: b.name })),
    contractors: contractors.map((k) => ({ id: String(k.id), name: contractorLabel(k) })),
    owners: owners.map((u) => ({ id: String(u.id), name: userLabel(u) })),
  };
}

export default async function UmowyPage({ searchParams }: { searchParams: SP }) {
  const page = Math.max(1, intParam(searchParams.page) ?? 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(MIN_PAGE_SIZE, intParam(searchParams.pageSize) ?? DEFAULT_PAGE_SIZE),
  );
  const where = buildWhere(searchParams);

  const [dicts, total, contracts] = await Promise.all([
    loadDictionaries(),
    prisma.contract.count({ where }),
    prisma.contract.findMany({
      where,
      include: {
        documentType: true,
        status: true,
        company: true,
        primaryLocation: true,
        currency: true,
        businessline: true,
        domain: true,
        nature: true,
        noticePeriod: true,
        contractor: true,
        userAccess: {
          where: { readOnly: false },
          include: {
            user: { select: { id: true, firstName: true, lastName: true, login: true } },
          },
        },
        _count: { select: { attachments: true, annexes: true } },
      },
      orderBy: [{ registeredAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const rows: ContractRow[] = contracts.map((c) => ({
    id: c.id,
    identifier: c.identifier ?? "—",
    documentType: c.documentType?.name ?? null,
    contractNumber: c.contractReference,
    statusName: c.status?.name ?? null,
    company: c.company?.shortName ?? null,
    location: c.primaryLocation?.name ?? null,
    companyConnected: c.companiesConnected,
    nature: c.nature?.name ?? null,
    subject: c.description,
    dateStart: c.dateBegin ? c.dateBegin.toISOString() : null,
    dateEnd: c.dateEnd ? c.dateEnd.toISOString() : null,
    noticePeriod: c.noticePeriod?.name ?? null,
    amount: c.salary ? c.salary.toString() : null,
    currencyCode: c.currency?.code?.toUpperCase() ?? null,
    obsc: c.obsc,
    owners: c.userAccess.map((a) => userLabel(a.user)),
    businessline: c.businessline?.name ?? null,
    contractors: c.contractor ? [contractorLabel(c.contractor)] : [],
    otherAmountDesc: c.specificSalaryTerms,
    domain: c.domain?.name ?? null,
    formularz: c.tempForm ?? false,
    remarks: c.remarks,
    hasParent: c.parentId !== null,
    annexCount: c._count.annexes,
    attachmentsCount: c._count.attachments,
  }));

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const mkPageHref = (p: number) => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (typeof value === "string" && value !== "") q.set(key, value);
    }
    q.set("page", String(p));
    return `/umowy?${q.toString()}`;
  };

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <h1 className="font-heading text-2xl font-semibold">Umowy</h1>
        <span className="text-sm text-muted-foreground">
          Znaleziono: <strong className="text-foreground">{total}</strong>
        </span>
      </div>

      <SearchForm dicts={dicts} />

      <ContractsTable contracts={rows} />

      <div className="mt-4 flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {total > 0 ? (
            <>
              Pokazano{" "}
              <strong className="text-foreground">
                {from}–{to}
              </strong>{" "}
              z <strong className="text-foreground">{total}</strong>
            </>
          ) : (
            "Brak wyników"
          )}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            {page > 1 && (
              <Link
                href={mkPageHref(page - 1)}
                className="rounded-md border px-3 py-1 transition hover:bg-muted"
              >
                ← Poprzednia
              </Link>
            )}
            <span className="px-1">
              Strona {page} z {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={mkPageHref(page + 1)}
                className="rounded-md border px-3 py-1 transition hover:bg-muted"
              >
                Następna →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

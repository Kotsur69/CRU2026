import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SearchForm } from "@/features/umowy/search-form";
import { ContractsTable, type ContractRow } from "@/components/umowy/contracts-table";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

function buildWhere(sp: SP): Prisma.ContractWhereInput {
  const and: Prisma.ContractWhereInput[] = [];
  if (sp.identifier) and.push({ identifier: { contains: sp.identifier, mode: "insensitive" } });
  if (sp.contractNumber) {
    and.push({ contractNumber: { contains: sp.contractNumber, mode: "insensitive" } });
  }
  if (sp.type) and.push({ documentTypeId: sp.type });
  if (sp.status) and.push({ statusId: sp.status });
  if (sp.company) and.push({ companyId: sp.company });
  if (sp.location) and.push({ locationId: sp.location });
  if (sp.domain) and.push({ domainId: sp.domain });
  if (sp.nature) and.push({ natureId: sp.nature });
  if (sp.businessline) and.push({ businesslineId: sp.businessline });
  if (sp.contractor) and.push({ contractors: { some: { id: sp.contractor } } });
  if (sp.owner) and.push({ ownerIds: { some: { id: sp.owner } } });
  if (sp.nip) and.push({ contractors: { some: { nip: { contains: sp.nip } } } });
  if (sp.obsc === "1") and.push({ obsc: true });
  if (sp.companyConnected === "1") and.push({ companyConnected: true });
  if (sp.dateEnd) and.push({ dateEnd: { lte: new Date(sp.dateEnd) } });
  return and.length ? { AND: and } : {};
}

export default async function UmowyPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const page = Math.max(1, Number(searchParams.page) || 1);
  const pageSize = Math.min(500, Math.max(10, Number(searchParams.pageSize) || 25));
  const where = buildWhere(searchParams);

  const [dicts, total, contracts] = await Promise.all([
    (async () => ({
      documentTypes: await prisma.documentType.findMany({ orderBy: { sortOrder: "asc" } }),
      statuses: await prisma.contractStatus.findMany({ orderBy: { sortOrder: "asc" } }),
      companies: await prisma.company.findMany({ orderBy: { sortOrder: "asc" } }),
      locations: await prisma.location.findMany({ orderBy: { sortOrder: "asc" } }),
      domains: await prisma.domain.findMany({ orderBy: { sortOrder: "asc" } }),
      natures: await prisma.contractNature.findMany({ orderBy: { sortOrder: "asc" } }),
      businesslines: await prisma.businessline.findMany({ orderBy: { sortOrder: "asc" } }),
      contractors: await prisma.contractor.findMany({ orderBy: { name: "asc" } }),
      owners: (
        await prisma.user.findMany({
          where: { active: true },
          orderBy: { fullName: "asc" },
          select: { id: true, fullName: true },
        })
      ).map((u) => ({ id: u.id, name: u.fullName })),
    }))(),
    prisma.contract.count({ where }),
    prisma.contract.findMany({
      where,
      include: {
        documentType: true,
        status: true,
        company: true,
        location: true,
        currency: true,
        businessline: true,
        domain: true,
        nature: true,
        contractors: true,
        ownerIds: true,
        _count: { select: { attachments: true, annexes: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const rows: ContractRow[] = contracts.map((c) => ({
    id: c.id,
    identifier: c.identifier,
    documentType: c.documentType?.name ?? null,
    contractNumber: c.contractNumber,
    statusName: c.status?.name ?? null,
    company: c.company?.name ?? null,
    location: c.location?.name ?? null,
    companyConnected: c.companyConnected,
    nature: c.nature?.name ?? null,
    subject: c.subject,
    dateStart: c.dateStart ? c.dateStart.toISOString() : null,
    dateEnd: c.dateEnd ? c.dateEnd.toISOString() : null,
    noticePeriod: c.noticePeriod,
    amount: c.amount ? c.amount.toString() : null,
    currencyCode: c.currency?.code?.toUpperCase() ?? null,
    obsc: c.obsc,
    owners: c.ownerIds.map((o) => o.fullName),
    businessline: c.businessline?.name ?? null,
    contractors: c.contractors.map((k) => k.name),
    otherAmountDesc: c.otherAmountDesc,
    domain: c.domain?.name ?? null,
    formularz: c.formularz,
    remarks: c.remarks,
    hasParent: c.parentId !== null,
    annexCount: c._count.annexes,
    attachmentsCount: c._count.attachments,
  }));

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const mkPageHref = (p: number) => {
    const q = new URLSearchParams(searchParams as Record<string, string>);
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
              Pokazano <strong className="text-foreground">{from}–{to}</strong> z{" "}
              <strong className="text-foreground">{total}</strong>
            </>
          ) : (
            "Brak wyników"
          )}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            {page > 1 && (
              <Link href={mkPageHref(page - 1)} className="rounded-md border px-3 py-1 transition hover:bg-muted">
                ← Poprzednia
              </Link>
            )}
            <span className="px-1">
              Strona {page} z {totalPages}
            </span>
            {page < totalPages && (
              <Link href={mkPageHref(page + 1)} className="rounded-md border px-3 py-1 transition hover:bg-muted">
                Następna →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

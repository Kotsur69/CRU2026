import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SearchForm } from "@/features/projekty/search-form";
import { ProjectsTable, type ProjectRow } from "@/components/projekty/projects-table";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

// Projekt w legacy to rekord Umowy w statusie workflow (patrz audyt sekcja 2) — dlatego
// większość filtrów celuje w powiązaną Umowę (`contracts: { some: {...} }`), a tylko
// status/właściciel/notatka/opiniujący/data wysłania żyją bezpośrednio na Project.
function buildWhere(sp: SP): Prisma.ProjectWhereInput {
  const and: Prisma.ProjectWhereInput[] = [];
  if (sp.identifier) and.push({ identifier: { contains: sp.identifier, mode: "insensitive" } });
  if (sp.status) and.push({ statusId: sp.status });
  if (sp.owner) and.push({ owners: { some: { id: sp.owner } } });

  const contractAnd: Prisma.ContractWhereInput[] = [];
  if (sp.contractIdentifier) {
    contractAnd.push({ identifier: { contains: sp.contractIdentifier, mode: "insensitive" } });
  }
  if (sp.contractReference) {
    contractAnd.push({ contractNumber: { contains: sp.contractReference, mode: "insensitive" } });
  }
  if (sp.type) contractAnd.push({ documentTypeId: sp.type });
  if (sp.businessline) contractAnd.push({ businesslineId: sp.businessline });
  if (sp.company) contractAnd.push({ companyId: sp.company });
  if (sp.location) contractAnd.push({ locationId: sp.location });
  if (sp.domain) contractAnd.push({ domainId: sp.domain });
  if (sp.contractor) contractAnd.push({ contractors: { some: { id: sp.contractor } } });
  if (sp.nip) contractAnd.push({ contractors: { some: { nip: { contains: sp.nip } } } });
  if (sp.companyConnected === "1") contractAnd.push({ companyConnected: true });
  if (contractAnd.length) and.push({ contracts: { some: { AND: contractAnd } } });

  return and.length ? { AND: and } : {};
}

export default async function ProjektyPage({ searchParams }: { searchParams: SP }) {
  const page = Math.max(1, Number(searchParams.page) || 1);
  const pageSize = Math.min(500, Math.max(10, Number(searchParams.pageSize) || 15));
  const where = buildWhere(searchParams);

  const [dicts, total, projects] = await Promise.all([
    (async () => ({
      documentTypes: await prisma.documentType.findMany({ orderBy: { sortOrder: "asc" } }),
      statuses: await prisma.projectStatus.findMany({ orderBy: { sortOrder: "asc" } }),
      companies: await prisma.company.findMany({ orderBy: { sortOrder: "asc" } }),
      locations: await prisma.location.findMany({ orderBy: { sortOrder: "asc" } }),
      domains: await prisma.domain.findMany({ orderBy: { sortOrder: "asc" } }),
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
    prisma.project.count({ where }),
    prisma.project.findMany({
      where,
      include: {
        status: true,
        owners: true,
        contracts: { include: { contractors: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const rows: ProjectRow[] = projects.map((p) => {
    const primary = p.contracts[0];
    return {
      id: p.id,
      identifier: p.identifier,
      statusName: p.status?.name ?? null,
      owners: p.owners.map((o) => o.fullName),
      contractors: primary?.contractors.map((k) => k.name) ?? [],
      subject: p.subject ?? primary?.subject ?? null,
      lastNote: p.lastNote,
      reviewer: p.reviewer,
      sentToSign: p.sentToSign ? p.sentToSign.toISOString() : null,
    };
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const mkPageHref = (p: number) => {
    const q = new URLSearchParams(searchParams as Record<string, string>);
    q.set("page", String(p));
    return `/projekty?${q.toString()}`;
  };

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <h1 className="font-heading text-2xl font-semibold">Projekty</h1>
        <span className="text-sm text-muted-foreground">
          Znaleziono: <strong className="text-foreground">{total}</strong>
        </span>
      </div>

      <SearchForm dicts={dicts} />

      <ProjectsTable projects={rows} />

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

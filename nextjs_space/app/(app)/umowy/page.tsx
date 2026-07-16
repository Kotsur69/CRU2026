import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SearchForm } from "@/features/umowy/search-form";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

function buildWhere(sp: SP): Prisma.ContractWhereInput {
  const where: Prisma.ContractWhereInput = {};
  if (sp.identifier) where.identifier = { contains: sp.identifier, mode: "insensitive" };
  if (sp.type) where.documentTypeId = sp.type;
  if (sp.status) where.statusId = sp.status;
  if (sp.company) where.companyId = sp.company;
  if (sp.location) where.locationId = sp.location;
  if (sp.domain) where.domainId = sp.domain;
  if (sp.nature) where.natureId = sp.nature;
  if (sp.obsc === "1") where.obsc = true;
  if (sp.companyConnected === "1") where.companyConnected = true;
  if (sp.dateEnd) where.dateEnd = { lte: new Date(sp.dateEnd) };
  return where;
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
    }))(),
    prisma.contract.count({ where }),
    prisma.contract.findMany({
      where,
      include: {
        documentType: true, status: true, company: true, location: true,
        currency: true, businessline: true, contractors: true, ownerIds: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const mkPageHref = (p: number) => {
    const q = new URLSearchParams(searchParams as Record<string, string>);
    q.set("page", String(p));
    return `/umowy?${q.toString()}`;
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Umowy</h1>
        <span className="text-sm text-muted-foreground">
          Znaleziono: <strong>{total}</strong>
        </span>
      </div>

      <SearchForm dicts={dicts} />

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Identyfikator</th>
              <th className="px-3 py-2 font-medium">Typ</th>
              <th className="px-3 py-2 font-medium">Numer</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Spółka</th>
              <th className="px-3 py-2 font-medium">Lokalizacja</th>
              <th className="px-3 py-2 font-medium">Przedmiot</th>
              <th className="px-3 py-2 text-right font-medium">Wynagrodzenie</th>
              <th className="px-3 py-2 text-center font-medium">OBSC</th>
            </tr>
          </thead>
          <tbody>
            {contracts.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                  Brak umów spełniających kryteria.
                </td>
              </tr>
            )}
            {contracts.map((c) => (
              <tr key={c.id} className="border-t hover:bg-muted/40">
                <td className="px-3 py-2">
                  <Link href={`/umowy/${c.id}`} className="font-medium text-primary hover:underline">
                    {c.identifier}
                  </Link>
                </td>
                <td className="px-3 py-2">{c.documentType?.name ?? "—"}</td>
                <td className="px-3 py-2">{c.contractNumber ?? "—"}</td>
                <td className="px-3 py-2">{c.status?.name ?? "—"}</td>
                <td className="px-3 py-2">{c.company?.name ?? "—"}</td>
                <td className="px-3 py-2">{c.location?.name ?? "—"}</td>
                <td className="max-w-xs truncate px-3 py-2">{c.subject ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  {formatMoney(c.amount?.toString(), c.currency?.code?.toUpperCase())}
                </td>
                <td className="px-3 py-2 text-center">{c.obsc ? "✓" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          {page > 1 && (
            <Link href={mkPageHref(page - 1)} className="rounded border px-3 py-1 hover:bg-muted">
              ← Poprzednia
            </Link>
          )}
          <span className="px-2 text-muted-foreground">
            Strona {page} z {totalPages}
          </span>
          {page < totalPages && (
            <Link href={mkPageHref(page + 1)} className="rounded border px-3 py-1 hover:bg-muted">
              Następna →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

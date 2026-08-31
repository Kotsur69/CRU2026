import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { contractorLabel, userLabel } from "@/lib/format";
import { SearchForm } from "@/features/projekty/search-form";
import { ProjectsTable, type ProjectRow } from "@/components/projekty/projects-table";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

const MAX_PAGE_SIZE = 500;
const MIN_PAGE_SIZE = 10;
const DEFAULT_PAGE_SIZE = 15;

/** Query-string values are untrusted: only a clean positive integer is accepted. */
function intParam(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

// A project is not a separate table in the legacy data: it is a row of `contract`
// whose status carries the `project` discriminator (see the audit, section 2).
// Every filter therefore targets Contract directly.
function buildWhere(sp: SP): Prisma.ContractWhereInput {
  const and: Prisma.ContractWhereInput[] = [
    // Legacy soft delete — deleted rows never appear in the register.
    { isDeleted: false },
    { status: { kind: "PROJECT" } },
  ];

  // The form offers two identifier fields; both search the one legacy column.
  const identifier = sp.identifier || sp.contractIdentifier;
  if (identifier) and.push({ identifier: { contains: identifier, mode: "insensitive" } });
  if (sp.contractReference) {
    and.push({ contractReference: { contains: sp.contractReference, mode: "insensitive" } });
  }

  const status = intParam(sp.status);
  if (status !== undefined) and.push({ statusId: status });

  // The project owner is a full-access row in contract_users, not a read-only grant.
  const owner = intParam(sp.owner);
  if (owner !== undefined) and.push({ userAccess: { some: { userId: owner, readOnly: false } } });

  const documentType = intParam(sp.type);
  if (documentType !== undefined) and.push({ documentTypeId: documentType });

  const businessline = intParam(sp.businessline);
  if (businessline !== undefined) and.push({ businesslineId: businessline });

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

  const contractor = intParam(sp.contractor);
  if (contractor !== undefined) and.push({ contractorId: contractor });

  if (sp.nip) and.push({ contractor: { vatId: { contains: sp.nip } } });
  if (sp.companyConnected === "1") and.push({ companiesConnected: true });

  return { AND: and };
}

/** Dictionary options for the filter form. Ids are stringified for the select values. */
async function loadDictionaries() {
  const [documentTypes, statuses, companies, locations, domains, businesslines, contractors, owners] =
    await Promise.all([
      prisma.documentType.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.contractStatus.findMany({
        where: { active: true, kind: "PROJECT" },
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
    businesslines: businesslines.map((b) => ({ id: String(b.id), name: b.name })),
    contractors: contractors.map((k) => ({ id: String(k.id), name: contractorLabel(k) })),
    owners: owners.map((u) => ({ id: String(u.id), name: userLabel(u) })),
  };
}

export default async function ProjektyPage({ searchParams }: { searchParams: SP }) {
  const page = Math.max(1, intParam(searchParams.page) ?? 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(MIN_PAGE_SIZE, intParam(searchParams.pageSize) ?? DEFAULT_PAGE_SIZE),
  );
  const where = buildWhere(searchParams);

  const [dicts, total, projects] = await Promise.all([
    loadDictionaries(),
    prisma.contract.count({ where }),
    prisma.contract.findMany({
      where,
      include: {
        status: true,
        contractor: true,
        userAccess: {
          where: { readOnly: false },
          include: {
            user: { select: { id: true, firstName: true, lastName: true, login: true } },
          },
        },
        // "Opiniujący" — whoever was asked for an opinion in the FAU round.
        opinions: {
          where: { active: true },
          include: {
            user: { select: { id: true, firstName: true, lastName: true, login: true } },
          },
        },
        // Legacy shows the most recent note in the list; the full thread is on the record.
        remarkEntries: {
          where: { active: true },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true },
        },
      },
      orderBy: [{ registeredAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const rows: ProjectRow[] = projects.map((c) => {
    const reviewers = c.opinions
      .map((o) => o.user)
      .filter((u): u is NonNullable<typeof u> => u !== null)
      .map(userLabel);
    return {
      id: c.id,
      identifier: c.identifier ?? "—",
      statusName: c.status?.name ?? null,
      owners: c.userAccess.map((a) => userLabel(a.user)),
      contractors: c.contractor ? [contractorLabel(c.contractor)] : [],
      subject: c.description,
      lastNote: c.remarkEntries[0]?.body ?? c.remarks,
      reviewer: reviewers.length > 0 ? Array.from(new Set(reviewers)).join(", ") : null,
      sentToSign: c.sentOn ? c.sentOn.toISOString() : null,
    };
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const mkPageHref = (p: number) => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (typeof value === "string" && value !== "") q.set(key, value);
    }
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

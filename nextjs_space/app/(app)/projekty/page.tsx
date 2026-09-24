import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buttonClass } from "@/components/ui/button";
import { FilterBar, type FilterField } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";
import { contractorLabel, userLabel } from "@/lib/format";
import { intParam, pageParam, pageSizeParam } from "@/lib/utils";
import { ASSIGNEE_SELECT, loadOwnerOptions } from "@/lib/contract-access";
import { registerWhere } from "@/lib/contracts/scope";
import { loadLastNotes } from "@/lib/contracts/notes";
import { ProjectsTable, type ProjectRow } from "@/components/projekty/projects-table";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

const DEFAULT_PAGE_SIZE = 25;

/**
 * Zbiór roboczy: w toku, wysłane do podpisu i oba statusy obiegu FAU (legacy id 4, 7,
 * 12, 13). 78% rejestru to „Projekt - zakończony", więc filtr „tylko w toku" zawęża
 * listę do tego, nad czym ktoś jeszcze pracuje (docs/features/07).
 */
const IN_PROGRESS_STATUS_IDS = [4, 7, 12, 13];

// Projekt nie ma własnej tabeli: to wiersz `contract` z modułem PROJECT (docs/features/01).
function buildWhere(sp: SP): Prisma.ContractWhereInput {
  const and: Prisma.ContractWhereInput[] = registerWhere("PROJECT");

  if (sp.identifier) and.push({ identifier: { contains: sp.identifier, mode: "insensitive" } });
  // `identifier2` z legacy (Q13): numer umowy, którą projekt się stał — `parentId` na
  // projekcie wskazuje wynikową umowę (docs/features/07).
  if (sp.identifier2) {
    and.push({ parent: { identifier: { contains: sp.identifier2, mode: "insensitive" } } });
  }
  if (sp.contractNumber) {
    and.push({ contractReference: { contains: sp.contractNumber, mode: "insensitive" } });
  }

  const status = intParam(sp.status);
  if (status !== undefined) and.push({ statusId: status });
  if (sp.inProgress === "1") and.push({ statusId: { in: IN_PROGRESS_STATUS_IDS } });

  // Owners are the project's assignees; `onlyRead` grades their rights, it does not
  // decide who counts as an owner (see lib/contract-access.ts).
  const owner = intParam(sp.owner);
  if (owner !== undefined) and.push({ userAccess: { some: { userId: owner } } });

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
async function loadDictionaries(contractorId: number | undefined) {
  const [documentTypes, statuses, companies, locations, domains, businesslines, selected, owners] =
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
      contractorId === undefined
        ? null
        : prisma.contractor.findUnique({
            where: { id: contractorId },
            select: { id: true, shortName: true, fullName: true },
          }),
      loadOwnerOptions(),
    ]);

  const opts = <T extends { id: number }>(rows: T[], name: (row: T) => string) =>
    rows.map((row) => ({ id: String(row.id), name: name(row) }));

  return {
    documentTypes: opts(documentTypes, (d) => d.name),
    statuses: opts(statuses, (s) => s.name),
    companies: opts(companies, (c) => c.shortName),
    locations: opts(locations, (l) => l.name),
    domains: opts(domains, (d) => d.name),
    businesslines: opts(businesslines, (b) => b.name),
    contractor: selected ? { id: String(selected.id), name: contractorLabel(selected) } : null,
    owners,
  };
}

type Dicts = Awaited<ReturnType<typeof loadDictionaries>>;

/**
 * Trzynaście filtrów legacy (audyt §2.2). Względem Umów brak „Data zakończenia",
 * „Charakter umowy" i „tylko OBSSC", doszedł `identifier2`. „tylko w toku" jest nasze.
 */
function filterFields(d: Dicts): FilterField[] {
  return [
    { name: "identifier", label: "Identyfikator" },
    {
      name: "identifier2",
      label: "Identyfikator umowy",
      hint: "Numer umowy, którą projekt się stał",
    },
    { name: "contractNumber", label: "Numer umowy" },
    { name: "type", label: "Typ dokumentu", options: d.documentTypes },
    { name: "businessline", label: "buissnesline", options: d.businesslines },
    { name: "status", label: "Status", options: d.statuses },
    { name: "company", label: "Spółka", options: d.companies },
    { name: "location", label: "Lokalizacja", options: d.locations },
    { name: "contractor", label: "Kontrahenci", contractor: { selected: d.contractor } },
    { name: "owner", label: "Właściciel umowy", options: d.owners },
    { name: "domain", label: "Rodzaj umowy", options: d.domains },
    { name: "nip", label: "NIP" },
    { name: "companyConnected", label: "Podmiot powiązane", checkbox: true },
    { name: "inProgress", label: "tylko w toku", checkbox: true },
  ];
}

export default async function ProjektyPage({ searchParams }: { searchParams: SP }) {
  const page = pageParam(searchParams.page);
  const pageSize = pageSizeParam(searchParams.pageSize, DEFAULT_PAGE_SIZE);
  const where = buildWhere(searchParams);

  const [dicts, total, projects] = await Promise.all([
    loadDictionaries(intParam(searchParams.contractor)),
    prisma.contract.count({ where }),
    prisma.contract.findMany({
      where,
      include: {
        status: true,
        contractor: true,
        parent: { select: { id: true, identifier: true, module: true } },
        userAccess: {
          orderBy: { readOnly: "asc" },
          include: { user: { select: ASSIGNEE_SELECT } },
        },
        // „Opiniujący" — prośby aktywne; wycofane (active = false) nie wstrzymują obiegu.
        opinions: {
          where: { active: true },
          orderBy: { id: "asc" },
          select: { respondedAt: true, user: { select: ASSIGNEE_SELECT } },
        },
      },
      orderBy: [{ registeredAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const lastNotes = await loadLastNotes(projects.map((p) => p.id));

  const rows: ProjectRow[] = projects.map((c) => {
    const reviewers = new Map<string, boolean>();
    for (const o of c.opinions) {
      if (!o.user) continue;
      const name = userLabel(o.user);
      reviewers.set(name, (reviewers.get(name) ?? false) || o.respondedAt !== null);
    }
    return {
      id: c.id,
      identifier: c.identifier ?? `#${c.id}`,
      statusName: c.status?.name ?? null,
      owners: c.userAccess.map((a) => userLabel(a.user)),
      contractors: c.contractor ? [contractorLabel(c.contractor)] : [],
      subject: c.description,
      lastNote: lastNotes.get(c.id) ?? null,
      reviewers: [...reviewers].map(([name, answered]) => ({ name, answered })),
      sentToSign: c.sentOn ? c.sentOn.toISOString() : null,
      contract:
        c.parent?.module === "CONTRACT"
          ? { id: c.parent.id, identifier: c.parent.identifier ?? `#${c.parent.id}` }
          : null,
    };
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">Projekty</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            Znaleziono: <strong className="text-foreground">{total}</strong>
          </span>
          <Link href="/projekty/nowy" className={buttonClass("primary")}>
            Dodaj nowy wpis
          </Link>
        </div>
      </div>

      <FilterBar
        action="/projekty"
        fields={filterFields(dicts)}
        values={searchParams}
        defaultPageSize={DEFAULT_PAGE_SIZE}
        columns={6}
      />

      <ProjectsTable projects={rows} />

      <Pagination
        basePath="/projekty"
        searchParams={searchParams}
        page={page}
        pageSize={pageSize}
        total={total}
      />
    </div>
  );
}

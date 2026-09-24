import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buttonClass } from "@/components/ui/button";
import { FilterBar, type FilterField } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";
import { contractorLabel, userLabel } from "@/lib/format";
import { dateParam, intParam, pageParam, pageSizeParam } from "@/lib/utils";
import { currentActor, rowPermission } from "@/lib/authz";
import { ASSIGNEE_SELECT, loadOwnerOptions } from "@/lib/contract-access";
import { registerWhere } from "@/lib/contracts/scope";
import { loadLastNotes } from "@/lib/contracts/notes";
import { ContractsTable, type ContractRow } from "@/components/umowy/contracts-table";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

/** Legacy otwiera listę na 15 (audyt §1.3); 25 to nasza świadoma decyzja (docs/features/06). */
const DEFAULT_PAGE_SIZE = 25;

function buildWhere(sp: SP): Prisma.ContractWhereInput {
  // Rejestr wybiera `module`, nie `status.kind` — rekord bez statusu zostaje w swoim
  // rejestrze, więc 31 projektów bez statusu nie udaje już umów (docs/features/06).
  const and: Prisma.ContractWhereInput[] = registerWhere("CONTRACT");

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

  // Owners are the contract's assignees; `onlyRead` grades their rights, it does not
  // decide who counts as an owner (see lib/contract-access.ts).
  const owner = intParam(sp.owner);
  if (owner !== undefined) and.push({ userAccess: { some: { userId: owner } } });

  if (sp.nip) and.push({ contractor: { vatId: { contains: sp.nip } } });
  if (sp.obsc === "1") and.push({ obsc: true });
  if (sp.companyConnected === "1") and.push({ companiesConnected: true });

  // Górna granica: „co kończy się do dnia X" (Q34). Rekordy bez daty końca nie pasują.
  const dateEnd = dateParam(sp.dateEnd);
  if (dateEnd) and.push({ dateEnd: { lte: dateEnd } });

  return { AND: and };
}

/** Dictionary options for the filter form. Ids are stringified for the select values. */
async function loadDictionaries(contractorId: number | undefined) {
  const [
    documentTypes,
    statuses,
    companies,
    locations,
    domains,
    natures,
    businesslines,
    selectedContractor,
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
    // Kontrahentów są tysiące — filtr to autocomplete, więc potrzebna jest tylko etykieta
    // firmy już wybranej w adresie.
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
    natures: opts(natures, (n) => n.name),
    businesslines: opts(businesslines, (b) => b.name),
    contractor: selectedContractor
      ? { id: String(selectedContractor.id), name: contractorLabel(selectedContractor) }
      : null,
    owners,
  };
}

type Dicts = Awaited<ReturnType<typeof loadDictionaries>>;

/** Piętnaście filtrów legacy (audyt §1.2), z pisownią legacy: „buissnesline", „tylko OBSSC". */
function filterFields(d: Dicts): FilterField[] {
  return [
    { name: "identifier", label: "Identyfikator" },
    { name: "type", label: "Typ dokumentu", options: d.documentTypes },
    { name: "contractNumber", label: "Numer umowy" },
    { name: "businessline", label: "buissnesline", options: d.businesslines },
    { name: "status", label: "Status", options: d.statuses },
    { name: "company", label: "Spółka", options: d.companies },
    { name: "location", label: "Lokalizacja", options: d.locations },
    { name: "contractor", label: "Kontrahenci", contractor: { selected: d.contractor } },
    { name: "owner", label: "Właściciel umowy", options: d.owners },
    { name: "domain", label: "Rodzaj umowy", options: d.domains },
    { name: "nature", label: "Charakter umowy", options: d.natures },
    { name: "dateEnd", label: "Data zakończenia do", date: true },
    { name: "nip", label: "NIP" },
    { name: "companyConnected", label: "Podmiot powiązane", checkbox: true },
    { name: "obsc", label: "tylko OBSSC", checkbox: true },
  ];
}

export default async function UmowyPage({ searchParams }: { searchParams: SP }) {
  const page = pageParam(searchParams.page);
  const pageSize = pageSizeParam(searchParams.pageSize, DEFAULT_PAGE_SIZE);
  const where = buildWhere(searchParams);

  const [actor, dicts, total, contracts] = await Promise.all([
    currentActor(),
    loadDictionaries(intParam(searchParams.contractor)),
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
        parent: { select: { module: true } },
        userAccess: {
          orderBy: { readOnly: "asc" },
          include: { user: { select: ASSIGNEE_SELECT } },
        },
        _count: {
          select: {
            attachments: true,
            // `parentId` niesie też projekty, które stały się tą umową — to nie aneksy.
            annexes: { where: { module: "CONTRACT", isDeleted: false } },
          },
        },
      },
      orderBy: [{ registeredAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const lastNotes = await loadLastNotes(contracts.map((c) => c.id));

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
    lastNote: lastNotes.get(c.id) ?? null,
    permission: rowPermission(actor, c),
    isAnnex: c.parent?.module === "CONTRACT",
    annexCount: c._count.annexes,
    attachmentsCount: c._count.attachments,
  }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">Umowy</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            Znaleziono: <strong className="text-foreground">{total}</strong>
          </span>
          <Link href="/umowy/nowy" className={buttonClass("primary")}>
            Dodaj nowy wpis
          </Link>
        </div>
      </div>

      <FilterBar
        action="/umowy"
        fields={filterFields(dicts)}
        values={searchParams}
        defaultPageSize={DEFAULT_PAGE_SIZE}
        submitLabel="szukaj"
        columns={6}
      />

      <ContractsTable contracts={rows} />

      <Pagination
        basePath="/umowy"
        searchParams={searchParams}
        page={page}
        pageSize={pageSize}
        total={total}
      />
    </div>
  );
}

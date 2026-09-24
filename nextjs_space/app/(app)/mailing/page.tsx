import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { ASSIGNEE_SELECT } from "@/lib/contract-access";
import { intParam, pageParam, pageSizeParam } from "@/lib/utils";
import { ClickableRow } from "@/components/ui/clickable-row";
import { Cell, DataTable, type DataColumn } from "@/components/ui/data-table";
import { FilterBar, type FilterField } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";
import { Fact } from "@/components/ui/section";
import { ContactAddress, MatchedUser } from "@/components/mailing/contact-fields";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

/** 275 kontaktów — przy 50 na stronę cała lista to sześć stron (docs/features/25). */
const DEFAULT_PAGE_SIZE = 50;

const COLUMNS: DataColumn[] = [
  { id: "firstName", label: "Imię" },
  { id: "lastName", label: "Nazwisko" },
  { id: "email", label: "E-mail" },
  { id: "group", label: "Grupa" },
  { id: "user", label: "Dopasowany użytkownik" },
];

function buildWhere(sp: SP): Prisma.MailingContactWhereInput {
  const and: Prisma.MailingContactWhereInput[] = [];

  // Każde słowo trafia w imię albo w nazwisko, więc „Jan Kowalski" też znajduje.
  for (const word of (sp.name ?? "").split(/\s+/).filter(Boolean)) {
    and.push({
      OR: [
        { firstName: { contains: word, mode: "insensitive" } },
        { lastName: { contains: word, mode: "insensitive" } },
      ],
    });
  }
  if (sp.email) and.push({ email: { contains: sp.email, mode: "insensitive" } });

  const group = intParam(sp.group);
  if (group !== undefined) and.push({ mailingGroupId: group });

  if (sp.noEmail === "1") and.push({ email: null });
  if (sp.unmatched === "1") and.push({ userId: null });

  return { AND: and };
}

function filterFields(groups: { id: number; name: string; _count: { contacts: number } }[]): FilterField[] {
  return [
    { name: "name", label: "Imię / nazwisko" },
    { name: "email", label: "E-mail" },
    {
      name: "group",
      label: "Grupa mailingowa",
      options: groups.map((g) => ({ id: String(g.id), name: `${g.name} (${g._count.contacts})` })),
    },
    { name: "noEmail", label: "bez adresu", checkbox: true },
    { name: "unmatched", label: "niedopasowani", checkbox: true },
  ];
}

/**
 * Lista kontaktów, nic więcej (docs/features/25, Q68). Legacy ma jedną grupę „test" bez
 * członków, jeden szablon bez treści i żadnego śladu wysyłki — dane wspierają spis
 * pracowników, nie kampanie. Poczta wychodząca to spec 29, więc nie ma tu przycisku
 * wysyłki. To jedyna tabela z prawdziwymi nazwiskami i adresami, stąd tylko dla admina.
 */
export default async function MailingPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin();

  const page = pageParam(searchParams.page);
  const pageSize = pageSizeParam(searchParams.pageSize, DEFAULT_PAGE_SIZE);
  const where = buildWhere(searchParams);

  const [groups, total, contacts, all, withoutAddress, matched] = await Promise.all([
    prisma.mailingGroup.findMany({
      include: { _count: { select: { contacts: true } } },
      orderBy: { id: "asc" },
    }),
    prisma.mailingContact.count({ where }),
    prisma.mailingContact.findMany({
      where,
      include: { mailingGroup: true, user: { select: ASSIGNEE_SELECT } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.mailingContact.count(),
    prisma.mailingContact.count({ where: { email: null } }),
    prisma.mailingContact.count({ where: { userId: { not: null } } }),
  ]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">Mailing</h1>
        <span className="text-sm text-muted-foreground">
          Znaleziono: <strong className="text-foreground">{total}</strong>
        </span>
      </div>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        Kontakty pracowników przeniesione z CRU. To spis do wglądu — aplikacja nie wysyła z niego
        wiadomości.
      </p>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Fact label="Kontakty">
          <span className="tabular-nums">{all}</span>
        </Fact>
        <Fact label="Bez adresu">
          <span className="tabular-nums">{withoutAddress}</span>
        </Fact>
        <Fact label="Dopasowane do kont użytkowników">
          <span className="tabular-nums">
            {matched} z {all}
          </span>
        </Fact>
      </div>

      <FilterBar
        action="/mailing"
        fields={filterFields(groups)}
        values={searchParams}
        defaultPageSize={DEFAULT_PAGE_SIZE}
      />

      <DataTable
        columns={COLUMNS}
        emptyTitle="Brak kontaktów spełniających kryteria."
        isEmpty={contacts.length === 0}
      >
        {contacts.map((c) => (
          <ClickableRow key={c.id} href={`/mailing/${c.id}`}>
            <Cell col="firstName">{c.firstName ?? "—"}</Cell>
            <Cell col="lastName">
              <Link href={`/mailing/${c.id}`} className="font-medium text-primary hover:underline">
                {c.lastName ?? "—"}
              </Link>
            </Cell>
            <Cell col="email">
              <ContactAddress email={c.email} />
            </Cell>
            {/* 54 kontakty wskazywały w cru.sql na grupy, których dump nie ma — import je
                wyzerował, więc „—" to stan danych, nie błąd ekranu. */}
            <Cell col="group">{c.mailingGroup?.name ?? "—"}</Cell>
            <Cell col="user">
              <MatchedUser user={c.user} />
            </Cell>
          </ClickableRow>
        ))}
      </DataTable>

      <Pagination
        basePath="/mailing"
        searchParams={searchParams}
        page={page}
        pageSize={pageSize}
        total={total}
      />
    </div>
  );
}

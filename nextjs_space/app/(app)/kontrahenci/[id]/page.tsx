import Link from "next/link";
import { notFound } from "next/navigation";
import type { ContractModule, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { currentActor } from "@/lib/authz";
import {
  contractorLabel,
  formatDate,
  formatDateTime,
  formatMoney,
  userLabel,
  yesNo,
} from "@/lib/format";
import { pageParam } from "@/lib/utils";
import { nipDigits } from "@/lib/contractors";
import { LIVE_RECORD, idsWithNip } from "@/lib/contractors-db";
import {
  REGISTER_LABEL,
  moduleStatusTone,
  modulePath,
  registerOf,
} from "@/lib/contracts/modules";
import { Badge } from "@/components/ui/badge";
import { Cell, DataTable, Truncated, type DataColumn } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { Field, Section } from "@/components/ui/section";
import { ContractorActions } from "@/features/kontrahenci/contractor-actions";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

/** Rekordów na stronę w listach umów i zobowiązań — kontrahenci mają ich do kilkuset. */
const LIST_PAGE_SIZE = 25;

/** Legacy nie zapisał daty przy 2 561 z 3 580 wpisów — brak pokazujemy wprost, nie zmyślamy. */
const UNKNOWN_DATE = "(nieznana)";

const PERSON = { id: true, firstName: true, lastName: true, login: true } as const;

type Person = { id: number; firstName: string | null; lastName: string | null; login: string | null };

/** Audyt pokazuje login, jak podgląd rekordu (docs/features/09); nazwisko jest w podpowiedzi. */
function AccountName({ user }: { user: Person | null }) {
  if (!user) return null;
  return <span title={userLabel(user)}>{user.login ?? userLabel(user)}</span>;
}

function AuditDate({ value }: { value: Date | null }) {
  if (!value) return <span className="text-muted-foreground">{UNKNOWN_DATE}</span>;
  return <span className="tabular-nums">{formatDateTime(value)}</span>;
}

/** Kolumna rejestru — listy mieszają Umowy, Projekty i Dział ryzyka. */
function RecordCells({
  record,
}: {
  record: {
    id: number;
    identifier: string | null;
    module: ContractModule;
    status: { name: string } | null;
  };
}) {
  return (
    <>
      <Cell>
        <Link
          href={`${modulePath(record.module)}/${record.id}`}
          className="font-medium text-primary hover:underline"
        >
          {record.identifier ?? `#${record.id}`}
        </Link>
      </Cell>
      <Cell>{REGISTER_LABEL[registerOf(record.module)]}</Cell>
      <Cell>
        {record.status ? (
          <Badge tone={moduleStatusTone(record.module, record.status.name)}>
            {record.status.name}
          </Badge>
        ) : (
          "—"
        )}
      </Cell>
    </>
  );
}

const CONTRACT_COLUMNS: DataColumn[] = [
  { id: "identifier", label: "Identyfikator" },
  { id: "register", label: "Rejestr" },
  { id: "status", label: "Status" },
  { id: "type", label: "Typ" },
  { id: "company", label: "Spółka" },
  { id: "description", label: "Przedmiot" },
  { id: "salary", label: "Wynagrodzenie", align: "right" },
  { id: "dateEnd", label: "Do" },
];

const DEBT_COLUMNS: DataColumn[] = [
  { id: "identifier", label: "Identyfikator" },
  { id: "register", label: "Rejestr" },
  { id: "status", label: "Status" },
  { id: "contractor", label: "Kontrahent" },
  { id: "amount", label: "Kwota", align: "right" },
  { id: "dateEnd", label: "Do" },
];

const TWIN_COLUMNS: DataColumn[] = [
  { id: "shortName", label: "Nazwa skrócona" },
  { id: "fullName", label: "Nazwa pełna" },
  { id: "vatId", label: "NIP w słowniku" },
  { id: "contracts", label: "Umowy", align: "right" },
  { id: "debts", label: "Zobowiązania", align: "right" },
];

const RECORD_COUNTS = {
  contracts: { where: LIVE_RECORD },
  debtorFor: { where: LIVE_RECORD },
} satisfies Prisma.ContractorCountOutputTypeSelect;

export default async function KontrahentPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: SP;
}) {
  // Route params are untrusted: the legacy primary key is an integer, nothing else.
  const id = Number.parseInt(params.id, 10);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const k = await prisma.contractor.findUnique({
    where: { id },
    include: {
      // Kolejność z docs/features/18: najpierw wersje ostateczne, potem w kolejności wgrania.
      attachments: { orderBy: [{ isFinal: "desc" }, { id: "asc" }] },
      registeredBy: { select: PERSON },
      modifiedBy: { select: PERSON },
      _count: { select: RECORD_COUNTS },
    },
  });
  if (!k) notFound();

  const contractsPage = pageParam(searchParams.umowy);
  const debtsPage = pageParam(searchParams.zobowiazania);

  const [actor, contracts, debts, sameNipIds] = await Promise.all([
    currentActor(),
    prisma.contract.findMany({
      where: { AND: [LIVE_RECORD, { contractorId: id }] },
      include: { status: true, documentType: true, company: true, currency: true },
      orderBy: [{ registeredAt: "desc" }, { id: "desc" }],
      skip: (contractsPage - 1) * LIST_PAGE_SIZE,
      take: LIST_PAGE_SIZE,
    }),
    prisma.contract.findMany({
      where: { AND: [LIVE_RECORD, { debtorId: id }] },
      include: { status: true, contractor: true, currency: true },
      orderBy: [{ registeredAt: "desc" }, { id: "desc" }],
      skip: (debtsPage - 1) * LIST_PAGE_SIZE,
      take: LIST_PAGE_SIZE,
    }),
    idsWithNip(nipDigits(k.vatId)),
  ]);

  // Duplikaty liczymy po cyfrach NIP-u, z usuniętymi włącznie — i na nich wiszą umowy.
  const twinIds = sameNipIds.filter((twinId) => twinId !== id);
  const twins =
    twinIds.length > 0
      ? await prisma.contractor.findMany({
          where: { id: { in: twinIds } },
          include: { _count: { select: RECORD_COUNTS } },
          orderBy: { id: "asc" },
        })
      : [];

  // Edycja, usunięcie i przywrócenie — tylko administrator (docs/features/20); akcje
  // serwerowe sprawdzają to same, tu tylko nie pokazujemy przycisków.
  const isAdmin = actor?.isAdmin === true;
  const name = contractorLabel(k);

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <Link href="/kontrahenci" className="text-sm text-muted-foreground hover:text-foreground">
          ← Kontrahenci
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold">{name}</h1>
          {k.isCeidg && <Badge tone="info">CEIDG</Badge>}
          {k.isConnected && <Badge tone="brand">Podmiot powiązany</Badge>}
          {k.isDeleted && <Badge tone="danger">Usunięty</Badge>}
          {twins.length > 0 && (
            <a href="#duplikaty" className="rounded-full hover:opacity-80">
              <Badge tone="warning">duplikat NIP ({twins.length + 1})</Badge>
            </a>
          )}
        </div>
        {k.fullName && k.fullName !== k.shortName && (
          <p className="mt-2 text-muted-foreground">{k.fullName}</p>
        )}
      </div>

      {isAdmin ? (
        <ContractorActions
          id={k.id}
          name={name}
          isDeleted={k.isDeleted}
          records={k._count.contracts + k._count.debtorFor}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          Edycję, usuwanie i przywracanie kontrahentów wykonuje administrator.
        </p>
      )}

      <Section title="Dane">
        <dl>
          <Field label="Nazwa skrócona">{k.shortName}</Field>
          <Field label="Nazwa pełna">{k.fullName}</Field>
          <Field label="NIP">
            {k.vatId && <span className="tabular-nums">{k.vatId}</span>}
          </Field>
          <Field label="KRS / rejestr">{k.register}</Field>
          <Field label="Adres">{k.address}</Field>
          <Field label="CEIDG">{yesNo(k.isCeidg)}</Field>
          <Field label="Podmiot powiązany">{yesNo(k.isConnected)}</Field>
        </dl>
      </Section>

      {twins.length > 0 && (
        <Section id="duplikaty" title={`Duplikaty (${twins.length})`} className="scroll-mt-4">
          <p className="mb-3 text-sm text-muted-foreground">
            Wpisów z NIP-em {nipDigits(k.vatId)} w słowniku: {twins.length + 1}. Umowy jednej firmy
            mogą być rozdzielone między te wpisy.
          </p>
          <DataTable columns={TWIN_COLUMNS} isEmpty={false} emptyTitle="">
            {twins.map((t) => (
              <tr key={t.id} className="border-t">
                <Cell>
                  <Link
                    href={`/kontrahenci/${t.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {contractorLabel(t)}
                  </Link>
                  {t.isDeleted && (
                    <div className="mt-1">
                      <Badge tone="danger">Usunięty</Badge>
                    </div>
                  )}
                </Cell>
                <Cell>{t.fullName ?? "—"}</Cell>
                <Cell className="tabular-nums">{t.vatId}</Cell>
                <Cell align="right" className="tabular-nums">
                  {t._count.contracts}
                </Cell>
                <Cell align="right" className="tabular-nums">
                  {t._count.debtorFor}
                </Cell>
              </tr>
            ))}
          </DataTable>
        </Section>
      )}

      <Section id="umowy" title={`Umowy (${k._count.contracts})`} className="scroll-mt-4">
        {contracts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak rekordów tego kontrahenta.</p>
        ) : (
          <>
            <DataTable columns={CONTRACT_COLUMNS} isEmpty={false} emptyTitle="">
              {contracts.map((c) => (
                <tr key={c.id} className="border-t">
                  <RecordCells record={c} />
                  <Cell>{c.documentType?.name ?? "—"}</Cell>
                  <Cell>{c.company?.shortName ?? "—"}</Cell>
                  <Cell>
                    <Truncated text={c.description} />
                  </Cell>
                  <Cell align="right" className="whitespace-nowrap tabular-nums">
                    {formatMoney(c.salary?.toString(), c.currency?.code?.toUpperCase())}
                  </Cell>
                  <Cell className="tabular-nums">{formatDate(c.dateEnd)}</Cell>
                </tr>
              ))}
            </DataTable>
            <Pagination
              basePath={`/kontrahenci/${k.id}`}
              searchParams={searchParams}
              page={contractsPage}
              pageSize={LIST_PAGE_SIZE}
              total={k._count.contracts}
              param="umowy"
              anchor="umowy"
            />
          </>
        )}
      </Section>

      {/* Dłużnik to druga strona rekordu (docs/features/08) — osobna lista, nie domieszka. */}
      <Section
        id="zobowiazania"
        title={`Zobowiązania (${k._count.debtorFor})`}
        className="scroll-mt-4"
      >
        {debts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Brak rekordów, w których kontrahent jest dłużnikiem.
          </p>
        ) : (
          <>
            <DataTable columns={DEBT_COLUMNS} isEmpty={false} emptyTitle="">
              {debts.map((c) => (
                <tr key={c.id} className="border-t">
                  <RecordCells record={c} />
                  <Cell>
                    {c.contractorId === id ? (
                      <span className="text-muted-foreground" title="Kontrahentem jest ta sama firma">
                        — (ten sam)
                      </span>
                    ) : c.contractor ? (
                      <Link
                        href={`/kontrahenci/${c.contractor.id}`}
                        className="text-primary hover:underline"
                      >
                        {contractorLabel(c.contractor)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </Cell>
                  <Cell align="right" className="whitespace-nowrap tabular-nums">
                    {formatMoney(c.salary?.toString(), c.currency?.code?.toUpperCase())}
                  </Cell>
                  <Cell className="tabular-nums">{formatDate(c.dateEnd)}</Cell>
                </tr>
              ))}
            </DataTable>
            <Pagination
              basePath={`/kontrahenci/${k.id}`}
              searchParams={searchParams}
              page={debtsPage}
              pageSize={LIST_PAGE_SIZE}
              total={k._count.debtorFor}
              param="zobowiazania"
              anchor="zobowiazania"
            />
          </>
        )}
      </Section>

      {/* Odpisy z rejestru przedsiębiorców (`RP_<numer>_<data>.pdf`) wiszą na kontrahencie,
          nie na umowie (docs/features/18). */}
      <Section title={`Dokumenty rejestrowe (${k.attachments.length})`}>
        {k.attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak załączników.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {k.attachments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2">
                {a.storageKey ? (
                  <a
                    href={`/api/files/${encodeURIComponent(a.storageKey)}`}
                    className="text-primary hover:underline"
                  >
                    {a.name ?? a.storageKey}
                  </a>
                ) : (
                  <span>{a.name ?? `#${a.id}`}</span>
                )}
                {a.fileType && (
                  <span className="text-xs uppercase text-muted-foreground">{a.fileType}</span>
                )}
                {a.isFinal && <Badge tone="success">Wersja ostateczna</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Audyt">
        <dl>
          <Field label="Data rejestracji">
            <AuditDate value={k.registeredAt} />
          </Field>
          <Field label="Zarejestrowano przez">
            {k.registeredBy && <AccountName user={k.registeredBy} />}
          </Field>
          <Field label="Data modyfikacji">
            <AuditDate value={k.modifiedAt} />
          </Field>
          <Field label="Modyfikowano przez">
            {k.modifiedBy && <AccountName user={k.modifiedBy} />}
          </Field>
          <Field label="Identyfikator CRU">{k.cruIdentifier}</Field>
        </dl>
      </Section>
    </div>
  );
}

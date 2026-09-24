import Link from "next/link";
import { notFound } from "next/navigation";
import type { AccessDimension } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { userLabel } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Field, Section } from "@/components/ui/section";

export const dynamic = "force-dynamic";

const CONTRACTS_SHOWN = 50;

/** Etykiety wymiarów z legacy `access` — kolejność jak w tabeli źródłowej. */
const DIMENSION_LABEL: Record<AccessDimension, string> = {
  COMPANY: "Spółka",
  DOMAIN: "Rodzaj umowy",
  LOCATION: "Lokalizacja",
  NATURE: "Charakter umowy",
  NOTICE_PERIOD: "Okres wypowiedzenia",
  DOCUMENT_TYPE: "Typ dokumentu",
  TRADE: "Eksport/Import",
  CONNECTED_ENTITY: "Podmiot powiązany",
  PROJECT_MODULE: "Moduł Projekty",
  BUSINESSLINE: "Businessline",
};

/**
 * `useraccess.key` wskazuje na inny słownik zależnie od wymiaru, więc nie jest kluczem
 * obcym i nie da się go rozwiązać jednym joinem. Dwa wymiary (`companies_connected`,
 * `project`) nie mają w dumpie własnej tabeli słownikowej — dla nich pokazujemy surowe id.
 */
async function resolveScopeValues(
  scopes: readonly { dimension: AccessDimension; valueId: number }[],
): Promise<Map<string, string>> {
  const byDimension = new Map<AccessDimension, number[]>();
  for (const s of scopes) {
    byDimension.set(s.dimension, [...(byDimension.get(s.dimension) ?? []), s.valueId]);
  }

  const resolved = new Map<string, string>();
  const put = (dimension: AccessDimension, id: number, name: string) =>
    resolved.set(`${dimension}:${id}`, name);

  const ids = (dimension: AccessDimension) => byDimension.get(dimension) ?? [];

  const [companies, domains, locations, natures, noticePeriods, documentTypes, trades, lines] =
    await Promise.all([
      prisma.company.findMany({ where: { id: { in: ids("COMPANY") } } }),
      prisma.domain.findMany({ where: { id: { in: ids("DOMAIN") } } }),
      prisma.location.findMany({ where: { id: { in: ids("LOCATION") } } }),
      prisma.contractNature.findMany({ where: { id: { in: ids("NATURE") } } }),
      prisma.noticePeriod.findMany({ where: { id: { in: ids("NOTICE_PERIOD") } } }),
      prisma.documentType.findMany({ where: { id: { in: ids("DOCUMENT_TYPE") } } }),
      prisma.trade.findMany({ where: { id: { in: ids("TRADE") } } }),
      prisma.businessline.findMany({ where: { id: { in: ids("BUSINESSLINE") } } }),
    ]);

  for (const c of companies) put("COMPANY", c.id, c.shortName);
  for (const d of domains) put("DOMAIN", d.id, d.name);
  for (const l of locations) put("LOCATION", l.id, l.name);
  for (const n of natures) put("NATURE", n.id, n.name);
  for (const n of noticePeriods) put("NOTICE_PERIOD", n.id, n.name);
  for (const t of documentTypes) put("DOCUMENT_TYPE", t.id, t.name);
  for (const t of trades) put("TRADE", t.id, t.name);
  for (const b of lines) put("BUSINESSLINE", b.id, b.name);

  return resolved;
}

export default async function DostepPage({ params }: { params: { id: string } }) {
  // Route params are untrusted: the legacy directory id is an integer, nothing else.
  const id = Number.parseInt(params.id, 10);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const u = await prisma.user.findUnique({
    where: { id },
    include: {
      groups: { include: { group: { select: { id: true, name: true } } } },
      locations: { include: { location: { select: { id: true, name: true } } } },
      accessScopes: { orderBy: [{ dimension: "asc" }, { valueId: "asc" }] },
      contractAccess: {
        include: {
          contract: {
            select: {
              id: true,
              identifier: true,
              description: true,
              status: { select: { name: true } },
            },
          },
        },
        orderBy: { contractId: "desc" },
        take: CONTRACTS_SHOWN,
      },
      _count: {
        select: { contractAccess: true, opinions: true, remarks: true, historyEntries: true },
      },
    },
  });

  if (!u) notFound();

  const scopeNames = await resolveScopeValues(u.accessScopes);

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <Link href="/dostepy" className="text-sm text-muted-foreground hover:text-foreground">
          ← Dostępy
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold">{userLabel(u)}</h1>
          {u.isAdmin && <Badge tone="warning">administrator</Badge>}
          {u.isPlaceholder ? (
            <Badge tone="neutral">rekord z katalogu</Badge>
          ) : (
            <Badge tone={u.active ? "success" : "neutral"}>
              {u.active ? "aktywny" : "nieaktywny"}
            </Badge>
          )}
        </div>
        {u.isPlaceholder && (
          <p className="mt-2 text-sm text-muted-foreground">
            Konto odtworzone z odwołań w dumpie. Imię, nazwisko i e-mail pojawią się po
            imporcie katalogu korporacyjnego (<code>am_admin</code>), którego nie ma w{" "}
            <code>cru.sql</code>.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Section title="Konto">
          <dl>
            <Field label="Login">{u.login}</Field>
            <Field label="E-mail">{u.email}</Field>
            <Field label="Telefon">{u.phone}</Field>
            <Field label="Identyfikator katalogu">{u.id}</Field>
          </dl>
        </Section>

        <Section title="Aktywność w rejestrze">
          <dl>
            <Field label="Przypisania do umów">{u._count.contractAccess}</Field>
            <Field label="Opinie">{u._count.opinions}</Field>
            <Field label="Notatki">{u._count.remarks}</Field>
            <Field label="Wpisy w historii zmian">{u._count.historyEntries}</Field>
          </dl>
        </Section>
      </div>

      <Section title={`Grupy (${u.groups.length})`}>
        {u.groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak przypisanych grup.</p>
        ) : (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {u.groups.map((m) => (
              <li key={m.groupId}>
                <Link href={`/grupy/${m.groupId}`} className="text-primary hover:underline">
                  {m.group.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Lokalizacje (${u.locations.length})`}>
        {u.locations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak zawężenia do lokalizacji.</p>
        ) : (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {u.locations.map((l) => (
              <li key={l.locationId}>{l.location.name}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Zawężenia dostępu (${u.accessScopes.length})`}>
        {u.accessScopes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Brak zawężeń — użytkownik nie ma ograniczeń wymiarowych z tabeli{" "}
            <code>useraccess</code>.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {u.accessScopes.map((s) => (
              <li key={s.id}>
                <span className="text-muted-foreground">{DIMENSION_LABEL[s.dimension]}:</span>{" "}
                {scopeNames.get(`${s.dimension}:${s.valueId}`) ?? `#${s.valueId}`}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Umowy użytkownika (${u._count.contractAccess})`}>
        {u.contractAccess.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak przypisanych umów.</p>
        ) : (
          <>
            <ul className="space-y-1 text-sm">
              {u.contractAccess.map((a) => (
                <li key={a.contractId} className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/umowy/${a.contractId}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {a.contract.identifier ?? `#${a.contractId}`}
                  </Link>
                  {!a.readOnly && <Badge tone="info">prawo edycji</Badge>}
                  <span className="text-muted-foreground">{a.contract.status?.name ?? "—"}</span>
                </li>
              ))}
            </ul>
            {u._count.contractAccess > u.contractAccess.length && (
              <p className="mt-3 text-sm text-muted-foreground">
                Pokazano {u.contractAccess.length} z {u._count.contractAccess}.{" "}
                <Link href={`/umowy?owner=${u.id}`} className="text-primary hover:underline">
                  Zobacz wszystkie w rejestrze umów →
                </Link>
              </p>
            )}
          </>
        )}
      </Section>
    </div>
  );
}

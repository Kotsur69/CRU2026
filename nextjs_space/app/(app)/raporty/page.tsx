import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Legacy wystawia gotowe zestawienia pod `/raport/{umowy,projekty,ryzyka,kontrahenci,
 * supplychain,opinions}` (audyt sekcja 3.–8.). Ich wnętrza nie były dostępne z konta
 * audytowego, więc nie odtwarzamy układu legacy — liczymy te same przekroje wprost
 * z zaimportowanych danych i linkujemy do rejestrów, które je pokazują.
 */

const DAY_MS = 86_400_000;
const SOON_DAYS = 30;
const WATCH_DAYS = 90;

function Card({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        {href && (
          <Link href={href} className="text-xs text-primary hover:underline">
            Rejestr →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

interface ReportRow {
  label: string;
  value: string | number;
  href?: string;
}

function Rows({ rows }: { rows: ReportRow[] }) {
  return (
    <dl className="text-sm">
      {rows.map((r) => (
        <div
          key={r.label}
          className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5 last:border-0"
        >
          <dt className="text-muted-foreground">
            {r.href ? (
              <Link href={r.href} className="hover:text-foreground hover:underline">
                {r.label}
              </Link>
            ) : (
              r.label
            )}
          </dt>
          <dd className="font-medium tabular-nums">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function RaportyPage() {
  const now = new Date();
  const soon = new Date(now.getTime() + SOON_DAYS * DAY_MS);
  const watch = new Date(now.getTime() + WATCH_DAYS * DAY_MS);
  const live = { isDeleted: false } as const;

  const [
    statuses,
    byStatus,
    companies,
    byCompany,
    expired,
    endingSoon,
    endingWatch,
    riskTotals,
    contractorTotal,
    contractorWithContracts,
    contractorConnected,
    contractorCeidg,
    attachmentTotal,
    attachmentOnContract,
    supplyGroups,
    opinionTypes,
    pendingOpinions,
  ] = await Promise.all([
    prisma.contractStatus.findMany({ orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] }),
    prisma.contract.groupBy({ by: ["statusId"], where: live, _count: { _all: true } }),
    prisma.company.findMany({ orderBy: [{ sortOrder: "asc" }, { shortName: "asc" }] }),
    prisma.contract.groupBy({ by: ["companyId"], where: live, _count: { _all: true } }),
    prisma.contract.count({
      where: { ...live, dateEnd: { lt: now }, status: { kind: "CONTRACT" } },
    }),
    prisma.contract.count({
      where: { ...live, dateEnd: { gte: now, lte: soon }, status: { kind: "CONTRACT" } },
    }),
    prisma.contract.count({
      where: { ...live, dateEnd: { gt: soon, lte: watch }, status: { kind: "CONTRACT" } },
    }),
    prisma.contract.aggregate({
      where: { ...live, status: { kind: "RISK" } },
      _count: { _all: true },
      _sum: { salary: true },
    }),
    prisma.contractor.count({ where: { isDeleted: false } }),
    prisma.contractor.count({ where: { isDeleted: false, contracts: { some: {} } } }),
    prisma.contractor.count({ where: { isDeleted: false, isConnected: true } }),
    prisma.contractor.count({ where: { isDeleted: false, isCeidg: true } }),
    prisma.attachment.count(),
    prisma.attachment.count({ where: { contractId: { not: null } } }),
    prisma.group.findMany({
      where: { name: { contains: "upplychain" } },
      include: { businessline: true, _count: { select: { members: true } } },
      orderBy: { id: "asc" },
    }),
    prisma.opinionType.findMany({ orderBy: { id: "asc" } }),
    prisma.opinion.groupBy({
      by: ["opinionTypeId"],
      where: { active: true, signed: false, contract: live },
      _count: { _all: true },
    }),
  ]);

  const statusRows = (kind: "CONTRACT" | "PROJECT" | "RISK"): ReportRow[] =>
    statuses
      .filter((s) => s.kind === kind)
      .map((s) => ({
        label: s.name,
        value: byStatus.find((g) => g.statusId === s.id)?._count._all ?? 0,
      }));

  const noStatus = byStatus.find((g) => g.statusId === null)?._count._all ?? 0;
  const pendingTotal = pendingOpinions.reduce((sum, g) => sum + g._count._all, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Raporty</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Przekroje liczone na bieżąco z bazy. Odpowiadają zestawieniom, które legacy
          wystawia pod <code>/raport/*</code>; układ tamtych ekranów nie był dostępny do
          audytu, więc to własna prezentacja tych samych danych.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Umowy — wg statusu" href="/umowy">
          <Rows
            rows={[
              ...statusRows("CONTRACT"),
              ...(noStatus > 0 ? [{ label: "(bez statusu)", value: noStatus }] : []),
            ]}
          />
        </Card>

        <Card title="Umowy — terminy zakończenia" href="/umowy">
          <Rows
            rows={[
              { label: "Po terminie", value: expired },
              { label: `Kończą się w ${SOON_DAYS} dni`, value: endingSoon },
              { label: `Kończą się w ${WATCH_DAYS} dni`, value: endingWatch },
            ]}
          />
        </Card>

        <Card title="Projekty — wg statusu" href="/projekty">
          <Rows rows={statusRows("PROJECT")} />
        </Card>

        <Card title="Dział ryzyka" href="/ryzyko">
          <Rows
            rows={[
              ...statusRows("RISK"),
              { label: "Razem rekordów", value: riskTotals._count._all },
              {
                label: "Suma kwot",
                value: formatMoney(riskTotals._sum.salary?.toString() ?? null),
              },
            ]}
          />
        </Card>

        <Card title="Umowy — wg spółki" href="/umowy">
          <Rows
            rows={companies.map((c) => ({
              label: c.shortName,
              value: byCompany.find((g) => g.companyId === c.id)?._count._all ?? 0,
              href: `/umowy?company=${c.id}`,
            }))}
          />
        </Card>

        <Card title="Kontrahenci" href="/kontrahenci">
          <Rows
            rows={[
              { label: "Aktywnych w słowniku", value: contractorTotal },
              { label: "Z przypisaną umową", value: contractorWithContracts },
              { label: "Podmioty powiązane", value: contractorConnected },
              { label: "CEIDG", value: contractorCeidg },
            ]}
          />
        </Card>

        <Card title="Zaległe opinie" href="/projekty">
          {pendingTotal === 0 ? (
            <p className="text-sm text-muted-foreground">Brak niepodpisanych opinii.</p>
          ) : (
            <Rows
              rows={[
                ...opinionTypes
                  .map((t) => ({
                    label: t.name,
                    value:
                      pendingOpinions.find((g) => g.opinionTypeId === t.id)?._count._all ?? 0,
                  }))
                  .filter((r) => r.value > 0),
                { label: "Razem", value: pendingTotal },
              ]}
            />
          )}
        </Card>

        <Card title="Supply chain" href="/grupy">
          {/* Dump nie zawiera osobnego rejestru supply chain — jedyne jego ślady to grupy
              „Supplychain" i przypięte do nich businessline'y. */}
          <Rows
            rows={supplyGroups.map((g) => ({
              label: `${g.name}${g.businessline ? ` · ${g.businessline.name}` : ""}`,
              value: `${g._count.members} os.`,
              href: `/grupy/${g.id}`,
            }))}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Poza tymi grupami <code>cru.sql</code> nie niesie danych supply chain.
          </p>
        </Card>

        <Card title="Załączniki">
          <Rows
            rows={[
              { label: "Rekordów w bazie", value: attachmentTotal },
              { label: "Przypiętych do umowy", value: attachmentOnContract },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}

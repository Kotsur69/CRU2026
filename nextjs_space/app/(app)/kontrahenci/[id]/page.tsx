import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { contractorLabel, formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/lib/contract-status";
import { Field, Section } from "@/components/ui/section";

export const dynamic = "force-dynamic";

/** Ile umów pokazujemy bez przechodzenia do rejestru — kontrahenci mają ich do kilkuset. */
const CONTRACTS_SHOWN = 100;

export default async function KontrahentPage({ params }: { params: { id: string } }) {
  // Route params are untrusted: the legacy primary key is an integer, nothing else.
  const id = Number.parseInt(params.id, 10);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const k = await prisma.contractor.findUnique({
    where: { id },
    include: {
      contracts: {
        where: { isDeleted: false },
        include: {
          status: true,
          documentType: true,
          company: true,
          currency: true,
        },
        orderBy: [{ registeredAt: "desc" }, { id: "desc" }],
        take: CONTRACTS_SHOWN,
      },
      attachments: { orderBy: { id: "asc" } },
      _count: { select: { contracts: true, debtorFor: true, attachments: true } },
    },
  });

  if (!k) notFound();

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <Link href="/kontrahenci" className="text-sm text-muted-foreground hover:text-foreground">
          ← Kontrahenci
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold">{contractorLabel(k)}</h1>
          {k.isCeidg && <Badge tone="info">CEIDG</Badge>}
          {k.isConnected && <Badge tone="brand">Podmiot powiązany</Badge>}
          {k.isDeleted && <Badge tone="danger">Usunięty</Badge>}
        </div>
        {k.fullName && k.fullName !== k.shortName && (
          <p className="mt-2 text-muted-foreground">{k.fullName}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Section title="Dane rejestrowe">
          <dl>
            <Field label="NIP">{k.vatId}</Field>
            <Field label="Rejestr / KRS">{k.register}</Field>
            <Field label="Identyfikator CRU">{k.cruIdentifier}</Field>
            <Field label="Adres">{k.address}</Field>
          </dl>
        </Section>

        <Section title="Powiązania">
          <dl>
            <Field label="Umowy jako kontrahent">{k._count.contracts}</Field>
            <Field label="Rekordy ryzyka jako dłużnik">{k._count.debtorFor}</Field>
            <Field label="Załączniki własne">{k._count.attachments}</Field>
            <Field label="Zarejestrowano">
              <span className="tabular-nums">{formatDateTime(k.registeredAt)}</span>
            </Field>
            <Field label="Modyfikacja">
              <span className="tabular-nums">{formatDateTime(k.modifiedAt)}</span>
            </Field>
          </dl>
        </Section>
      </div>

      <Section title={`Umowy (${k._count.contracts})`}>
        {k.contracts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak umów tego kontrahenta.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 font-semibold">Identyfikator</th>
                    <th className="px-2 py-1.5 font-semibold">Typ</th>
                    <th className="px-2 py-1.5 font-semibold">Status</th>
                    <th className="px-2 py-1.5 font-semibold">Spółka</th>
                    <th className="px-2 py-1.5 font-semibold">Przedmiot</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Wynagrodzenie</th>
                    <th className="px-2 py-1.5 font-semibold">Do</th>
                  </tr>
                </thead>
                <tbody>
                  {k.contracts.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="px-2 py-1.5 align-top">
                        <Link
                          href={`/umowy/${c.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {c.identifier ?? `#${c.id}`}
                        </Link>
                      </td>
                      <td className="px-2 py-1.5 align-top">{c.documentType?.name ?? "—"}</td>
                      <td className="px-2 py-1.5 align-top">
                        <Badge tone={statusTone(c.status?.name)}>{c.status?.name ?? "—"}</Badge>
                      </td>
                      <td className="px-2 py-1.5 align-top">{c.company?.shortName ?? "—"}</td>
                      <td className="whitespace-normal break-words px-2 py-1.5 align-top">
                        <span className="block max-w-[22rem]">{c.description ?? "—"}</span>
                      </td>
                      <td className="px-2 py-1.5 text-right align-top tabular-nums">
                        {formatMoney(c.salary?.toString(), c.currency?.code?.toUpperCase())}
                      </td>
                      <td className="px-2 py-1.5 align-top tabular-nums">
                        {formatDate(c.dateEnd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {k._count.contracts > k.contracts.length && (
              <p className="mt-3 text-sm text-muted-foreground">
                Pokazano {k.contracts.length} z {k._count.contracts}.{" "}
                <Link href={`/umowy?contractor=${k.id}`} className="text-primary hover:underline">
                  Zobacz wszystkie w rejestrze umów →
                </Link>
              </p>
            )}
          </>
        )}
      </Section>

      <Section title="Załączniki kontrahenta">
        {k.attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak załączników.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {k.attachments.map((a) => (
              <li key={a.id}>
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
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

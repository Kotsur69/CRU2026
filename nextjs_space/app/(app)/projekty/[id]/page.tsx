import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatMoney, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { projectStatusTone, endUrgency } from "@/lib/contract-status";

export const dynamic = "force-dynamic";

// ── Prymitywy prezentacyjne (te same co app/(app)/umowy/[id]/page.tsx) ───

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border bg-card p-5 shadow-sm ${className ?? ""}`}>
      <h2 className="mb-3 font-heading text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children?: React.ReactNode }) {
  const empty = children === null || children === undefined || children === "";
  return (
    <div className="grid grid-cols-3 gap-3 border-b border-border/60 py-2 last:border-0">
      <dt className="col-span-1 text-sm text-muted-foreground">{label}</dt>
      <dd className="col-span-2 text-sm">{empty ? "—" : children}</dd>
    </div>
  );
}

function Fact({
  label,
  children,
  emphasize,
}: {
  label: string;
  children: React.ReactNode;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={emphasize ? "mt-1 font-heading text-lg font-semibold" : "mt-1 text-sm font-medium"}>
        {children ?? "—"}
      </div>
    </div>
  );
}

function FlagChip({ on, label }: { on: boolean; label: string }) {
  return <Badge tone={on ? "success" : "neutral"}>{on ? "✓" : "–"} {label}</Badge>;
}

export default async function ProjektPreviewPage({
  params,
}: {
  params: { id: string };
}) {
  const p = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      status: true,
      owners: true,
      contracts: {
        include: {
          documentType: true, status: true, businessline: true, company: true,
          location: true, domain: true, nature: true, currency: true,
          contractors: true, attachments: true, parent: true, annexes: true,
        },
      },
    },
  });

  if (!p) notFound();

  // Projekt w legacy współdzieli rekord z Umową (patrz audyt sekcja 2) — pola
  // klasyfikacji/warunków/finansów czerpiemy z pierwszej powiązanej Umowy.
  const c = p.contracts[0];
  const money = c ? formatMoney(c.amount?.toString(), c.currency?.code?.toUpperCase()) : "—";
  const end = c ? endUrgency(c.dateEnd, c.status?.name) : null;
  const hasAnnexLinks = Boolean(c?.parent) || (c?.annexes.length ?? 0) > 0;

  return (
    <div className="max-w-5xl space-y-5">
      {/* Nagłówek */}
      <div>
        <Link href="/projekty" className="text-sm text-muted-foreground hover:text-foreground">
          ← Projekty
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold">{p.identifier}</h1>
          <Badge tone={projectStatusTone(p.status?.name)}>{p.status?.name ?? "—"}</Badge>
          {c?.documentType?.name && <Badge tone="brand">{c.documentType.name}</Badge>}
          {c && (
            <Badge tone="info">
              Umowa{" "}
              <Link href={`/umowy/${c.id}`} className="underline">
                {c.identifier}
              </Link>
            </Badge>
          )}
        </div>
        {(p.subject ?? c?.subject) && <p className="mt-2 text-muted-foreground">{p.subject ?? c?.subject}</p>}
      </div>

      {/* Kluczowe fakty workflow */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Fact label="Opiniujący">{p.reviewer}</Fact>
        <Fact label="Wysłane do podpisu">
          <span className="tabular-nums">{formatDate(p.sentToSign)}</span>
        </Fact>
        <Fact label="Spółka">{c?.company?.name}</Fact>
        <Fact label="Wynagrodzenie" emphasize>
          <span className="tabular-nums">{money}</span>
        </Fact>
        <Fact label="Okres obowiązywania">
          {c ? (
            <>
              <span className="tabular-nums">
                {formatDate(c.dateStart)} – {formatDate(c.dateEnd)}
              </span>
              {end?.label && (
                <div className="mt-1">
                  <Badge tone={end.tone}>{end.label}</Badge>
                </div>
              )}
            </>
          ) : (
            "—"
          )}
        </Fact>
      </div>

      {/* Sekcje szczegółowe */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Section title="Workflow projektu">
          <dl>
            <Field label="Status">{p.status?.name}</Field>
            <Field label="Opiniujący">{p.reviewer}</Field>
            <Field label="Wysłane do podpisu">
              <span className="tabular-nums">{formatDate(p.sentToSign)}</span>
            </Field>
            <Field label="Ostatnia notatka">{p.lastNote}</Field>
            <Field label="Właściciel umowy">
              {p.owners.length ? p.owners.map((o) => o.fullName).join(", ") : null}
            </Field>
          </dl>
        </Section>

        <Section title="Klasyfikacja">
          <dl>
            <Field label="Businessline">{c?.businessline?.name}</Field>
            <Field label="Typ dokumentu">{c?.documentType?.name}</Field>
            <Field label="Numer umowy">{c?.contractNumber}</Field>
            <Field label="Rodzaj umowy">{c?.domain?.name}</Field>
            <Field label="Charakter umowy">{c?.nature?.name}</Field>
          </dl>
        </Section>

        <Section title="Warunki i finanse">
          <dl>
            <Field label="Przedmiot umowy">{p.subject ?? c?.subject}</Field>
            <Field label="Wynagrodzenie">
              <span className="tabular-nums">{money}</span>
            </Field>
            <Field label="Inne określenie wynagrodzenia">{c?.otherAmountDesc}</Field>
            <Field label="Termin płatności">{c?.paymentTerm}</Field>
          </dl>
        </Section>

        <Section title="Terminy">
          <dl>
            <Field label="Data zawarcia">
              <span className="tabular-nums">{formatDate(c?.dateStart)}</span>
            </Field>
            <Field label="Data zakończenia">
              <span className="tabular-nums">{formatDate(c?.dateEnd)}</span>
              {end?.label && (
                <Badge tone={end.tone} className="ml-2">
                  {end.label}
                </Badge>
              )}
            </Field>
            <Field label="Okres wypowiedzenia">{c?.noticePeriod}</Field>
          </dl>
        </Section>

        <Section title="Klasyfikacja dodatkowa">
          <dl>
            <Field label="Forma doręczenia">{c?.deliveryForm}</Field>
            <Field label="Eksport/Import">{c?.exportImport}</Field>
            <Field label="Lokalizacja">{c?.location?.name}</Field>
          </dl>
        </Section>

        <Section title="Strony">
          <dl>
            <Field label="Kontrahenci">
              {c?.contractors.length
                ? c.contractors.map((k) => `${k.name}${k.nip ? ` (NIP ${k.nip})` : ""}`).join(", ")
                : null}
            </Field>
          </dl>
        </Section>

        <Section title="Cechy">
          <div className="flex flex-wrap gap-2">
            <FlagChip on={c?.weksel ?? false} label="Weksel" />
            <FlagChip on={c?.companyConnected ?? false} label="Podmiot powiązane" />
            <FlagChip on={c?.formularz ?? false} label="Formularz" />
            <FlagChip on={c?.obsc ?? false} label="OBSC" />
          </div>
        </Section>
      </div>

      {/* Uwagi */}
      {c?.remarks && (
        <Section title="Uwagi">
          <p className="whitespace-pre-line text-sm">{c.remarks}</p>
        </Section>
      )}

      {/* Aneksy do umowy */}
      <Section title="Aneksy do umowy">
        {hasAnnexLinks && c ? (
          <ul className="space-y-1 text-sm">
            {c.parent && (
              <li>
                Umowa nadrzędna:{" "}
                <Link href={`/umowy/${c.parent.id}`} className="text-primary hover:underline">
                  {c.parent.identifier}
                </Link>
              </li>
            )}
            {c.annexes.map((a) => (
              <li key={a.id}>
                <Link href={`/umowy/${a.id}`} className="text-primary hover:underline">
                  {a.identifier}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Brak powiązanych aneksów.</p>
        )}
      </Section>

      {/* Załączniki */}
      <Section title="Załączniki">
        {!c || c.attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak załączników.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {c.attachments.map((a) => (
              <li key={a.id}>
                <a
                  href={`/api/files/${encodeURIComponent(a.storageKey)}`}
                  className="text-primary hover:underline"
                >
                  {a.filename}
                </a>
                {a.isFinal && (
                  <Badge tone="brand" className="ml-2">
                    Wersja ostateczna
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Placeholder workflow FAU — świadomie POMINIĘTY: Formularz akceptacji umowy-pdf,
          Formularz akceptacji umowy i „zadaj pytanie" wywołują żywe akcje w systemie legacy
          i nie były klikane podczas eksploracji; tu tylko widok informacyjny. */}
      <div className="rounded-lg border border-dashed bg-muted/30 p-5">
        <h3 className="font-heading text-sm font-semibold">Obieg FAU (Formularz Akceptacji Umowy)</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Workflow akceptacji (opiniowanie, wysyłka do podpisu) — moduł w budowie.
        </p>
      </div>

      <div className="text-xs text-muted-foreground">
        Zarejestrowano: {formatDate(p.createdAt)} · Modyfikacja: {formatDate(p.modifiedAt)}
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatMoney, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { statusTone, endUrgency } from "@/lib/contract-status";

export const dynamic = "force-dynamic";

// ── Prymitywy prezentacyjne (lokalne dla ekranu detalu) ──────────────────

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

export default async function UmowaPreviewPage({
  params,
}: {
  params: { id: string };
}) {
  const c = await prisma.contract.findUnique({
    where: { id: params.id },
    include: {
      documentType: true, status: true, businessline: true, company: true,
      location: true, domain: true, nature: true, currency: true,
      contractors: true, ownerIds: true, project: true, attachments: true,
      createdBy: true, modifiedBy: true, parent: true, annexes: true,
    },
  });

  if (!c) notFound();

  const money = formatMoney(c.amount?.toString(), c.currency?.code?.toUpperCase());
  const end = endUrgency(c.dateEnd, c.status?.name);
  const hasAnnexLinks = Boolean(c.parent) || c.annexes.length > 0;

  return (
    <div className="max-w-5xl space-y-5">
      {/* Nagłówek */}
      <div>
        <Link href="/umowy" className="text-sm text-muted-foreground hover:text-foreground">
          ← Umowy
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold">{c.identifier}</h1>
          <Badge tone={statusTone(c.status?.name)}>{c.status?.name ?? "—"}</Badge>
          {c.documentType?.name && <Badge tone="brand">{c.documentType.name}</Badge>}
          {c.parent && (
            <Badge tone="info">
              Aneks do{" "}
              <Link href={`/umowy/${c.parent.id}`} className="underline">
                {c.parent.identifier}
              </Link>
            </Badge>
          )}
        </div>
        {c.subject && <p className="mt-2 text-muted-foreground">{c.subject}</p>}
      </div>

      {/* Kluczowe fakty */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Fact label="Spółka">{c.company?.name}</Fact>
        <Fact label="Lokalizacja">{c.location?.name}</Fact>
        <Fact label="Kontrahent">
          {c.contractors.length ? c.contractors[0].name : "—"}
          {c.contractors.length > 1 && (
            <span className="text-muted-foreground"> +{c.contractors.length - 1}</span>
          )}
        </Fact>
        <Fact label="Wynagrodzenie" emphasize>
          <span className="tabular-nums">{money}</span>
        </Fact>
        <Fact label="Okres obowiązywania">
          <span className="tabular-nums">
            {formatDate(c.dateStart)} – {formatDate(c.dateEnd)}
          </span>
          {end?.label && (
            <div className="mt-1">
              <Badge tone={end.tone}>{end.label}</Badge>
            </div>
          )}
        </Fact>
      </div>

      {/* Sekcje szczegółowe */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Section title="Klasyfikacja">
          <dl>
            <Field label="Buissnesline">{c.businessline?.name}</Field>
            <Field label="Typ dokumentu">{c.documentType?.name}</Field>
            <Field label="Numer umowy">{c.contractNumber}</Field>
            <Field label="Rodzaj umowy">{c.domain?.name}</Field>
            <Field label="Charakter umowy">{c.nature?.name}</Field>
            <Field label="Projekt">
              {c.project ? (
                <Link href="/projekty" className="text-primary hover:underline">
                  {c.project.identifier}
                </Link>
              ) : null}
            </Field>
          </dl>
        </Section>

        <Section title="Warunki i finanse">
          <dl>
            <Field label="Przedmiot umowy">{c.subject}</Field>
            <Field label="Wynagrodzenie">
              <span className="tabular-nums">{money}</span>
            </Field>
            <Field label="Inne określenie wynagrodzenia">{c.otherAmountDesc}</Field>
            <Field label="Termin płatności">{c.paymentTerm}</Field>
          </dl>
        </Section>

        <Section title="Terminy">
          <dl>
            <Field label="Data zawarcia">
              <span className="tabular-nums">{formatDate(c.dateStart)}</span>
            </Field>
            <Field label="Data zakończenia">
              <span className="tabular-nums">{formatDate(c.dateEnd)}</span>
              {end?.label && (
                <Badge tone={end.tone} className="ml-2">
                  {end.label}
                </Badge>
              )}
            </Field>
            <Field label="Okres wypowiedzenia">{c.noticePeriod}</Field>
          </dl>
        </Section>

        <Section title="Klasyfikacja dodatkowa">
          <dl>
            <Field label="Forma doręczenia">{c.deliveryForm}</Field>
            <Field label="Eksport/Import">{c.exportImport}</Field>
          </dl>
        </Section>

        <Section title="Strony">
          <dl>
            <Field label="Kontrahenci">
              {c.contractors.length
                ? c.contractors.map((k) => `${k.name}${k.nip ? ` (NIP ${k.nip})` : ""}`).join(", ")
                : null}
            </Field>
            <Field label="Właściciel umowy">
              {c.ownerIds.length ? c.ownerIds.map((o) => o.fullName).join(", ") : null}
            </Field>
          </dl>
        </Section>

        <Section title="Cechy">
          <div className="flex flex-wrap gap-2">
            <FlagChip on={c.weksel} label="Weksel" />
            <FlagChip on={c.companyConnected} label="Podmiot powiązane" />
            <FlagChip on={c.formularz} label="Formularz" />
            <FlagChip on={c.obsc} label="OBSC" />
          </div>
        </Section>
      </div>

      {/* Uwagi */}
      {c.remarks && (
        <Section title="Uwagi">
          <p className="whitespace-pre-line text-sm">{c.remarks}</p>
        </Section>
      )}

      {/* Aneksy */}
      <Section title="Aneksy">
        {hasAnnexLinks ? (
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

      {/* Załączniki (przez StorageAdapter) */}
      <Section title="Załączniki">
        {c.attachments.length === 0 ? (
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
        {/* Uwaga: funkcja „wyślij jako załącznik" świadomie POMINIĘTA na tym etapie. */}
      </Section>

      {/* Placeholdery sekcji z legacy */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="rounded-lg border border-dashed bg-muted/30 p-5">
          <h3 className="font-heading text-sm font-semibold">Notatki</h3>
          <p className="mt-1 text-sm text-muted-foreground">Brak uwag. (moduł w budowie)</p>
        </div>
        <div className="rounded-lg border border-dashed bg-muted/30 p-5">
          <h3 className="font-heading text-sm font-semibold">Formularz akceptacji umowy</h3>
          <p className="mt-1 text-sm text-muted-foreground">Workflow akceptacji — w budowie.</p>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        Zarejestrowano: {formatDate(c.createdAt)}
        {c.createdBy ? ` przez ${c.createdBy.fullName}` : ""} · Modyfikacja:{" "}
        {formatDate(c.modifiedAt)}
        {c.modifiedBy ? ` przez ${c.modifiedBy.fullName}` : ""}
      </div>
    </div>
  );
}

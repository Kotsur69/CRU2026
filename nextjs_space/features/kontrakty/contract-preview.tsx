import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { contractorLabel, formatDate, formatDateTime, formatMoney, userLabel } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { statusTone, endUrgency } from "@/lib/contract-status";
import { currentActor, canEditContract } from "@/lib/authz";
import { ContractActions } from "./contract-actions";

/**
 * Podgląd rekordu `contract`. Legacy trzyma Umowy, Projekty i Dział ryzyka w jednej
 * tabeli (rozróżnia je `contract_status.project`), więc ten sam ekran obsługuje
 * rejestr umów i rejestr ryzyka — różni je tylko odnośnik powrotny.
 */

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
      <div
        className={emphasize ? "mt-1 font-heading text-lg font-semibold" : "mt-1 text-sm font-medium"}
      >
        {children ?? "—"}
      </div>
    </div>
  );
}

function FlagChip({ on, label }: { on: boolean | null; label: string }) {
  // Tri-state in legacy: 1 / 0 / -1 ("nie określono") — null must not read as "no".
  if (on === null) return <Badge tone="neutral">? {label}</Badge>;
  return (
    <Badge tone={on ? "success" : "neutral"}>
      {on ? "✓" : "–"} {label}
    </Badge>
  );
}

export interface ContractPreviewProps {
  /** Legacy `contract.id`, already validated by the calling route. */
  id: number;
  backHref: string;
  backLabel: string;
}

export async function ContractPreview({ id, backHref, backLabel }: ContractPreviewProps) {
  const c = await prisma.contract.findUnique({
    where: { id },
    include: {
      documentType: true,
      status: true,
      businessline: true,
      company: true,
      primaryLocation: true,
      locations: { include: { location: true } },
      domain: true,
      nature: true,
      trade: true,
      currency: true,
      noticePeriod: true,
      deliveryMethod: true,
      contractor: true,
      debtor: true,
      acceptanceForm: true,
      parent: { select: { id: true, identifier: true } },
      annexes: {
        where: { isDeleted: false },
        orderBy: { identifier: "asc" },
        select: { id: true, identifier: true, documentType: { select: { name: true } } },
      },
      attachments: { orderBy: [{ isFinal: "desc" }, { id: "asc" }] },
      userAccess: {
        include: { user: { select: { id: true, firstName: true, lastName: true, login: true } } },
      },
      opinions: {
        where: { active: true },
        include: {
          opinionType: true,
          user: { select: { id: true, firstName: true, lastName: true, login: true } },
        },
      },
      remarkEntries: {
        where: { active: true },
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, firstName: true, lastName: true, login: true } } },
      },
      registeredBy: { select: { id: true, firstName: true, lastName: true, login: true } },
      modifiedBy: { select: { id: true, firstName: true, lastName: true, login: true } },
    },
  });

  if (!c || c.isDeleted) notFound();

  const actor = await currentActor();
  const canEdit = actor !== null && (await canEditContract(actor, c.id));

  const money = formatMoney(c.salary?.toString(), c.currency?.code?.toUpperCase());
  const end = endUrgency(c.dateEnd, c.status?.name);
  // Every contract_users row is an assignee — "Właściciel umowy" in legacy. `onlyRead`
  // grades editing rights within that set (see lib/contract-access.ts).
  const owners = c.userAccess.map((a) => userLabel(a.user));
  const editors = c.userAccess.filter((a) => !a.readOnly).map((a) => userLabel(a.user));
  // The primary location FK and the many-to-many table are both populated in legacy.
  const locations = Array.from(
    new Set(
      [c.primaryLocation?.name, ...c.locations.map((l) => l.location.name)].filter(
        (n): n is string => Boolean(n),
      ),
    ),
  );
  const hasAnnexLinks = Boolean(c.parent) || c.annexes.length > 0;
  // Parent and annexes stay inside the register the reader came from.
  const recordHref = (recordId: number) => `${backHref}/${recordId}`;

  return (
    <div className="max-w-5xl space-y-5">
      {/* Nagłówek */}
      <div>
        <Link href={backHref} className="text-sm text-muted-foreground hover:text-foreground">
          ← {backLabel}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold">{c.identifier ?? `#${c.id}`}</h1>
          <Badge tone={statusTone(c.status?.name)}>{c.status?.name ?? "—"}</Badge>
          {c.documentType?.name && <Badge tone="brand">{c.documentType.name}</Badge>}
          {c.parent && (
            <Badge tone="info">
              Aneks do{" "}
              <Link href={recordHref(c.parent.id)} className="underline">
                {c.parent.identifier ?? `#${c.parent.id}`}
              </Link>
            </Badge>
          )}
        </div>
        {c.description && <p className="mt-2 text-muted-foreground">{c.description}</p>}
      </div>

      {/* Pasek akcji — jak w legacy pod podglądem umowy (audyt 1.5). */}
      <ContractActions
        recordId={c.id}
        basePath={backHref}
        canEdit={canEdit}
        // Aneksy są cechą umów i projektów; rekordy Działu ryzyka ich nie mają.
        allowAnnexes={c.status?.kind !== "RISK"}
      />

      {/* Kluczowe fakty */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Fact label="Spółka">{c.company?.shortName}</Fact>
        <Fact label="Lokalizacja">
          {locations.length ? locations[0] : "—"}
          {locations.length > 1 && (
            <span className="text-muted-foreground"> +{locations.length - 1}</span>
          )}
        </Fact>
        <Fact label="Kontrahent">{c.contractor ? contractorLabel(c.contractor) : "—"}</Fact>
        <Fact label="Wynagrodzenie" emphasize>
          <span className="tabular-nums">{money}</span>
        </Fact>
        <Fact label="Okres obowiązywania">
          <span className="tabular-nums">
            {formatDate(c.dateBegin)} – {formatDate(c.dateEnd)}
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
            <Field label="Businessline">{c.businessline?.name}</Field>
            <Field label="Typ dokumentu">{c.documentType?.name}</Field>
            <Field label="Numer umowy">{c.contractReference}</Field>
            <Field label="Rodzaj umowy">{c.domain?.name}</Field>
            <Field label="Charakter umowy">{c.nature?.name}</Field>
            <Field label="Lokalizacje">{locations.length ? locations.join(", ") : null}</Field>
          </dl>
        </Section>

        <Section title="Warunki i finanse">
          <dl>
            <Field label="Przedmiot umowy">{c.description}</Field>
            <Field label="Wynagrodzenie">
              <span className="tabular-nums">{money}</span>
            </Field>
            <Field label="Waluta">{c.currency?.code?.toUpperCase()}</Field>
            <Field label="Inne określenie wynagrodzenia">{c.specificSalaryTerms}</Field>
            <Field label="Termin płatności">{c.paymentTerm}</Field>
          </dl>
        </Section>

        <Section title="Terminy">
          <dl>
            <Field label="Data zawarcia">
              <span className="tabular-nums">{formatDate(c.dateBegin)}</span>
            </Field>
            <Field label="Data zakończenia">
              {/* Brak daty JEST zapisem „na czas nieokreślony" — tak czyta to legacy. */}
              {c.dateEnd === null ? (
                "na czas nieokreślony"
              ) : (
                <span className="tabular-nums">{formatDate(c.dateEnd)}</span>
              )}
              {end?.label && (
                <Badge tone={end.tone} className="ml-2">
                  {end.label}
                </Badge>
              )}
            </Field>
            <Field label="Okres wypowiedzenia">{c.noticePeriod?.name}</Field>
            <Field label="Data wysłania do podpisu">
              <span className="tabular-nums">{formatDate(c.sentOn)}</span>
            </Field>
          </dl>
        </Section>

        <Section title="Klasyfikacja dodatkowa">
          <dl>
            <Field label="Forma doręczenia">{c.deliveryMethod?.name}</Field>
            <Field label="Eksport/Import">{c.trade?.name}</Field>
            <Field label="Opis OBSC">{c.obscDescription}</Field>
          </dl>
        </Section>

        <Section title="Strony">
          <dl>
            <Field label="Kontrahent">
              {c.contractor
                ? `${contractorLabel(c.contractor)}${c.contractor.vatId ? ` (NIP ${c.contractor.vatId})` : ""}`
                : null}
            </Field>
            <Field label="Dłużnik">{c.debtor ? contractorLabel(c.debtor) : null}</Field>
            <Field label="Właściciel umowy">{owners.length ? owners.join(", ") : null}</Field>
            <Field label="Prawo edycji">{editors.length ? editors.join(", ") : null}</Field>
          </dl>
        </Section>

        <Section title="Cechy">
          <div className="flex flex-wrap gap-2">
            <FlagChip on={c.bill} label="Weksel" />
            <FlagChip on={c.insuranceGuarantee} label="Gwarancja/ubezpieczenie" />
            <FlagChip on={c.companiesConnected} label="Podmioty powiązane" />
            <FlagChip on={c.tempForm} label="Formularz" />
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

      {/* Notatki — pełny wątek z legacy `remarks` */}
      <Section title="Notatki">
        {c.remarkEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak notatek.</p>
        ) : (
          <ul className="space-y-3">
            {c.remarkEntries.map((r) => (
              <li key={r.id} className="border-b border-border/60 pb-3 last:border-0 last:pb-0">
                <div className="text-xs text-muted-foreground">
                  {r.user ? userLabel(r.user) : "—"} ·{" "}
                  <span className="tabular-nums">{formatDateTime(r.createdAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-line text-sm">{r.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Aneksy */}
      <Section title="Aneksy">
        {hasAnnexLinks ? (
          <ul className="space-y-1 text-sm">
            {c.parent && (
              <li>
                Umowa nadrzędna:{" "}
                <Link href={recordHref(c.parent.id)} className="text-primary hover:underline">
                  {c.parent.identifier ?? `#${c.parent.id}`}
                </Link>
              </li>
            )}
            {c.annexes.map((a) => (
              <li key={a.id}>
                <Link href={recordHref(a.id)} className="text-primary hover:underline">
                  {a.identifier ?? `#${a.id}`}
                </Link>
                {a.documentType?.name && (
                  <span className="ml-2 text-muted-foreground">{a.documentType.name}</span>
                )}
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

      {/* Opinie (obieg FAU) */}
      <Section title="Opinie">
        {c.opinions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {c.opinionsRequested ? "Obieg opinii otwarty — brak wpisów." : "Nie zlecono opiniowania."}
          </p>
        ) : (
          <ul className="space-y-3">
            {c.opinions.map((o) => (
              <li key={o.id} className="border-b border-border/60 pb-3 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{o.opinionType?.name ?? "—"}</span>
                  <span>·</span>
                  <span>{o.user ? userLabel(o.user) : "—"}</span>
                  <Badge tone={o.signed ? "success" : "warning"}>
                    {o.signed ? `Podpisano ${formatDate(o.signedAt)}` : "Oczekuje"}
                  </Badge>
                </div>
                <p className="mt-1 whitespace-pre-line text-sm">{o.description}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Formularz akceptacji umowy (procedura MDR) */}
      <Section title="Formularz akceptacji umowy">
        {c.acceptanceForm ? (
          <dl>
            <Field label="Procedura MDR">{c.acceptanceForm.mdrProcedure ? "Tak" : "Nie"}</Field>
            <Field label="Weryfikacja wstępna">
              {c.acceptanceForm.initialVerification ? "Tak" : "Nie"}
            </Field>
            <Field label="Formularz wysłany">{c.acceptanceForm.formSent ? "Tak" : "Nie"}</Field>
            <Field label="Akceptacja właściciela">
              {c.acceptanceForm.ownerAccepted
                ? `Tak · ${formatDateTime(c.acceptanceForm.ownerAcceptedAt)}`
                : "Nie"}
            </Field>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Brak formularza akceptacji.</p>
        )}
      </Section>

      <div className="text-xs text-muted-foreground">
        Zarejestrowano: {formatDateTime(c.registeredAt)}
        {c.registeredBy ? ` przez ${userLabel(c.registeredBy)}` : ""} · Modyfikacja:{" "}
        {formatDateTime(c.modifiedAt)}
        {c.modifiedBy ? ` przez ${userLabel(c.modifiedBy)}` : ""}
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  contractorLabel,
  formatDate,
  formatDateTime,
  formatMoney,
  userLabel,
  yesNo,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { projectStatusTone, endUrgency } from "@/lib/contract-status";
import { currentActor, canEditContract } from "@/lib/authz";
import { ContractActions } from "@/features/kontrakty/contract-actions";

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
      <div
        className={emphasize ? "mt-1 font-heading text-lg font-semibold" : "mt-1 text-sm font-medium"}
      >
        {children ?? "—"}
      </div>
    </div>
  );
}

export default async function ProjektPreviewPage({ params }: { params: { id: string } }) {
  // Route params are untrusted: the legacy primary key is an integer, nothing else.
  const id = Number.parseInt(params.id, 10);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  // A project shares the `contract` table with contracts; the status kind is the
  // discriminator (see the audit, section 2). There is no separate Project model.
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
      acceptanceForm: true,
      parent: { select: { id: true, identifier: true } },
      annexes: {
        where: { isDeleted: false },
        orderBy: { identifier: "asc" },
        select: { id: true, identifier: true },
      },
      attachments: { orderBy: [{ isFinal: "desc" }, { id: "asc" }] },
      // Every contract_users row is an assignee; `onlyRead` grades editing rights and does
      // not decide ownership (see lib/contract-access.ts).
      userAccess: {
        orderBy: { readOnly: "asc" },
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
  // A contract reached through /projekty would render with the wrong status palette
  // and the wrong back link, so send it to its own module instead of guessing.
  if (c.status && c.status.kind !== "PROJECT") notFound();

  const money = formatMoney(c.salary?.toString(), c.currency?.code?.toUpperCase());
  const end = endUrgency(c.dateEnd, c.status?.name);
  const owners = c.userAccess.map((a) => userLabel(a.user));
  const reviewers = Array.from(
    new Set(
      c.opinions
        .map((o) => (o.user ? userLabel(o.user) : null))
        .filter((n): n is string => n !== null),
    ),
  );
  const locations = Array.from(
    new Set(
      [c.primaryLocation?.name, ...c.locations.map((l) => l.location.name)].filter(
        (n): n is string => Boolean(n),
      ),
    ),
  );
  const hasAnnexLinks = Boolean(c.parent) || c.annexes.length > 0;

  const actor = await currentActor();
  const canEdit = actor !== null && (await canEditContract(actor, c.id));

  return (
    <div className="max-w-5xl space-y-5">
      {/* Nagłówek */}
      <div>
        <Link href="/projekty" className="text-sm text-muted-foreground hover:text-foreground">
          ← Projekty
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold">{c.identifier ?? `#${c.id}`}</h1>
          <Badge tone={projectStatusTone(c.status?.name)}>{c.status?.name ?? "—"}</Badge>
          {c.documentType?.name && <Badge tone="brand">{c.documentType.name}</Badge>}
          {c.parent && (
            <Badge tone="info">
              Aneks do{" "}
              <Link href={`/umowy/${c.parent.id}`} className="underline">
                {c.parent.identifier ?? `#${c.parent.id}`}
              </Link>
            </Badge>
          )}
        </div>
        {c.description && <p className="mt-2 text-muted-foreground">{c.description}</p>}
      </div>

      {/* Pasek akcji — ten sam co przy umowie (audyt 1.5). */}
      <ContractActions recordId={c.id} basePath="/projekty" canEdit={canEdit} allowAnnexes />

      {/* Kluczowe fakty workflow */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Fact label="Opiniujący">{reviewers.length ? reviewers.join(", ") : "—"}</Fact>
        <Fact label="Data wysłania do podpisu">
          <span className="tabular-nums">{formatDate(c.sentOn)}</span>
        </Fact>
        <Fact label="Spółka">{c.company?.shortName}</Fact>
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
        <Section title="Workflow projektu">
          <dl>
            <Field label="Status">{c.status?.name}</Field>
            <Field label="Opiniujący">{reviewers.length ? reviewers.join(", ") : null}</Field>
            <Field label="Zlecono opiniowanie">{yesNo(c.opinionsRequested)}</Field>
            <Field label="Data wysłania do podpisu">
              <span className="tabular-nums">{formatDate(c.sentOn)}</span>
            </Field>
            <Field label="Ostatnia notatka">{c.remarkEntries[0]?.body ?? c.remarks}</Field>
            <Field label="Właściciel umowy">{owners.length ? owners.join(", ") : null}</Field>
          </dl>
        </Section>

        <Section title="Klasyfikacja">
          <dl>
            <Field label="Identyfikator">{c.identifier}</Field>
            <Field label="Businessline">{c.businessline?.name}</Field>
            <Field label="Spółka">{c.company?.shortName}</Field>
            <Field label="Typ dokumentu">{c.documentType?.name}</Field>
            <Field label="Numer umowy">{c.contractReference}</Field>
            <Field label="Rodzaj umowy">{c.domain?.name}</Field>
            <Field label="Charakter umowy">{c.nature?.name}</Field>
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
          </dl>
        </Section>

        <Section title="Klasyfikacja dodatkowa">
          <dl>
            <Field label="Forma doręczenia">{c.deliveryMethod?.name}</Field>
            <Field label="Eksport/Import">{c.trade?.name}</Field>
            <Field label="Lokalizacje">{locations.length ? locations.join(", ") : null}</Field>
          </dl>
        </Section>

        <Section title="Strony">
          <dl>
            <Field label="Kontrahent">
              {c.contractor
                ? `${contractorLabel(c.contractor)}${c.contractor.vatId ? ` (NIP ${c.contractor.vatId})` : ""}`
                : null}
            </Field>
          </dl>
        </Section>

        {/* Legacy podaje flagi wprost jako "Tak"/"Nie" — chipy z ✓/– były
            dwuznaczne przy braku danych, więc trzymamy się zapisu legacy. */}
        <Section title="Cechy">
          <dl>
            <Field label="Weksel">{yesNo(c.bill)}</Field>
            <Field label="Gwarancja/ubezpieczenie">{yesNo(c.insuranceGuarantee)}</Field>
            <Field label="Podmioty powiązane">{yesNo(c.companiesConnected)}</Field>
            <Field label="Formularz">{c.tempForm === null ? "—" : yesNo(c.tempForm)}</Field>
            <Field label="OBSC">{yesNo(c.obsc)}</Field>
          </dl>
        </Section>
      </div>

      {/* Uwagi — sekcja zawsze widoczna: legacy wypisuje etykietę także pustą,
          a jej zniknięcie czytano jako "brak takiego pola", nie "brak treści". */}
      <Section title="Uwagi">
        {c.remarks ? (
          <p className="whitespace-pre-line text-sm">{c.remarks}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Brak uwag.</p>
        )}
      </Section>

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

      {/* Aneksy do umowy */}
      <Section title="Aneksy do umowy">
        {hasAnnexLinks ? (
          <ul className="space-y-1 text-sm">
            {c.parent && (
              <li>
                Umowa nadrzędna:{" "}
                <Link href={`/umowy/${c.parent.id}`} className="text-primary hover:underline">
                  {c.parent.identifier ?? `#${c.parent.id}`}
                </Link>
              </li>
            )}
            {c.annexes.map((a) => (
              <li key={a.id}>
                <Link href={`/umowy/${a.id}`} className="text-primary hover:underline">
                  {a.identifier ?? `#${a.id}`}
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
      </Section>

      {/* Obieg FAU — opinie zaimportowane z legacy `opinions` */}
      <Section title="Obieg FAU (Formularz Akceptacji Umowy)">
        {c.acceptanceForm && (
          <dl className="mb-4">
            <Field label="Procedura MDR">{yesNo(c.acceptanceForm.mdrProcedure)}</Field>
            <Field label="Weryfikacja wstępna">{yesNo(c.acceptanceForm.initialVerification)}</Field>
            <Field label="Formularz wysłany">{yesNo(c.acceptanceForm.formSent)}</Field>
            <Field label="Akceptacja właściciela">
              {c.acceptanceForm.ownerAccepted
                ? `Tak · ${formatDateTime(c.acceptanceForm.ownerAcceptedAt)}`
                : "Nie"}
            </Field>
          </dl>
        )}

        {c.opinions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {c.opinionsRequested
              ? "Obieg opinii otwarty — brak wpisów."
              : "Nie zlecono opiniowania."}
          </p>
        ) : (
          <ul className="space-y-3">
            {c.opinions.map((o) => (
              <li key={o.id} className="border-b border-border/60 pb-3 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{o.opinionType?.name ?? "—"}</span>
                  <span>·</span>
                  <span>{o.user ? userLabel(o.user) : "—"}</span>
                  {/* `signed` jest 0 na wszystkich rekordach legacy — stan wynika z daty odpowiedzi. */}
                  <Badge tone={o.respondedAt ? "success" : "warning"}>
                    {o.respondedAt ? `Zaopiniowano ${formatDate(o.respondedAt)}` : "Oczekuje"}
                  </Badge>
                </div>
                <p className="mt-1 whitespace-pre-line text-sm">{o.description}</p>
              </li>
            ))}
          </ul>
        )}

      </Section>

      {/* Audyt — legacy podaje znacznik czasu co do sekundy oraz autora wpisu. */}
      <Section title="Audyt">
        <dl>
          <Field label="Data rejestracji">
            <span className="tabular-nums">{formatDateTime(c.registeredAt)}</span>
          </Field>
          <Field label="Zarejestrowano przez">
            {c.registeredBy ? userLabel(c.registeredBy) : null}
          </Field>
          <Field label="Data modyfikacji">
            <span className="tabular-nums">{formatDateTime(c.modifiedAt)}</span>
          </Field>
          <Field label="Modyfikowano przez">{c.modifiedBy ? userLabel(c.modifiedBy) : null}</Field>
        </dl>
      </Section>
    </div>
  );
}

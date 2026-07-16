import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatMoney, formatDate, yesNo } from "@/lib/format";

export const dynamic = "force-dynamic";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b py-2">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children ?? "—"}</dd>
    </div>
  );
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

  return (
    <div className="max-w-5xl">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/umowy" className="text-sm text-muted-foreground hover:text-foreground">
          ← Umowy
        </Link>
        <h1 className="font-heading text-2xl font-semibold">{c.identifier}</h1>
      </div>

      <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
        <dl>
          <Field label="Buissnesline">{c.businessline?.name}</Field>
          <Field label="Typ dokumentu">{c.documentType?.name}</Field>
          <Field label="Numer umowy">{c.contractNumber}</Field>
          <Field label="Status">{c.status?.name}</Field>
          <Field label="Spółka">{c.company?.name}</Field>
          <Field label="Lokalizacja">{c.location?.name}</Field>
          <Field label="Rodzaj umowy">{c.domain?.name}</Field>
          <Field label="Charakter umowy">{c.nature?.name}</Field>
          <Field label="Przedmiot umowy">{c.subject}</Field>
          <Field label="Forma doręczenia">{c.deliveryForm}</Field>
          <Field label="Eksport/Import">{c.exportImport}</Field>
          <Field label="Projekt">{c.project?.identifier}</Field>
        </dl>
        <dl>
          <Field label="Data zawarcia">{formatDate(c.dateStart)}</Field>
          <Field label="Data zakończenia">{formatDate(c.dateEnd)}</Field>
          <Field label="Okres wypowiedzenia">{c.noticePeriod}</Field>
          <Field label="Wynagrodzenie">
            {formatMoney(c.amount?.toString(), c.currency?.code?.toUpperCase())}
          </Field>
          <Field label="Inne określenie wynagrodzenia">{c.otherAmountDesc}</Field>
          <Field label="Termin płatności">{c.paymentTerm}</Field>
          <Field label="Weksel">{yesNo(c.weksel)}</Field>
          <Field label="Podmiot powiązane">{yesNo(c.companyConnected)}</Field>
          <Field label="Formularz">{yesNo(c.formularz)}</Field>
          <Field label="OBSC">{yesNo(c.obsc)}</Field>
          <Field label="Kontrahenci">
            {c.contractors.length
              ? c.contractors.map((k) => `${k.name}${k.nip ? ` (NIP ${k.nip})` : ""}`).join(", ")
              : "—"}
          </Field>
          <Field label="Właściciel umowy">
            {c.ownerIds.length ? c.ownerIds.map((o) => o.fullName).join(", ") : "—"}
          </Field>
        </dl>
      </div>

      <Field label="Uwagi">{c.remarks}</Field>

      {/* Sekcja: Załączniki (przez StorageAdapter) */}
      <section className="mt-6">
        <h2 className="font-heading text-lg font-semibold">Załączniki</h2>
        {c.attachments.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">Brak załączników.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {c.attachments.map((a) => (
              <li key={a.id}>
                <a
                  href={`/api/files/${encodeURIComponent(a.storageKey)}`}
                  className="text-primary hover:underline"
                >
                  {a.filename}
                </a>
                {a.isFinal && (
                  <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-xs text-accent-foreground">
                    Wersja ostateczna
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {/* Uwaga: funkcja „wyślij jako załącznik" świadomie POMINIĘTA na tym etapie. */}
      </section>

      {/* Placeholdery sekcji z legacy */}
      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-muted/30 p-4">
          <h3 className="font-heading text-sm font-semibold">Notatki</h3>
          <p className="mt-1 text-sm text-muted-foreground">Brak uwag. (moduł w budowie)</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-4">
          <h3 className="font-heading text-sm font-semibold">Formularz akceptacji umowy</h3>
          <p className="mt-1 text-sm text-muted-foreground">Workflow akceptacji — w budowie.</p>
        </div>
      </section>

      <div className="mt-6 text-xs text-muted-foreground">
        Zarejestrowano: {formatDate(c.createdAt)}
        {c.createdBy ? ` przez ${c.createdBy.fullName}` : ""} · Modyfikacja:{" "}
        {formatDate(c.modifiedAt)}
        {c.modifiedBy ? ` przez ${c.modifiedBy.fullName}` : ""}
      </div>
    </div>
  );
}

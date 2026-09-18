import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDateTime, formatMoney, userLabel } from "@/lib/format";
import { currentActor, canEditContract } from "@/lib/authz";
import { Button, buttonClass } from "@/components/ui/button";
import { PrintButton } from "./print-button";
import { saveAcceptanceForm } from "./actions";

/**
 * „Formularz akceptacji umowy" (FAU) i jego wersja do druku.
 *
 * UWAGA na zakres: ekranu FAU w legacy NIKT nie widział — audyt (sekcja 1.5) notuje go
 * jako [NIEZNANE], a w całym dumpie jest dokładnie JEDEN wiersz `acceptance_form`.
 * Nie odtwarzamy więc układu legacy, tylko wystawiamy pięć pól, które ta tabela realnie
 * ma, plus dane umowy potrzebne do podpisu. Gdy pojawi się dostęp do oryginału, ten
 * ekran trzeba będzie z nim porównać.
 */

const CHECKS = [
  { name: "mdrProcedure", label: "Procedura MDR" },
  { name: "initialVerification", label: "Weryfikacja wstępna" },
  { name: "formSent", label: "Formularz wysłany" },
  { name: "ownerAccepted", label: "Akceptacja właściciela umowy" },
] as const;

export interface AcceptanceFormPageProps {
  id: number;
  basePath: string;
  print: boolean;
}

export async function AcceptanceFormPage({ id, basePath, print }: AcceptanceFormPageProps) {
  const actor = await currentActor();
  if (!actor) redirect("/login");

  const contract = await prisma.contract.findUnique({
    where: { id },
    include: {
      acceptanceForm: true,
      company: true,
      contractor: true,
      currency: true,
      documentType: true,
      status: true,
      userAccess: {
        include: { user: { select: { id: true, firstName: true, lastName: true, login: true } } },
      },
    },
  });
  if (!contract || contract.isDeleted) notFound();

  const canEdit = await canEditContract(actor, id);
  const form = contract.acceptanceForm;
  const owners = contract.userAccess.map((a) => userLabel(a.user));
  const recordHref = `${basePath}/${id}`;

  const facts: [string, string][] = [
    ["Identyfikator", contract.identifier ?? `#${contract.id}`],
    ["Typ dokumentu", contract.documentType?.name ?? "—"],
    ["Status", contract.status?.name ?? "—"],
    ["Spółka", contract.company?.shortName ?? "—"],
    ["Kontrahent", contract.contractor?.shortName ?? contract.contractor?.fullName ?? "—"],
    ["Przedmiot umowy", contract.description ?? "—"],
    [
      "Wynagrodzenie",
      formatMoney(contract.salary?.toString(), contract.currency?.code?.toUpperCase()),
    ],
    ["Obowiązuje od", formatDate(contract.dateBegin)],
    ["Obowiązuje do", contract.dateEnd ? formatDate(contract.dateEnd) : "na czas nieokreślony"],
    ["Właściciel umowy", owners.length > 0 ? owners.join(", ") : "—"],
  ];

  if (print) {
    return (
      <div className="mx-auto max-w-3xl space-y-5 print:max-w-none">
        <div className="flex items-center justify-between gap-3 print:hidden">
          <Link href={recordHref} className="text-sm text-muted-foreground hover:text-foreground">
            ← Wróć do rekordu
          </Link>
          <PrintButton />
        </div>

        <header className="border-b pb-3">
          <h1 className="font-heading text-xl font-semibold">Formularz akceptacji umowy</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {contract.identifier ?? `#${contract.id}`}
          </p>
        </header>

        <dl>
          {facts.map(([label, value]) => (
            <div key={label} className="grid grid-cols-3 gap-3 border-b border-border/60 py-2">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="col-span-2 text-sm">{value}</dd>
            </div>
          ))}
          {CHECKS.map((check) => (
            <div key={check.name} className="grid grid-cols-3 gap-3 border-b border-border/60 py-2">
              <dt className="text-sm text-muted-foreground">{check.label}</dt>
              <dd className="col-span-2 text-sm">{form?.[check.name] ? "TAK" : "NIE"}</dd>
            </div>
          ))}
          <div className="grid grid-cols-3 gap-3 py-2">
            <dt className="text-sm text-muted-foreground">Data akceptacji</dt>
            <dd className="col-span-2 text-sm">{formatDateTime(form?.ownerAcceptedAt)}</dd>
          </div>
        </dl>

        <div className="grid grid-cols-2 gap-8 pt-10">
          {["Data i podpis właściciela umowy", "Data i podpis akceptującego"].map((caption) => (
            <div key={caption}>
              <div className="h-12 border-b border-dashed" />
              <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground print:hidden">
          Wydruk generuje przeglądarka (Ctrl+P → „Zapisz jako PDF"). Układ formularza z legacy
          nie był dostępny do audytu, więc to własna wersja na danych z{" "}
          <code>acceptance_form</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Link href={recordHref} className="text-sm text-muted-foreground hover:text-foreground">
          ← Wróć do rekordu
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-semibold">Formularz akceptacji umowy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {contract.identifier ?? `#${contract.id}`} · procedura MDR
        </p>
      </div>

      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <dl>
          {facts.map(([label, value]) => (
            <div
              key={label}
              className="grid grid-cols-3 gap-3 border-b border-border/60 py-2 last:border-0"
            >
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="col-span-2 text-sm">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <form action={saveAcceptanceForm} className="rounded-lg border bg-card p-5 shadow-sm">
        <input type="hidden" name="recordId" value={id} />
        <h2 className="mb-3 font-heading text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Stan akceptacji
        </h2>
        <div className="space-y-2">
          {CHECKS.map((check) => (
            <label key={check.name} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={check.name}
                value="1"
                defaultChecked={form?.[check.name] ?? false}
                disabled={!canEdit}
                className="h-4 w-4"
              />
              {check.label}
            </label>
          ))}
        </div>

        {form?.ownerAcceptedAt && (
          <p className="mt-3 text-xs text-muted-foreground">
            Zaakceptowano: {formatDateTime(form.ownerAcceptedAt)}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`${recordHref}/formularz-akceptacji?druk=1`}
            className={buttonClass("secondary")}
          >
            Wersja do druku (PDF)
          </Link>
          {canEdit && (
            <Button type="submit" variant="primary" className="ml-auto">
              Zapisz
            </Button>
          )}
        </div>

        {!canEdit && (
          <p className="mt-3 text-xs text-muted-foreground">
            Podgląd bez prawa edycji — stan akceptacji mogą zmieniać właściciele z prawem edycji
            oraz administratorzy.
          </p>
        )}
      </form>

      <p className="text-xs text-muted-foreground">
        Ekran FAU w legacy nie był dostępny z konta audytowego, a w danych jest tylko jeden
        wypełniony formularz. Pokazujemy pola, które tabela <code>acceptance_form</code> realnie
        ma — to nie jest odtworzony układ oryginału.
      </p>
    </div>
  );
}

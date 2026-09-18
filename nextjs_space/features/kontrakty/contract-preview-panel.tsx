"use client";

import { Button } from "@/components/ui/button";
import type { FormDictionaries, Option } from "@/lib/contracts/dictionaries";

/**
 * „Podgląd" — rekord tak, jak będzie wyglądał po zapisie. Czyta bieżące wartości
 * formularza (`FormData`), więc nie wymaga zapisu ani duplikowania stanu w formularzu.
 *
 * Kolejność wierszy idzie za ekranem podglądu w legacy: Businessline, Forma doręczenia,
 * Data wysłania do podpisu, Identyfikator, umowa nadrzędna, Typ dokumentu, Weksel…
 */

export interface PreviewPanelProps {
  data: FormData;
  dicts: FormDictionaries;
  /** Umowa nadrzędna aneksu — w legacy wiersz „Project / Umowy" z odnośnikiem. */
  parentLabel: string | null;
  /** Projekty mają „Datę wysłania do podpisu" i „Opiniującego"; umowy nie. */
  isProjectRecord: boolean;
  onClose: () => void;
}

export function PreviewPanel({
  data,
  dicts,
  parentLabel,
  isProjectRecord,
  onClose,
}: PreviewPanelProps) {
  const raw = (name: string) => {
    const v = data.get(name);
    return typeof v === "string" && v !== "" ? v : null;
  };
  const named = (options: Option[], name: string) => {
    const id = raw(name);
    return id ? (options.find((o) => o.id === id)?.name ?? id) : null;
  };
  const people = (name: string) =>
    data
      .getAll(name)
      .map((id) => dicts.people.find((p) => p.id === String(id))?.name ?? String(id))
      .join(", ");
  const yesNo = (name: string) => (raw(name) ? "Tak" : "Nie");

  const tempForm = raw("tempForm");
  const rows: [string, string | null][] = [
    ["Businessline", named(dicts.businesslines, "businesslineId")],
    ["Forma doręczenia", named(dicts.deliveryMethods, "deliveryMethodId")],
    ...(isProjectRecord
      ? ([["Data wysłania do podpisu", raw("sentOn")]] as [string, string | null][])
      : []),
    ["Identyfikator", raw("identifier")],
    ["Umowa nadrzędna", parentLabel],
    ["Typ dokumentu", named(dicts.documentTypes, "documentTypeId")],
    ["Weksel", yesNo("bill")],
    ["Numer umowy", raw("contractReference")],
    ["Status", named(dicts.statuses, "statusId")],
    ["Spółka", named(dicts.companies, "companyId")],
    ["Lokalizacja", named(dicts.locations, "primaryLocationId")],
    ["Rodzaj umowy", named(dicts.domains, "domainId")],
    ["Przedmiot umowy", raw("description")],
    ["Data zawarcia", raw("dateBegin")],
    // Brak daty zakończenia JEST zapisem „na czas nieokreślony" — tak pokazuje to legacy.
    ["Data zakończenia", raw("indefinite") ? "na czas nieokreślony" : raw("dateEnd")],
    ["Okres wypowiedzenia", named(dicts.noticePeriods, "noticePeriodId")],
    ["Wynagrodzenie", raw("salary")],
    ["Waluta", named(dicts.currencies, "currencyId")],
    ["Termin płatności", raw("paymentTerm")],
    ["Podmiot powiązane", yesNo("companiesConnected")],
    ["Inne określenie wynagrodzenia", raw("specificSalaryTerms")],
    ["Charakter umowy", named(dicts.natures, "natureId")],
    ["Eksport/Import", named(dicts.trades, "tradeId")],
    ["Formularz", tempForm === null ? "nie określono" : tempForm === "1" ? "Tak" : "Nie"],
    ["Uwagi", raw("remarks")],
    ["OBSC", yesNo("obsc")],
    ["Właściciel umowy", people("ownerIds") || null],
    ...(isProjectRecord
      ? ([["Opiniujący", people("reviewerIds") || null]] as [string, string | null][])
      : []),
  ];

  return (
    <section className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-heading text-sm font-semibold">Podgląd — rekord przed zapisem</h2>
        <Button onClick={onClose}>Wróć do edycji</Button>
      </div>
      <dl>
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="grid grid-cols-3 gap-3 border-b border-border/60 py-2 last:border-0"
          >
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="col-span-2 text-sm">{value ?? "—"}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        Podgląd nie zapisuje rekordu — wróć do edycji i użyj „Zapisz".
      </p>
    </section>
  );
}

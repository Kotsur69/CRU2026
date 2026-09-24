import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ClickableRow } from "@/components/ui/clickable-row";
import { Cell, DataTable, ListedNames, type DataColumn } from "@/components/ui/data-table";
import { riskStatusTone } from "@/lib/contract-status";
import { formatDate, formatMoney } from "@/lib/format";

// Rejestr Działu ryzyka (docs/features/08). Legacy trzyma te rekordy w tabeli `contract`
// z modułem RISK. Kolumny wybrane po tym, co w tych rekordach jest faktycznie wypełnione:
// „Przedmiot" jest pusty na wszystkich 406, więc go nie ma; dłużnik i kwota są nośne.
export interface RiskRow {
  id: number;
  identifier: string;
  statusName: string | null;
  company: string | null;
  /** Null, gdy dłużnikiem jest sam kontrahent — 192 z 406 rekordów. */
  debtor: string | null;
  debtorIsContractor: boolean;
  contractor: string | null;
  domain: string | null;
  amount: string | null;
  currencyCode: string | null;
  dateBegin: string | null;
  dateEnd: string | null;
  owners: string[];
}

const COLUMNS: DataColumn[] = [
  { id: "identifier", label: "Identyfikator" },
  { id: "status", label: "Status" },
  { id: "company", label: "Spółka" },
  { id: "debtor", label: "Dłużnik" },
  { id: "contractor", label: "Kontrahent" },
  { id: "domain", label: "Rodzaj" },
  { id: "amount", label: "Kwota", align: "right" },
  { id: "dateBegin", label: "Od" },
  { id: "dateEnd", label: "Do" },
  { id: "owners", label: "Właściciel" },
];

export function RiskTable({ records }: { records: RiskRow[] }) {
  return (
    <DataTable
      columns={COLUMNS}
      isEmpty={records.length === 0}
      emptyTitle="Brak rekordów spełniających kryteria."
    >
      {records.map((r) => (
        <ClickableRow key={r.id} href={`/ryzyko/${r.id}`}>
          <Cell>
            <Link href={`/ryzyko/${r.id}`} className="font-medium text-primary hover:underline">
              {r.identifier}
            </Link>
          </Cell>
          <Cell>
            <Badge tone={riskStatusTone(r.statusName)}>{r.statusName ?? "—"}</Badge>
          </Cell>
          <Cell>{r.company ?? "—"}</Cell>
          <Cell>
            {r.debtorIsContractor ? (
              <span className="text-muted-foreground" title="Dłużnikiem jest sam kontrahent">
                — (ten sam)
              </span>
            ) : (
              (r.debtor ?? "—")
            )}
          </Cell>
          <Cell>{r.contractor ?? "—"}</Cell>
          <Cell>{r.domain ? <Badge tone="neutral">{r.domain}</Badge> : "—"}</Cell>
          <Cell align="right" className="whitespace-nowrap tabular-nums">
            {formatMoney(r.amount, r.currencyCode)}
          </Cell>
          <Cell className="tabular-nums">{formatDate(r.dateBegin)}</Cell>
          <Cell className="tabular-nums">{formatDate(r.dateEnd)}</Cell>
          <Cell>
            <ListedNames names={r.owners} />
          </Cell>
        </ClickableRow>
      ))}
    </DataTable>
  );
}

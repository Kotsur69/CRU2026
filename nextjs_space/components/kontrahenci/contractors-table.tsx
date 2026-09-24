import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ClickableRow } from "@/components/ui/clickable-row";
import { Cell, DataTable, Truncated, type DataColumn } from "@/components/ui/data-table";

// Słownik kontrahentów (legacy `contractor`, docs/features/20). NIP i KRS są tu kluczem
// wyszukiwania, a liczba umów mówi, czy wpis jest żywy, czy to pozostałość po imporcie.
// Cechy (CEIDG, powiązany, usunięty) idą znacznikami pod nazwą, a duplikat NIP-u —
// w komórce NIP, nie we własnej kolumnie.
export interface ContractorRow {
  id: number;
  shortName: string | null;
  fullName: string | null;
  address: string | null;
  vatId: string | null;
  register: string | null;
  isCeidg: boolean;
  isConnected: boolean;
  isDeleted: boolean;
  contractCount: number;
  attachmentCount: number;
  /** Ile wpisów ma ten sam NIP (po cyfrach), licząc ten; null, gdy numer jest jedyny. */
  duplicateCount: number | null;
}

const COLUMNS: DataColumn[] = [
  { id: "shortName", label: "Nazwa skrócona" },
  { id: "fullName", label: "Nazwa pełna" },
  { id: "vatId", label: "NIP" },
  { id: "register", label: "KRS" },
  { id: "address", label: "Adres" },
  { id: "contracts", label: "Umowy", align: "right" },
  { id: "attachments", label: "Załączniki", align: "right" },
];

export function ContractorsTable({ contractors }: { contractors: ContractorRow[] }) {
  return (
    <DataTable
      columns={COLUMNS}
      isEmpty={contractors.length === 0}
      emptyTitle="Brak kontrahentów spełniających kryteria."
    >
      {contractors.map((k) => (
        <ClickableRow key={k.id} href={`/kontrahenci/${k.id}`}>
          <Cell>
            <Link
              href={`/kontrahenci/${k.id}`}
              className="font-medium text-primary hover:underline"
            >
              {k.shortName ?? k.fullName ?? `#${k.id}`}
            </Link>
            {(k.isCeidg || k.isConnected || k.isDeleted) && (
              <div className="mt-1 flex flex-wrap gap-1">
                {k.isCeidg && <Badge tone="info">CEIDG</Badge>}
                {k.isConnected && <Badge tone="brand">Powiązany</Badge>}
                {k.isDeleted && <Badge tone="danger">Usunięty</Badge>}
              </div>
            )}
          </Cell>
          <Cell>{k.fullName ?? "—"}</Cell>
          <Cell className="whitespace-nowrap tabular-nums">
            {k.vatId ?? "—"}
            {k.duplicateCount !== null && (
              <div className="mt-1" title={`Wpisów z tym NIP-em: ${k.duplicateCount}`}>
                <Badge tone="warning">duplikat NIP ({k.duplicateCount})</Badge>
              </div>
            )}
          </Cell>
          <Cell>{k.register ?? "—"}</Cell>
          <Cell>
            <Truncated text={k.address} />
          </Cell>
          <Cell align="right" className="tabular-nums">
            {k.contractCount}
          </Cell>
          <Cell align="right" className="tabular-nums">
            {k.attachmentCount}
          </Cell>
        </ClickableRow>
      ))}
    </DataTable>
  );
}

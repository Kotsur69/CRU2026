import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ClickableRow } from "@/components/ui/clickable-row";

// Słownik kontrahentów (legacy `contractor`). Kolumny odpowiadają polom, które dump
// faktycznie wypełnia — NIP i rejestr są tu kluczem wyszukiwania, a liczba umów mówi,
// czy wpis jest żywy, czy to pozostałość po imporcie.
export interface ContractorRow {
  id: number;
  shortName: string | null;
  fullName: string | null;
  address: string | null;
  vatId: string | null;
  register: string | null;
  cruIdentifier: string | null;
  isCeidg: boolean;
  isConnected: boolean;
  isDeleted: boolean;
  contractCount: number;
  attachmentCount: number;
}

export function ContractorsTable({ contractors }: { contractors: ContractorRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border shadow-sm">
      <table className="w-full text-xs">
        <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 font-semibold">Nazwa skrócona</th>
            <th className="px-2 py-1.5 font-semibold">Pełna nazwa</th>
            <th className="px-2 py-1.5 font-semibold">NIP</th>
            <th className="px-2 py-1.5 font-semibold">Rejestr / KRS</th>
            <th className="px-2 py-1.5 font-semibold">Identyfikator CRU</th>
            <th className="px-2 py-1.5 font-semibold">Cechy</th>
            <th className="px-2 py-1.5 text-right font-semibold">Umowy</th>
            <th className="px-2 py-1.5 text-right font-semibold">Załączniki</th>
          </tr>
        </thead>
        <tbody>
          {contractors.length === 0 && (
            <tr>
              <td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">
                <p className="font-medium text-foreground">
                  Brak kontrahentów spełniających kryteria
                </p>
                <p className="mt-1 text-sm">Zmień lub wyczyść filtry wyszukiwania powyżej.</p>
              </td>
            </tr>
          )}
          {contractors.map((k) => (
            <ClickableRow key={k.id} href={`/kontrahenci/${k.id}`}>
              <td className="whitespace-normal break-words px-2 py-1.5 align-top">
                <Link
                  href={`/kontrahenci/${k.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {k.shortName ?? k.fullName ?? `#${k.id}`}
                </Link>
              </td>
              <td className="whitespace-normal break-words px-2 py-1.5 align-top">
                {k.fullName ?? "—"}
              </td>
              <td className="px-2 py-1.5 align-top tabular-nums">{k.vatId ?? "—"}</td>
              <td className="whitespace-normal break-words px-2 py-1.5 align-top">
                {k.register ?? "—"}
              </td>
              <td className="px-2 py-1.5 align-top">{k.cruIdentifier ?? "—"}</td>
              <td className="px-2 py-1.5 align-top">
                <div className="flex flex-wrap gap-1">
                  {k.isCeidg && <Badge tone="info">CEIDG</Badge>}
                  {k.isConnected && <Badge tone="brand">Powiązany</Badge>}
                  {k.isDeleted && <Badge tone="danger">Usunięty</Badge>}
                  {!k.isCeidg && !k.isConnected && !k.isDeleted && (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </td>
              <td className="px-2 py-1.5 text-right align-top tabular-nums">{k.contractCount}</td>
              <td className="px-2 py-1.5 text-right align-top tabular-nums">{k.attachmentCount}</td>
            </ClickableRow>
          ))}
        </tbody>
      </table>
    </div>
  );
}

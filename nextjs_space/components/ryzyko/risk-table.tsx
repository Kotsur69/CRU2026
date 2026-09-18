import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ClickableRow } from "@/components/ui/clickable-row";
import { riskStatusTone } from "@/lib/contract-status";
import { formatDate, formatMoney } from "@/lib/format";

// Rejestr Działu ryzyka. Legacy trzyma te rekordy w tabeli `contract` — odróżnia je
// `contract_status.project = 2`. Kolumny wybrane po tym, co w tych rekordach jest
// faktycznie wypełnione: dłużnik (`debtor_id`) i rodzaj ryzyka (`contract_domain.type = 2`)
// są tu nośne, w przeciwieństwie do rejestru umów.
export interface RiskRow {
  id: number;
  identifier: string;
  statusName: string | null;
  company: string | null;
  debtor: string | null;
  contractor: string | null;
  domain: string | null;
  subject: string | null;
  amount: string | null;
  currencyCode: string | null;
  dateBegin: string | null;
  dateEnd: string | null;
  owners: string[];
}

function Truncated({ text }: { text: string | null }) {
  if (!text) return <>—</>;
  return <span className="block max-w-[18rem] whitespace-normal break-words">{text}</span>;
}

function ListedNames({ names }: { names: string[] }) {
  if (names.length === 0) return <>—</>;
  const [first, ...rest] = names;
  return (
    <span title={names.join(", ")}>
      {first}
      {rest.length > 0 && <span className="text-muted-foreground"> +{rest.length}</span>}
    </span>
  );
}

export function RiskTable({ records }: { records: RiskRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border shadow-sm">
      <table className="w-full text-xs">
        <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 font-semibold">Identyfikator</th>
            <th className="px-2 py-1.5 font-semibold">Status</th>
            <th className="px-2 py-1.5 font-semibold">Spółka</th>
            <th className="px-2 py-1.5 font-semibold">Dłużnik</th>
            <th className="px-2 py-1.5 font-semibold">Kontrahent</th>
            <th className="px-2 py-1.5 font-semibold">Rodzaj</th>
            <th className="px-2 py-1.5 font-semibold">Przedmiot</th>
            <th className="px-2 py-1.5 text-right font-semibold">Kwota</th>
            <th className="px-2 py-1.5 font-semibold">Od</th>
            <th className="px-2 py-1.5 font-semibold">Do</th>
            <th className="px-2 py-1.5 font-semibold">Właściciel</th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 && (
            <tr>
              <td colSpan={11} className="px-3 py-12 text-center text-muted-foreground">
                <p className="font-medium text-foreground">Brak rekordów spełniających kryteria</p>
                <p className="mt-1 text-sm">Zmień lub wyczyść filtry wyszukiwania powyżej.</p>
              </td>
            </tr>
          )}
          {records.map((r) => (
            <ClickableRow key={r.id} href={`/ryzyko/${r.id}`}>
              <td className="whitespace-normal break-words px-2 py-1.5 align-top">
                <Link href={`/ryzyko/${r.id}`} className="font-medium text-primary hover:underline">
                  {r.identifier}
                </Link>
              </td>
              <td className="px-2 py-1.5 align-top">
                <Badge tone={riskStatusTone(r.statusName)}>{r.statusName ?? "—"}</Badge>
              </td>
              <td className="px-2 py-1.5 align-top">{r.company ?? "—"}</td>
              <td className="whitespace-normal break-words px-2 py-1.5 align-top">
                {r.debtor ?? "—"}
              </td>
              <td className="whitespace-normal break-words px-2 py-1.5 align-top">
                {r.contractor ?? "—"}
              </td>
              <td className="whitespace-normal break-words px-2 py-1.5 align-top">
                {r.domain ?? "—"}
              </td>
              <td className="px-2 py-1.5 align-top">
                <Truncated text={r.subject} />
              </td>
              <td className="px-2 py-1.5 text-right align-top tabular-nums">
                {formatMoney(r.amount, r.currencyCode)}
              </td>
              <td className="px-2 py-1.5 align-top tabular-nums">{formatDate(r.dateBegin)}</td>
              <td className="px-2 py-1.5 align-top tabular-nums">{formatDate(r.dateEnd)}</td>
              <td className="whitespace-normal break-words px-2 py-1.5 align-top">
                <ListedNames names={r.owners} />
              </td>
            </ClickableRow>
          ))}
        </tbody>
      </table>
    </div>
  );
}

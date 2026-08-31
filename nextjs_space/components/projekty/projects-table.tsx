import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ClickableRow } from "@/components/ui/clickable-row";
import { projectStatusTone } from "@/lib/contract-status";
import { formatDate } from "@/lib/format";

// Wiersz projektu zserializowany po stronie serwera. Kolumny stałe (bez chooser'a —
// legacy nie dokumentuje panelu wyboru kolumn dla siatki Projektów, w przeciwieństwie
// do Umów), 1:1 z audytem (historia_wersji/audyt_legacy_strony.md, sekcja 2.3).
export interface ProjectRow {
  id: number;
  identifier: string;
  statusName: string | null;
  owners: string[];
  contractors: string[];
  subject: string | null;
  lastNote: string | null;
  reviewer: string | null;
  sentToSign: string | null;
}

function Truncated({ text }: { text: string | null }) {
  if (!text) return <>—</>;
  return <span className="block max-w-[16rem] whitespace-normal break-words">{text}</span>;
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

export function ProjectsTable({ projects }: { projects: ProjectRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border shadow-sm">
      <table className="w-full text-xs">
        <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 font-semibold">Identyfikator</th>
            <th className="px-2 py-1.5 font-semibold">Status</th>
            <th className="px-2 py-1.5 font-semibold">Właściciel umowy</th>
            <th className="px-2 py-1.5 font-semibold">Kontrahenci</th>
            <th className="px-2 py-1.5 font-semibold">Przedmiot umowy</th>
            <th className="px-2 py-1.5 font-semibold">Ostatnia notatka</th>
            <th className="px-2 py-1.5 font-semibold">Opiniujący</th>
            <th className="px-2 py-1.5 font-semibold">Wysł. do podp.</th>
          </tr>
        </thead>
        <tbody>
          {projects.length === 0 && (
            <tr>
              <td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">
                <p className="font-medium text-foreground">Brak projektów spełniających kryteria</p>
                <p className="mt-1 text-sm">Zmień lub wyczyść filtry wyszukiwania powyżej.</p>
              </td>
            </tr>
          )}
          {projects.map((p) => (
            <ClickableRow key={p.id} href={`/projekty/${p.id}`}>
              <td className="whitespace-normal break-words px-2 py-1.5 align-top">
                <Link href={`/projekty/${p.id}`} className="font-medium text-primary hover:underline">
                  {p.identifier}
                </Link>
              </td>
              <td className="whitespace-normal break-words px-2 py-1.5 align-top">
                <Badge tone={projectStatusTone(p.statusName)}>{p.statusName ?? "—"}</Badge>
              </td>
              <td className="whitespace-normal break-words px-2 py-1.5 align-top">
                <ListedNames names={p.owners} />
              </td>
              <td className="whitespace-normal break-words px-2 py-1.5 align-top">
                <ListedNames names={p.contractors} />
              </td>
              <td className="whitespace-normal break-words px-2 py-1.5 align-top">
                <Truncated text={p.subject} />
              </td>
              <td className="whitespace-normal break-words px-2 py-1.5 align-top">
                <Truncated text={p.lastNote} />
              </td>
              <td className="whitespace-normal break-words px-2 py-1.5 align-top">{p.reviewer ?? "—"}</td>
              <td className="whitespace-normal break-words px-2 py-1.5 align-top">
                <span className="tabular-nums">{formatDate(p.sentToSign)}</span>
              </td>
            </ClickableRow>
          ))}
        </tbody>
      </table>
    </div>
  );
}

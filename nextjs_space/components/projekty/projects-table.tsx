import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ClickableRow } from "@/components/ui/clickable-row";
import { ColumnChooser } from "@/components/ui/column-chooser";
import { Cell, DataTable, ListedNames, Truncated } from "@/components/ui/data-table";
import { projectStatusTone } from "@/lib/contract-status";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  PROJECT_COLUMN_DEFS,
  PROJECT_COLUMN_STORAGE_KEY,
  type ProjectColumnId,
} from "@/lib/projekty-columns";

// Lista Projektów — osiem kolumn legacy (audyt §2.3) plus opcjonalna „Umowa".
// Trzy z nich („Ostatnia notatka", „Opiniujący", „Wysł. do podp.") to elementy obiegu,
// których lista Umów nie ma.

export interface ProjectReviewer {
  name: string;
  /** Opiniujący, który już odpowiedział. Oczekujący są wyszarzeni — to oni wstrzymują obieg. */
  answered: boolean;
}

export interface ProjectRow {
  id: number;
  identifier: string;
  statusName: string | null;
  owners: string[];
  contractors: string[];
  subject: string | null;
  lastNote: { body: string | null; createdAt: string } | null;
  reviewers: ProjectReviewer[];
  sentToSign: string | null;
  /** Umowa, którą projekt się stał (`parent` z modułu CONTRACT). */
  contract: { id: number; identifier: string } | null;
}

const TABLE_ID = "projekty-table";

function cellFor(col: ProjectColumnId, p: ProjectRow) {
  switch (col) {
    case "identifier":
      return (
        <span className="flex flex-wrap items-center gap-1">
          <Link href={`/projekty/${p.id}`} className="font-medium text-primary hover:underline">
            {p.identifier}
          </Link>
          {p.statusName === null && <Badge tone="warning">brak statusu</Badge>}
        </span>
      );
    case "status":
      return p.statusName ? (
        <Badge tone={projectStatusTone(p.statusName)}>{p.statusName}</Badge>
      ) : (
        "—"
      );
    case "owners":
      return <ListedNames names={p.owners} />;
    case "contractors":
      return <ListedNames names={p.contractors} />;
    case "subject":
      return <Truncated text={p.subject} />;
    case "lastNote":
      return (
        <Truncated
          text={p.lastNote?.body ?? null}
          title={p.lastNote ? formatDateTime(p.lastNote.createdAt) : undefined}
        />
      );
    case "reviewers":
      if (p.reviewers.length === 0) return "—";
      return (
        <span>
          {p.reviewers.map((r, i) => (
            <span
              key={`${r.name}-${i}`}
              className={r.answered ? undefined : "text-muted-foreground"}
              title={r.answered ? "Zaopiniowano" : "Oczekuje"}
            >
              {r.name}
              {i < p.reviewers.length - 1 ? ", " : ""}
            </span>
          ))}
        </span>
      );
    case "sentToSign":
      return <span className="tabular-nums">{formatDate(p.sentToSign)}</span>;
    case "contract":
      return p.contract ? (
        <Link href={`/umowy/${p.contract.id}`} className="text-primary hover:underline">
          {p.contract.identifier}
        </Link>
      ) : (
        "—"
      );
  }
}

export function ProjectsTable({ projects }: { projects: ProjectRow[] }) {
  return (
    <div>
      <ColumnChooser
        tableId={TABLE_ID}
        storageKey={PROJECT_COLUMN_STORAGE_KEY}
        columns={PROJECT_COLUMN_DEFS}
      />
      <DataTable
        id={TABLE_ID}
        columns={PROJECT_COLUMN_DEFS}
        isEmpty={projects.length === 0}
        emptyTitle="Brak projektów spełniających kryteria."
      >
        {projects.map((p) => (
          <ClickableRow key={p.id} href={`/projekty/${p.id}`}>
            {PROJECT_COLUMN_DEFS.map((col) => (
              <Cell key={col.id} col={col.id}>
                {cellFor(col.id, p)}
              </Cell>
            ))}
          </ClickableRow>
        ))}
      </DataTable>
    </div>
  );
}

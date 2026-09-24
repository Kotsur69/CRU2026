import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ClickableRow } from "@/components/ui/clickable-row";
import { ColumnChooser } from "@/components/ui/column-chooser";
import { Cell, DataTable, ListedNames, Truncated } from "@/components/ui/data-table";
import { statusTone, endUrgency } from "@/lib/contract-status";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { COLUMN_DEFS, COLUMN_STORAGE_KEY, type ColumnId } from "@/lib/umowy-columns";
import type { RowPermission } from "@/lib/authz";

/**
 * Lista Umów. Tabela renderuje się na serwerze ze wszystkimi kolumnami; wybór widocznych
 * robi wyspa kliencka `ColumnChooser`, więc formatowanie nie jedzie do przeglądarki.
 */

export interface ContractRow {
  id: number;
  identifier: string;
  documentType: string | null;
  contractNumber: string | null;
  statusName: string | null;
  company: string | null;
  location: string | null;
  companyConnected: boolean;
  nature: string | null;
  subject: string | null;
  dateStart: string | null;
  dateEnd: string | null;
  noticePeriod: string | null;
  amount: string | null;
  currencyCode: string | null;
  obsc: boolean;
  owners: string[];
  businessline: string | null;
  contractors: string[];
  otherAmountDesc: string | null;
  domain: string | null;
  formularz: boolean;
  remarks: string | null;
  permission: RowPermission;
  /** Rekord jest aneksem innej umowy. */
  isAnnex: boolean;
  /** Aneksy tej umowy — bez projektów, które też wiszą na `parentId` (docs/features/07). */
  annexCount: number;
  attachmentsCount: number;
}

const TABLE_ID = "umowy-table";

function IconPaperclip() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M19 11.5 11.5 19a4 4 0 0 1-5.7-5.7L14 5.2a2.7 2.7 0 1 1 3.8 3.8L9.6 17.2a1.3 1.3 0 1 1-1.9-1.9l7.1-7.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M9 12h6M10 17H7a4 4 0 1 1 0-8h3M14 7h3a4 4 0 1 1 0 8h-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FlagMark({ on }: { on: boolean }) {
  return on ? (
    <span className="font-medium text-emerald-600">✓</span>
  ) : (
    <span className="text-muted-foreground">–</span>
  );
}

const PERMISSION: Record<RowPermission, { label: string; tone: "success" | "neutral" | "warning"; title: string }> = {
  edit: { label: "edycja", tone: "success", title: "Możesz edytować ten rekord" },
  read: { label: "odczyt", tone: "neutral", title: "Podgląd bez prawa edycji" },
  frozen: {
    label: "zamrożony",
    tone: "warning",
    title: "Rekord zamrożony w legacy (edittable = 0) — edytuje tylko administrator",
  },
};

function cellFor(col: ColumnId, c: ContractRow) {
  switch (col) {
    case "identifier":
      return (
        <Link href={`/umowy/${c.id}`} className="font-medium text-primary hover:underline">
          {c.identifier}
        </Link>
      );
    case "documentType":
      return c.documentType ?? "—";
    case "contractNumber":
      return <span className="tabular-nums">{c.contractNumber ?? "—"}</span>;
    case "status":
      return <Badge tone={statusTone(c.statusName)}>{c.statusName ?? "—"}</Badge>;
    case "company":
      return c.company ?? "—";
    case "location":
      return c.location ?? "—";
    case "companyConnected":
      return <FlagMark on={c.companyConnected} />;
    case "nature":
      return c.nature ?? "—";
    case "subject":
      return <Truncated text={c.subject} className="max-w-[14rem]" />;
    case "dateStart":
      return <span className="tabular-nums">{formatDate(c.dateStart)}</span>;
    case "dateEnd": {
      if (!c.dateEnd) return "—";
      const end = endUrgency(new Date(c.dateEnd), c.statusName);
      return (
        <div className="flex flex-col items-start gap-1">
          <span className={cn("tabular-nums", end?.tone === "danger" && "font-medium text-red-700")}>
            {formatDate(c.dateEnd)}
          </span>
          {end?.label && <Badge tone={end.tone}>{end.label}</Badge>}
        </div>
      );
    }
    case "noticePeriod":
      return c.noticePeriod ?? "—";
    case "amount":
      return <span className="tabular-nums">{formatMoney(c.amount, c.currencyCode)}</span>;
    case "obsc":
      return <FlagMark on={c.obsc} />;
    case "currency":
      return c.currencyCode ?? "—";
    case "owners":
      return <ListedNames names={c.owners} />;
    case "businessline":
      return c.businessline ?? "—";
    case "contractors":
      return <ListedNames names={c.contractors} />;
    case "otherAmountDesc":
      return <Truncated text={c.otherAmountDesc} className="max-w-[14rem]" />;
    case "domain":
      return c.domain ?? "—";
    case "formularz":
      return <FlagMark on={c.formularz} />;
    case "remarks":
      return <Truncated text={c.remarks} className="max-w-[14rem]" />;
    case "permition": {
      const p = PERMISSION[c.permission];
      return (
        <span title={p.title}>
          <Badge tone={p.tone}>{p.label}</Badge>
        </span>
      );
    }
    case "annex":
      if (c.isAnnex) {
        return (
          <Badge tone="info" className="gap-1">
            <IconLink /> Aneks
          </Badge>
        );
      }
      if (c.annexCount > 0) {
        return (
          <Badge tone="brand" className="gap-1">
            <IconLink /> {c.annexCount}
          </Badge>
        );
      }
      return "—";
    case "attachments":
      return c.attachmentsCount > 0 ? (
        <span className="inline-flex items-center gap-1">
          <IconPaperclip /> {c.attachmentsCount}
        </span>
      ) : (
        "—"
      );
    default:
      return "—";
  }
}

export function ContractsTable({ contracts }: { contracts: ContractRow[] }) {
  return (
    <div>
      <ColumnChooser
        tableId={TABLE_ID}
        storageKey={COLUMN_STORAGE_KEY}
        columns={COLUMN_DEFS.map(({ id, label, defaultVisible, locked }) => ({
          id,
          label,
          defaultVisible,
          locked,
        }))}
      />
      <DataTable
        id={TABLE_ID}
        columns={COLUMN_DEFS}
        isEmpty={contracts.length === 0}
        emptyTitle="Brak umów spełniających kryteria."
      >
        {contracts.map((c) => (
          <ClickableRow key={c.id} href={`/umowy/${c.id}`}>
            {COLUMN_DEFS.map((col) => (
              <Cell key={col.id} col={col.id} align={col.align}>
                {cellFor(col.id, c)}
              </Cell>
            ))}
          </ClickableRow>
        ))}
      </DataTable>
    </div>
  );
}

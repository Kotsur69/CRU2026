"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ClickableRow } from "@/components/ui/clickable-row";
import { statusTone, endUrgency } from "@/lib/contract-status";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { COLUMN_DEFS, type ColumnId } from "@/lib/umowy-columns";
import { ColumnChooserPanel, useColumnVisibility } from "./column-chooser";

// Wiersz umowy zserializowany po stronie serwera (Decimal/Date -> string, żeby bezpiecznie
// przejść granicę Server -> Client Component).
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
  hasParent: boolean;
  annexCount: number;
  attachmentsCount: number;
}

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

function Truncated({ text, className }: { text: string | null; className?: string }) {
  if (!text) return <>—</>;
  return (
    <span className={cn("block max-w-[14rem] whitespace-normal break-words", className)}>
      {text}
    </span>
  );
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

function cellFor(col: ColumnId, c: ContractRow) {
  const end = endUrgency(c.dateEnd ? new Date(c.dateEnd) : null, c.statusName);

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
      return <Truncated text={c.subject} />;
    case "dateStart":
      return <span className="tabular-nums">{formatDate(c.dateStart)}</span>;
    case "dateEnd":
      return c.dateEnd ? (
        <div className="flex flex-col items-start gap-1">
          <span className={cn("tabular-nums", end?.tone === "danger" && "font-medium text-red-700")}>
            {formatDate(c.dateEnd)}
          </span>
          {end?.label && <Badge tone={end.tone}>{end.label}</Badge>}
        </div>
      ) : (
        "—"
      );
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
      return <Truncated text={c.otherAmountDesc} />;
    case "domain":
      return c.domain ?? "—";
    case "formularz":
      return <FlagMark on={c.formularz} />;
    case "remarks":
      return <Truncated text={c.remarks} />;
    case "permition":
      return (
        <span className="text-xs text-muted-foreground" title="Moduł uprawnień w budowie">
          —
        </span>
      );
    case "annex":
      if (c.hasParent) {
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

const RIGHT_ALIGN: ColumnId[] = ["amount"];
const CENTER_ALIGN: ColumnId[] = ["obsc", "companyConnected", "formularz"];

// Rozmiar panelu (2 kolumny checkboxów) — używany do decyzji, w którą stronę go otworzyć,
// żeby zawsze mieścił się w oknie niezależnie od miejsca kliknięcia.
const PANEL_WIDTH = 432;
const PANEL_HEIGHT = 520;

interface MenuPlacement {
  open: boolean;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

export function ContractsTable({ contracts }: { contracts: ContractRow[] }) {
  const { visible, toggle } = useColumnVisibility();
  const [menu, setMenu] = useState<MenuPlacement>({ open: false });

  const columns = COLUMN_DEFS.filter((c) => visible.has(c.id));

  const openMenuAt = (clientX: number, clientY: number) => {
    const openLeft = clientX + PANEL_WIDTH > window.innerWidth;
    const openUp = clientY + PANEL_HEIGHT > window.innerHeight;
    setMenu({
      open: true,
      left: openLeft ? undefined : clientX,
      right: openLeft ? window.innerWidth - clientX : undefined,
      top: openUp ? undefined : clientY,
      bottom: openUp ? window.innerHeight - clientY : undefined,
    });
  };

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            openMenuAt(rect.left, rect.bottom + 4);
          }}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          Kolumny
        </button>
      </div>

      <div
        className="overflow-x-auto rounded-lg border shadow-sm"
        onContextMenu={(e) => {
          e.preventDefault();
          openMenuAt(e.clientX, e.clientY);
        }}
      >
        <table className="w-full text-xs">
          <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.id}
                  className={cn(
                    "px-2 py-1.5 font-semibold",
                    RIGHT_ALIGN.includes(col.id) && "text-right",
                    CENTER_ALIGN.includes(col.id) && "text-center",
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contracts.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-12 text-center text-muted-foreground">
                  <p className="font-medium text-foreground">Brak umów spełniających kryteria</p>
                  <p className="mt-1 text-sm">Zmień lub wyczyść filtry wyszukiwania powyżej.</p>
                </td>
              </tr>
            )}
            {contracts.map((c) => (
              <ClickableRow key={c.id} href={`/umowy/${c.id}`}>
                {columns.map((col) => (
                  <td
                    key={col.id}
                    className={cn(
                      "whitespace-normal break-words px-2 py-1.5 align-top",
                      RIGHT_ALIGN.includes(col.id) && "text-right",
                      CENTER_ALIGN.includes(col.id) && "text-center",
                    )}
                  >
                    {cellFor(col.id, c)}
                  </td>
                ))}
              </ClickableRow>
            ))}
          </tbody>
        </table>
      </div>

      <ColumnChooserPanel
        open={menu.open}
        left={menu.left}
        right={menu.right}
        top={menu.top}
        bottom={menu.bottom}
        visible={visible}
        onToggle={toggle}
        onClose={() => setMenu((m) => ({ ...m, open: false }))}
      />
    </div>
  );
}

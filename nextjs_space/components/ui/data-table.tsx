import { cn } from "@/lib/utils";

/**
 * Powłoka tabeli rejestru: ten sam nagłówek, te same komórki i ten sam dwuwierszowy
 * stan pusty w każdym module (przepis w docs/features/05).
 */

export type Align = "left" | "right" | "center";

export interface DataColumn {
  id: string;
  label: string;
  align?: Align;
}

function alignClass(align: Align | undefined): string | undefined {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return undefined;
}

export interface DataTableProps {
  columns: readonly DataColumn[];
  /** Pierwsza linia stanu pustego, np. „Brak umów spełniających kryteria." */
  emptyTitle: string;
  isEmpty: boolean;
  /** Atrybut `id` kontenera — kotwica dla wyspy wyboru kolumn. */
  id?: string;
  children: React.ReactNode;
}

export function DataTable({ columns, emptyTitle, isEmpty, id, children }: DataTableProps) {
  return (
    <div id={id} className="overflow-x-auto rounded-lg border shadow-sm">
      <table className="w-full text-xs">
        <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            {columns.map((col) => (
              <th
                key={col.id}
                data-col={col.id}
                className={cn("px-2 py-1.5 font-semibold", alignClass(col.align))}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isEmpty ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-12 text-center text-muted-foreground">
                <p className="font-medium text-foreground">{emptyTitle}</p>
                <p className="mt-1 text-sm">Zmień lub wyczyść filtry.</p>
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Cell({
  col,
  align,
  className,
  children,
}: {
  /** Id kolumny — pozwala wyspie wyboru kolumn ukryć komórkę bez przerysowania tabeli. */
  col?: string;
  align?: Align;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <td
      data-col={col}
      className={cn("whitespace-normal break-words px-2 py-1.5 align-top", alignClass(align), className)}
    >
      {children}
    </td>
  );
}

export function Truncated({
  text,
  title,
  className,
}: {
  text: string | null;
  /** Podpowiedź po najechaniu, np. data notatki. */
  title?: string;
  className?: string;
}) {
  if (!text) return <>—</>;
  return (
    <span title={title} className={cn("block max-w-[16rem] whitespace-normal break-words", className)}>
      {text}
    </span>
  );
}

/** Lista osób lub firm: pierwsza z nazwy, reszta jako „+N" z pełną listą w podpowiedzi. */
export function ListedNames({ names }: { names: readonly string[] }) {
  if (names.length === 0) return <>—</>;
  const [first, ...rest] = names;
  return (
    <span title={names.join(", ")}>
      {first}
      {rest.length > 0 && <span className="text-muted-foreground"> +{rest.length}</span>}
    </span>
  );
}

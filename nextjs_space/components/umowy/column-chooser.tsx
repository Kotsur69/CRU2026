"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  COLUMN_DEFS,
  COLUMN_STORAGE_KEY,
  DEFAULT_VISIBLE_IDS,
  LOCKED_IDS,
  type ColumnId,
} from "@/lib/umowy-columns";

function readStored(): ColumnId[] {
  if (typeof window === "undefined") return DEFAULT_VISIBLE_IDS;
  try {
    const raw = window.localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE_IDS;
    const parsed = JSON.parse(raw) as string[];
    const known = new Set(COLUMN_DEFS.map((c) => c.id as string));
    const ids = parsed.filter((id): id is ColumnId => known.has(id));
    return ids.length ? ids : DEFAULT_VISIBLE_IDS;
  } catch {
    return DEFAULT_VISIBLE_IDS;
  }
}

/** Stan widoczności kolumn: startuje z domyślnych (SSR-safe), dociąga localStorage po mount. */
export function useColumnVisibility() {
  const [visible, setVisible] = useState<Set<ColumnId>>(() => new Set(DEFAULT_VISIBLE_IDS));

  useEffect(() => {
    setVisible(new Set(readStored()));
  }, []);

  const toggle = useCallback((id: ColumnId) => {
    if (LOCKED_IDS.includes(id)) return;
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      window.localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  return { visible, toggle };
}

/** Panel wyboru kolumn — otwierany prawym klikiem na tabeli lub przyciskiem „Kolumny". */
export function ColumnChooserPanel({
  open,
  left,
  right,
  top,
  bottom,
  visible,
  onToggle,
  onClose,
}: {
  open: boolean;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  visible: Set<ColumnId>;
  onToggle: (id: ColumnId) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        role="menu"
        aria-label="Widoczne kolumny"
        className="fixed z-50 max-h-[85vh] w-[26rem] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border bg-popover text-popover-foreground p-2 shadow-lg"
        style={{ left, right, top, bottom }}
      >
        <p className="mb-1 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Widoczne kolumny
        </p>
        <div className="grid grid-cols-2 gap-x-2">
          {COLUMN_DEFS.map((col) => (
            <label
              key={col.id}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={visible.has(col.id)}
                disabled={col.locked}
                onChange={() => onToggle(col.id)}
                className="h-4 w-4 shrink-0"
              />
              <span className={cn("truncate", col.locked && "text-muted-foreground")}>
                {col.label}
              </span>
            </label>
          ))}
        </div>
      </div>
    </>
  );
}

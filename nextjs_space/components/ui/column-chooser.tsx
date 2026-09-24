"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Wybór widocznych kolumn — wyspa kliencka obok tabeli renderowanej po stronie serwera.
 *
 * Tabela zawsze niesie wszystkie kolumny (każda komórka ma `data-col`); wyspa tylko
 * dokleja regułę CSS, która chowa niewybrane. Dzięki temu formatowanie dat, kwot i
 * statusów zostaje na serwerze i nie trafia do paczki przeglądarki (docs/features/05).
 * Wybór zapisuje się w localStorage; panel otwiera przycisk „Kolumny" i prawy klik.
 */

export interface ChooserColumn {
  id: string;
  label: string;
  defaultVisible: boolean;
  locked?: boolean;
}

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

function readStored(storageKey: string, columns: ChooserColumn[], defaults: string[]): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaults;
    const known = new Set(columns.map((c) => c.id));
    const ids = parsed.filter((id): id is string => typeof id === "string" && known.has(id));
    return ids.length ? ids : defaults;
  } catch {
    return defaults;
  }
}

export function ColumnChooser({
  tableId,
  storageKey,
  columns,
}: {
  /** `id` kontenera tabeli, której kolumny chowamy. */
  tableId: string;
  storageKey: string;
  columns: ChooserColumn[];
}) {
  const defaults = useMemo(
    () => columns.filter((c) => c.defaultVisible || c.locked).map((c) => c.id),
    [columns],
  );
  const [visible, setVisible] = useState<Set<string>>(() => new Set(defaults));
  const [menu, setMenu] = useState<MenuPlacement>({ open: false });

  useEffect(() => {
    setVisible(new Set(readStored(storageKey, columns, defaults)));
  }, [storageKey, columns, defaults]);

  const toggle = useCallback(
    (id: string) => {
      if (columns.find((c) => c.id === id)?.locked) return;
      setVisible((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        try {
          window.localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch {
          // Tryb prywatny bez localStorage — wybór działa do przeładowania strony.
        }
        return next;
      });
    },
    [columns, storageKey],
  );

  const openMenuAt = useCallback((clientX: number, clientY: number) => {
    const openLeft = clientX + PANEL_WIDTH > window.innerWidth;
    const openUp = clientY + PANEL_HEIGHT > window.innerHeight;
    setMenu({
      open: true,
      left: openLeft ? undefined : clientX,
      right: openLeft ? window.innerWidth - clientX : undefined,
      top: openUp ? undefined : clientY,
      bottom: openUp ? window.innerHeight - clientY : undefined,
    });
  }, []);

  const close = useCallback(() => setMenu((m) => ({ ...m, open: false })), []);

  useEffect(() => {
    const table = document.getElementById(tableId);
    if (!table) return;
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      openMenuAt(e.clientX, e.clientY);
    };
    table.addEventListener("contextmenu", onContextMenu);
    return () => table.removeEventListener("contextmenu", onContextMenu);
  }, [tableId, openMenuAt]);

  useEffect(() => {
    if (!menu.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu.open, close]);

  // Selektory bez cudzysłowów: React przy SSR zamienia `"` w treści <style> na `&quot;`,
  // co psuło regułę i hydratację. Id kolumn i tabeli to zwykłe identyfikatory.
  const hidden = columns.filter((c) => !visible.has(c.id));
  const css = hidden.map((c) => `#${tableId} [data-col=${c.id}]{display:none}`).join("");

  return (
    <>
      <style>{css}</style>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            openMenuAt(rect.left, rect.bottom + 4);
          }}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          aria-haspopup="menu"
          aria-expanded={menu.open}
        >
          Kolumny
        </button>
      </div>

      {menu.open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={close}
            onContextMenu={(e) => {
              e.preventDefault();
              close();
            }}
          />
          <div
            role="menu"
            aria-label="Widoczne kolumny"
            className="fixed z-50 max-h-[85vh] w-[26rem] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg"
            style={{ left: menu.left, right: menu.right, top: menu.top, bottom: menu.bottom }}
          >
            <p className="mb-1 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Widoczne kolumny
            </p>
            <div className="grid grid-cols-2 gap-x-2">
              {columns.map((col) => (
                <label
                  key={col.id}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={visible.has(col.id)}
                    disabled={col.locked}
                    onChange={() => toggle(col.id)}
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
      )}
    </>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { CONTROL_CLASS, FieldError } from "@/components/ui/form";
import { requestOpinion, type OpinionState } from "./opinion-actions";

/**
 * „Poproś o opinię" — panel w miejscu, nie okno: zwykle dodaje się kilka próśb naraz
 * (docs/features/16). Grupa rodzaju opinii to podpowiedź, nie ograniczenie: członkowie
 * idą pierwsi pod „Sugerowani", ale reszta jest dostępna — typ „Dyrektor Klastra" w 2 545
 * z 2 615 przypadków trafiał poza swoją grupę.
 */

export interface AskType {
  id: number;
  name: string;
  memberIds: number[];
}

export interface AskPerson {
  id: number;
  name: string;
}

export function OpinionAskPanel({
  recordId,
  types,
  people,
  activePairs,
}: {
  recordId: number;
  types: AskType[];
  people: AskPerson[];
  /** Aktywne prośby „typ:osoba" — duplikat ostrzega, ale nie blokuje. */
  activePairs: string[];
}) {
  const [state, action] = useFormState<OpinionState, FormData>(requestOpinion, {});
  const [typeId, setTypeId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.saved) return;
    formRef.current?.reset();
    setChecked(new Set());
    setQuery("");
  }, [state.saved]);

  const members = useMemo(
    () => new Set(types.find((t) => t.id === typeId)?.memberIds ?? []),
    [types, typeId],
  );
  const active = useMemo(() => new Set(activePairs), [activePairs]);
  const q = query.trim().toLowerCase();
  const visible = people.filter((p) => checked.has(p.id) || !q || p.name.toLowerCase().includes(q));
  const suggested = visible.filter((p) => members.has(p.id));
  const others = visible.filter((p) => !members.has(p.id));

  const toggle = (id: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const personRow = (p: AskPerson) => (
    <label key={p.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
      <input
        type="checkbox"
        name="userIds"
        value={p.id}
        checked={checked.has(p.id)}
        onChange={() => toggle(p.id)}
        className="h-4 w-4"
      />
      <span>{p.name}</span>
      {typeId !== null && active.has(`${typeId}:${p.id}`) && (
        <span className="text-xs text-amber-800">już ma aktywną prośbę tego rodzaju</span>
      )}
    </label>
  );

  return (
    <form ref={formRef} action={action} className="mt-3 space-y-3 rounded-md border bg-muted/30 p-3">
      <input type="hidden" name="recordId" value={recordId} />
      <label className="block text-sm">
        <span className="text-muted-foreground">Rodzaj opinii</span>
        <select
          name="opinionTypeId"
          required
          defaultValue=""
          onChange={(e) => setTypeId(e.target.value ? Number(e.target.value) : null)}
          className={`${CONTROL_CLASS} mt-1 max-w-sm`}
        >
          <option value="" disabled>
            — wybierz —
          </option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      <div className="text-sm">
        <span className="text-muted-foreground">Osoba</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Szukaj osoby…"
          aria-label="Szukaj osoby"
          className={`${CONTROL_CLASS} mt-1 max-w-sm`}
        />
        <div className="mt-2 max-h-64 overflow-y-auto rounded-md border bg-card p-1">
          {suggested.length > 0 && (
            <>
              <p className="px-2 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Sugerowani
              </p>
              {suggested.map(personRow)}
              <p className="px-2 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Pozostali
              </p>
            </>
          )}
          {others.map(personRow)}
          {visible.length === 0 && <p className="px-2 py-1 text-sm text-muted-foreground">Brak dopasowań.</p>}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="silent" value="1" className="h-4 w-4" />
        Nie powiadamiaj
      </label>

      {state.error && <FieldError>{state.error}</FieldError>}
      <div className="flex justify-end">
        <SubmitButton count={checked.size} />
      </div>
    </form>
  );
}

function SubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending || count === 0}>
      {pending ? "Zapisuję…" : count > 1 ? `Poproś o opinię (${count} osoby)` : "Poproś o opinię"}
    </Button>
  );
}

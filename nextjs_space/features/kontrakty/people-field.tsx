"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { CONTROL_CLASS } from "@/components/ui/form";
import type { Option } from "@/lib/contracts/dictionaries";
import { requestAcceptanceForm } from "./actions";

/**
 * Lista osób przypisanych do rekordu — „Właściciel umowy" i „Opiniujący".
 *
 * Legacy pokazuje jedno pole wyboru z przyciskiem „dodaj", bo właścicieli może być
 * wielu (w danych 1–8 na umowę). Przy właścicielach dochodzi „prawo edycji": to jest
 * `contract_users.onlyRead`, które stopniuje uprawnienia W OBRĘBIE listy właścicieli,
 * a nie decyduje o tym, kto jest właścicielem (patrz lib/contract-access.ts).
 */

export interface PeopleFieldProps {
  /** Nazwa pola z listą osób, np. `ownerIds`. */
  name: string;
  label: string;
  people: Option[];
  initialIds: number[];
  /** Nazwa pola z podzbiorem mającym prawo edycji; brak = lista bez stopniowania. */
  editableName?: string;
  initialEditableIds?: number[];
  /**
   * Włącza przycisk „poproś o formularz" przy każdej osobie. `null` = rekord jeszcze
   * nie istnieje (nowy aneks), więc przycisk jest widoczny, ale nieaktywny.
   * Pominięcie propa chowa przycisk zupełnie (lista opiniujących go nie ma).
   */
  formRequestContractId?: number | null;
}

export function PeopleField({
  name,
  label,
  people,
  initialIds,
  editableName,
  initialEditableIds = [],
  formRequestContractId,
}: PeopleFieldProps) {
  const [ids, setIds] = useState<number[]>(initialIds);
  const [editableIds, setEditableIds] = useState<number[]>(initialEditableIds);
  const [pending, setPending] = useState("");

  const nameOf = (id: number) => people.find((p) => p.id === String(id))?.name ?? `#${id}`;
  const available = people.filter((p) => !ids.includes(Number(p.id)));

  const add = () => {
    const id = Number.parseInt(pending, 10);
    if (!Number.isSafeInteger(id) || ids.includes(id)) return;
    setIds((prev) => [...prev, id]);
    setPending("");
  };

  const remove = (id: number) => {
    setIds((prev) => prev.filter((x) => x !== id));
    setEditableIds((prev) => prev.filter((x) => x !== id));
  };

  const toggleEditable = (id: number) => {
    setEditableIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div>
      {ids.map((id) => (
        <input key={`v-${id}`} type="hidden" name={name} value={id} />
      ))}
      {editableName &&
        editableIds
          .filter((id) => ids.includes(id))
          .map((id) => <input key={`e-${id}`} type="hidden" name={editableName} value={id} />)}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={pending}
          onChange={(e) => setPending(e.target.value)}
          aria-label={`${label} — wybierz osobę`}
          className={`${CONTROL_CLASS} max-w-xs flex-1`}
        >
          <option value="">— wybierz —</option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Button onClick={add} disabled={pending === ""}>
          dodaj
        </Button>
      </div>

      {ids.length > 0 && (
        <ul className="mt-2 space-y-1">
          {ids.map((id) => (
            <li
              key={id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/30 px-2 py-1 text-sm"
            >
              <span className="flex-1">{nameOf(id)}</span>
              {formRequestContractId !== undefined && (
                <FormRequestButton
                  contractId={formRequestContractId}
                  userId={id}
                  personName={nameOf(id)}
                />
              )}
              {editableName && (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={editableIds.includes(id)}
                    onChange={() => toggleEditable(id)}
                    className="h-4 w-4"
                  />
                  prawo edycji
                </label>
              )}
              <Button
                variant="ghost"
                onClick={() => remove(id)}
                aria-label={`Usuń ${nameOf(id)} z listy`}
              >
                usuń
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * „poproś o formularz" — prośba do właściciela o wypełnienie Formularza akceptacji
 * umowy. Legacy wysyła ją mailem; tu idzie obiegiem wewnętrznym (patrz actions.ts).
 */
function FormRequestButton({
  contractId,
  userId,
  personName,
}: {
  contractId: number | null;
  userId: number;
  personName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  if (contractId === null) {
    return (
      <span className="text-xs text-muted-foreground" title="Dostępne po zapisaniu rekordu.">
        poproś o formularz — po zapisie
      </span>
    );
  }

  if (result) {
    return (
      <span className={`text-xs ${result.ok ? "text-muted-foreground" : "text-red-700"}`}>
        {result.message}
      </span>
    );
  }

  const send = () =>
    startTransition(async () => {
      const response = await requestAcceptanceForm(contractId, userId);
      setResult(
        response.ok
          ? { ok: true, message: "poproszono o formularz" }
          : { ok: false, message: response.error ?? "nie udało się wysłać prośby" },
      );
    });

  return (
    <Button
      variant="ghost"
      onClick={send}
      disabled={pending}
      aria-label={`Poproś ${personName} o formularz akceptacji umowy`}
    >
      {pending ? "wysyłam…" : "poproś o formularz"}
    </Button>
  );
}

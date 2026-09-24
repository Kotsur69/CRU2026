"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button, buttonClass } from "@/components/ui/button";
import { CONTROL_CLASS, FieldError, FormRow } from "@/components/ui/form";
import { updateGroup, type GroupActionState } from "./actions";
import type { PersonOption } from "./membership-forms";

/**
 * „Edytuj" — nazwa, aktywność, właściciel i buissnesline grupy. Zakładania i usuwania
 * grup nie ma (Q62). Formularz rozwija się pod danymi grupy, zamiast prowadzić na osobny
 * ekran: cztery pola nie potrzebują własnej trasy.
 */

export interface GroupEditFormProps {
  group: {
    id: number;
    name: string;
    active: boolean;
    ownerId: number | null;
    businesslineId: number | null;
  };
  people: PersonOption[];
  businesslines: PersonOption[];
  nameMax: number;
}

const EMPTY: GroupActionState = { errors: {} };

export function GroupEditForm(props: GroupEditFormProps) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Po zapisie albo „Anuluj" fokus wraca na „Edytuj", a nie na początek strony.
  const close = useCallback(() => {
    setOpen(false);
    toggleRef.current?.focus();
  }, []);

  return (
    <div className="mt-3">
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={open ? "group-edit" : undefined}
        className={buttonClass("secondary")}
      >
        Edytuj
      </button>
      {/* Montowany przy każdym otwarciu, więc błędy z poprzedniej próby nie wracają. */}
      {open && <EditForm {...props} onDone={close} />}
    </div>
  );
}

function EditForm({
  group,
  people,
  businesslines,
  nameMax,
  onDone,
}: GroupEditFormProps & { onDone: () => void }) {
  const [state, formAction] = useFormState(updateGroup, EMPTY);
  const err = (field: string) => state.errors[field];

  useEffect(() => {
    if (state.savedAt) onDone();
  }, [state.savedAt, onDone]);

  return (
    <form
      id="group-edit"
      action={formAction}
      aria-label="Edycja grupy"
      className="mt-4 rounded-md border bg-muted/20 px-4 py-2"
    >
      <input type="hidden" name="groupId" value={group.id} />

      <FormRow label="Nazwa" htmlFor="group-name" required error={err("name")}>
        <input
          id="group-name"
          name="name"
          defaultValue={group.name}
          required
          maxLength={nameMax}
          autoFocus
          aria-invalid={err("name") ? true : undefined}
          aria-describedby={err("name") ? "group-name-error" : undefined}
          className={CONTROL_CLASS}
        />
      </FormRow>

      <FormRow
        label="Aktywna"
        htmlFor="group-active"
        hint="Nieaktywna grupa zostaje ze swoimi członkami, ale jej skład jest zamrożony."
      >
        <input
          id="group-active"
          type="checkbox"
          name="active"
          value="1"
          defaultChecked={group.active}
          className="mt-2 h-4 w-4"
        />
      </FormRow>

      <FormRow label="Właściciel" htmlFor="group-owner" error={err("ownerId")}>
        <select
          id="group-owner"
          name="ownerId"
          defaultValue={group.ownerId === null ? "" : String(group.ownerId)}
          aria-invalid={err("ownerId") ? true : undefined}
          aria-describedby={err("ownerId") ? "group-owner-error" : undefined}
          className={CONTROL_CLASS}
        >
          <option value="">— brak —</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </FormRow>

      <FormRow label="Buissnesline" htmlFor="group-businessline" error={err("businesslineId")}>
        <select
          id="group-businessline"
          name="businesslineId"
          defaultValue={group.businesslineId === null ? "" : String(group.businesslineId)}
          aria-invalid={err("businesslineId") ? true : undefined}
          aria-describedby={err("businesslineId") ? "group-businessline-error" : undefined}
          className={CONTROL_CLASS}
        >
          <option value="">— brak —</option>
          {businesslines.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </FormRow>

      {state.errors._form && <FieldError>{state.errors._form}</FieldError>}

      <div className="flex justify-end gap-2 py-3">
        <Button onClick={onDone}>Anuluj</Button>
        <SaveButton />
      </div>
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "Zapisuję…" : "Zapisz"}
    </Button>
  );
}

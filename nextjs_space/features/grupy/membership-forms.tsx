"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { CONTROL_CLASS, FieldError } from "@/components/ui/form";
import { addMember, removeMember, type GroupActionState } from "./actions";

/**
 * „Dodaj członka" i „Usuń członka". Bramka w UI jest wygodą — każda akcja sprawdza
 * sesję i prawo administratora jeszcze raz u siebie (features/grupy/actions.ts).
 */

export interface PersonOption {
  id: string;
  name: string;
}

const EMPTY: GroupActionState = { errors: {} };

/** Lista ma do 343 osób, więc „usuń" jest drobny — ale cel nie schodzi poniżej 24 px. */
const COMPACT_BUTTON = "min-h-6 px-2 py-0.5 text-xs";

export function AddMemberForm({
  groupId,
  candidates,
}: {
  groupId: number;
  /** Osoby spoza grupy, już posortowane. */
  candidates: PersonOption[];
}) {
  const [state, formAction] = useFormState(addMember, EMPTY);
  const formRef = useRef<HTMLFormElement>(null);

  // Po udanym dodaniu pole wraca do „— wybierz osobę —"; dodana osoba znika z listy
  // przy odświeżeniu strony, które robi sama akcja.
  useEffect(() => {
    if (state.savedAt) formRef.current?.reset();
  }, [state.savedAt]);

  const error = state.errors.userId ?? state.errors._form;

  return (
    <form ref={formRef} action={formAction} className="mb-4">
      <input type="hidden" name="groupId" value={groupId} />
      <label htmlFor="add-member" className="mb-1 block text-sm text-muted-foreground">
        Dodaj członka
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id="add-member"
          name="userId"
          required
          defaultValue=""
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "add-member-error" : undefined}
          className={`${CONTROL_CLASS} max-w-sm flex-1`}
        >
          <option value="">— wybierz osobę —</option>
          {candidates.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <SubmitButton idle="Dodaj członka" busy="Dodaję…" variant="primary" />
      </div>
      {error && <FieldError id="add-member-error">{error}</FieldError>}
    </form>
  );
}

export function RemoveMemberButton({
  groupId,
  userId,
  personName,
  groupName,
}: {
  groupId: number;
  userId: number;
  personName: string;
  groupName: string;
}) {
  const [state, formAction] = useFormState(removeMember, EMPTY);

  return (
    <form
      action={formAction}
      className="ml-auto flex shrink-0 items-center gap-2"
      onSubmit={(event) => {
        // Zmiana składu grupy działa od razu — pytamy, zanim ją zapiszemy.
        if (
          !window.confirm(
            `Usunąć ${personName} z grupy „${groupName}"? Zmiana trafi do historii grupy.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="userId" value={userId} />
      {state.errors._form && (
        <span role="alert" className="text-xs text-red-700">
          {state.errors._form}
        </span>
      )}
      <SubmitButton
        idle="usuń"
        busy="usuwam…"
        variant="ghost"
        label={`Usuń ${personName} z grupy`}
        className={COMPACT_BUTTON}
      />
    </form>
  );
}

function SubmitButton({
  idle,
  busy,
  variant,
  label,
  className,
}: {
  idle: string;
  busy: string;
  variant: "primary" | "ghost";
  label?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      disabled={pending}
      aria-label={label}
      className={className}
    >
      {pending ? busy : idle}
    </Button>
  );
}

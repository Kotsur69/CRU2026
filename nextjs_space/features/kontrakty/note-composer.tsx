"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { CONTROL_CLASS, FieldError } from "@/components/ui/form";
import { NOTE_MAX_LENGTH } from "@/lib/contracts/note-rules";
import { addNote, type NoteState } from "./actions";

/** „dodaj notatkę" pod wątkiem — w miejscu, bez okna, jak iframe notatek w legacy. */
export function NoteComposer({ recordId }: { recordId: number }) {
  const [state, action] = useFormState<NoteState, FormData>(addNote, {});
  const formRef = useRef<HTMLFormElement>(null);

  // Po zapisie pole wraca puste; przy błędzie treść zostaje do poprawki.
  useEffect(() => {
    if (state.saved) formRef.current?.reset();
  }, [state.saved]);

  return (
    <form ref={formRef} action={action} className="mt-4 border-t border-border/60 pt-3">
      <input type="hidden" name="recordId" value={recordId} />
      <label htmlFor="note-body" className="sr-only">
        Treść notatki
      </label>
      <textarea
        id="note-body"
        name="body"
        rows={3}
        required
        maxLength={NOTE_MAX_LENGTH}
        className={CONTROL_CLASS}
        placeholder="Nowa notatka…"
        aria-invalid={Boolean(state.error)}
      />
      {state.error && <FieldError>{state.error}</FieldError>}
      <div className="mt-2 flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "Zapisuję…" : "dodaj notatkę"}
    </Button>
  );
}

"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { CONTROL_CLASS, FieldError } from "@/components/ui/form";
import { OPINION_ANSWER_MAX } from "@/lib/opinions";
import { answerOpinion, type OpinionState } from "./opinion-actions";

/** Odpowiedź w wierszu prośby: „Zaopiniuj" albo „Zaopiniuj bez uwag" (docs/features/16). */
export function OpinionAnswerForm({ opinionId }: { opinionId: number }) {
  const [state, action] = useFormState<OpinionState, FormData>(answerOpinion, {});
  return (
    <form action={action} className="mt-2 space-y-2">
      <input type="hidden" name="opinionId" value={opinionId} />
      <textarea
        name="description"
        rows={3}
        maxLength={OPINION_ANSWER_MAX}
        aria-label="Treść opinii"
        placeholder="Treść opinii…"
        className={CONTROL_CLASS}
      />
      {state.error && <FieldError>{state.error}</FieldError>}
      <div className="flex flex-wrap justify-end gap-2">
        <SubmitButton mode="bez-uwag" label="Zaopiniuj bez uwag" variant="secondary" />
        <SubmitButton mode="z-uwagami" label="Zaopiniuj" variant="primary" />
      </div>
    </form>
  );
}

function SubmitButton({
  mode,
  label,
  variant,
}: {
  mode: string;
  label: string;
  variant: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" name="mode" value={mode} variant={variant} disabled={pending}>
      {label}
    </Button>
  );
}

"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { Button, buttonClass, type ButtonVariant } from "@/components/ui/button";
import { deleteContractor, restoreContractor } from "./actions";

/**
 * Pasek akcji kontrahenta — renderowany tylko administratorowi (docs/features/20). Bramka
 * w UI jest wygodą, nie zabezpieczeniem: każda akcja serwerowa sprawdza prawo sama.
 *
 * „Scal z innym" celowo tu nie ma — scalanie przenosi umowy między kontrahentami i czeka
 * na decyzję działu prawnego (Q58).
 */

export interface ContractorActionsProps {
  id: number;
  name: string;
  isDeleted: boolean;
  /** Rekordy wskazujące kontrahenta (jako stronę albo dłużnika) — do pytania o usunięcie. */
  records: number;
}

export function ContractorActions({ id, name, isDeleted, records }: ContractorActionsProps) {
  return (
    <section className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/kontrahenci/${id}/edycja`} className={buttonClass("primary")}>
          Edytuj
        </Link>
        {isDeleted ? (
          <form action={restoreContractor} className="ml-auto">
            <input type="hidden" name="id" value={id} />
            <PendingButton variant="secondary" idle="Przywróć" busy="Przywracam…" />
          </form>
        ) : (
          <form
            action={deleteContractor}
            className="ml-auto"
            onSubmit={(event) => {
              // Usunięty kontrahent znika z podpowiedzi dla wszystkich — pytamy najpierw.
              const message =
                `Usunąć kontrahenta „${name}"? Zniknie z podpowiedzi w formularzach. ` +
                `Rekordy, które go wskazują (${records}), zachowają go jako stronę.`;
              if (!window.confirm(message)) event.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={id} />
            <PendingButton variant="danger" idle="Usuń" busy="Usuwam…" />
          </form>
        )}
      </div>
    </section>
  );
}

function PendingButton({
  variant,
  idle,
  busy,
}: {
  variant: ButtonVariant;
  idle: string;
  busy: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? busy : idle}
    </Button>
  );
}

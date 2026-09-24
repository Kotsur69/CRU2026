"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { Button, buttonClass } from "@/components/ui/button";
import { deleteContract } from "./actions";

/**
 * Pasek akcji pod podglądem umowy — układ jak w legacy (audyt 1.5): górny rząd to
 * formularz akceptacji i pytanie, dolny to operacje na rekordzie.
 *
 * Akcje zmieniające rekord pokazujemy tylko osobom z prawem edycji. Bramka po stronie
 * UI jest wygodą, nie zabezpieczeniem — każda akcja serwerowa sprawdza uprawnienia
 * jeszcze raz u siebie.
 */

export interface ContractActionsProps {
  recordId: number;
  basePath: string;
  canEdit: boolean;
  /** Legacy `edittable = 0` — rekord zamrożony; edytuje go tylko administrator. */
  frozen: boolean;
  /** Rekordy Działu ryzyka nie mają aneksów ani projektów aneksu. */
  allowAnnexes: boolean;
}

export function ContractActions({
  recordId,
  basePath,
  canEdit,
  frozen,
  allowAnnexes,
}: ContractActionsProps) {
  const href = (suffix: string) => `${basePath}/${recordId}/${suffix}`;

  return (
    <section className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`${href("formularz-akceptacji")}?druk=1`} className={buttonClass("secondary")}>
          Formularz akceptacji umowy-pdf
        </Link>
        <Link href={href("formularz-akceptacji")} className={buttonClass("secondary")}>
          Formularz akceptacji umowy
        </Link>
        <Link href={href("pytanie")} className={buttonClass("secondary")}>
          zadaj pytanie
        </Link>
        {/* Historię czyta każdy, kto widzi rekord — to nie jest edycja (docs/features/13). */}
        <Link href={href("historia")} className={buttonClass("secondary")}>
          Historia zmian
        </Link>
      </div>

      {canEdit ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Link href={href("edycja")} className={buttonClass("primary")}>
            Edycja
          </Link>
          {allowAnnexes && (
            <>
              {/* Różnica to moduł tworzonego rekordu (docs/features/11): aneks od razu
                  w Umowach albo projekt, który po obiegu opinii stanie się aneksem. */}
              <Link
                href={href("aneks")}
                title="Nowy aneks w rejestrze Umów, z kolejnym numerem /Ann tej umowy"
                className={buttonClass("secondary")}
              >
                Dodaj aneks
              </Link>
              <Link
                href={href("projekt-aneksu")}
                title="Nowy projekt w module Projekty — po obiegu opinii stanie się aneksem"
                className={buttonClass("secondary")}
              >
                Stwórz projekt aneksu
              </Link>
            </>
          )}
          <DeleteForm recordId={recordId} />
        </div>
      ) : frozen ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Rekord zamrożony w systemie legacy — edycję, aneksy i usunięcie może wykonać tylko
          administrator.
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Podgląd bez prawa edycji — rekord mogą zmieniać właściciele z prawem edycji oraz
          administratorzy.
        </p>
      )}
    </section>
  );
}

function DeleteForm({ recordId }: { recordId: number }) {
  return (
    <form
      action={deleteContract}
      className="ml-auto"
      onSubmit={(event) => {
        // Usunięcie znika z rejestru dla wszystkich — pytamy, zanim to zrobimy.
        if (
          !window.confirm("Usunąć rekord z rejestru? Operacja ukryje go we wszystkich widokach.")
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="recordId" value={recordId} />
      <DeleteButton />
    </form>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" disabled={pending}>
      {pending ? "Usuwam…" : "Usuń"}
    </Button>
  );
}

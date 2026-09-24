import Link from "next/link";
import { formatDateTime, userLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NoteComposer } from "./note-composer";

/**
 * Wątek notatek rekordu (docs/features/14) — legacy `remarks`, 50 737 wpisów na trzech
 * czwartych rejestru. Najnowsze na górze, krótkie (średnio 68 znaków), więc zwarta lista,
 * a nie karty. Własne notatki są wyróżnione — legacy przekazuje do widoku `myid` właśnie
 * po to.
 */

/** Tyle notatek widać od razu; rekord z 60 notatkami rozwija resztę. */
export const NOTES_SHOWN = 10;

export interface ThreadNote {
  id: number;
  body: string | null;
  createdAt: Date;
  user: { id: number; firstName: string | null; lastName: string | null; login: string | null } | null;
}

export function NotesThread({
  recordId,
  notes,
  actorId,
  total,
  moreHref,
  composer,
}: {
  recordId: number;
  /** Notatki do pokazania, najnowsze pierwsze. */
  notes: readonly ThreadNote[];
  actorId: number | null;
  /** Liczba wszystkich notatek rekordu — gdy większa niż pokazane, pojawia się rozwinięcie. */
  total: number;
  moreHref?: string;
  /** Pole „dodaj notatkę" pod wątkiem. */
  composer: boolean;
}) {
  return (
    <div>
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Brak uwag</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((r) => {
            const mine = actorId !== null && r.user?.id === actorId;
            return (
              <li
                key={r.id}
                className={cn(
                  "rounded-md border-l-2 px-3 py-1.5",
                  mine ? "border-primary bg-accent/40" : "border-transparent",
                )}
              >
                <div className="text-xs text-muted-foreground">
                  {r.user ? userLabel(r.user) : "—"}
                  {mine && " (Ty)"} · <span className="tabular-nums">{formatDateTime(r.createdAt)}</span>
                </div>
                {r.body ? (
                  <p className="mt-0.5 whitespace-pre-line text-sm">{r.body}</p>
                ) : (
                  // 18 notatek z legacy nie ma treści — pokazujemy to wprost, żeby pusty wiersz
                  // nie wyglądał na błąd wyświetlania.
                  <p className="mt-0.5 text-sm italic text-muted-foreground">(pusta notatka)</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {moreHref && total > notes.length && (
        <Link href={moreHref} className="mt-2 inline-block text-sm text-primary hover:underline">
          pokaż wszystkie ({total})
        </Link>
      )}
      {composer && <NoteComposer recordId={recordId} />}
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDateTime, userLabel } from "@/lib/format";
import { currentActor } from "@/lib/authz";
import { Button } from "@/components/ui/button";
import { CONTROL_CLASS } from "@/components/ui/form";
import { askQuestion } from "./actions";

/**
 * „zadaj pytanie" — pytanie do rekordu.
 *
 * Audyt notuje ten przycisk jako [NIEZNANE]: nie wiadomo, dokąd legacy wysyła pytanie
 * (mail? obieg wewnętrzny?). Nie zgadujemy i nie ruszamy poczty — pytanie zapisuje się
 * jako notatka rekordu i powiadomienie dla właścicieli, czyli na tabelach, które dump
 * do tego właśnie ma: `remarks`, `shoutbox`, `shoutboxusers`.
 */

const THREAD_LIMIT = 30;

export interface QuestionPageProps {
  id: number;
  basePath: string;
}

export async function QuestionPage({ id, basePath }: QuestionPageProps) {
  const actor = await currentActor();
  if (!actor) redirect("/login");

  const contract = await prisma.contract.findUnique({
    where: { id },
    select: {
      id: true,
      identifier: true,
      description: true,
      isDeleted: true,
      userAccess: {
        include: { user: { select: { id: true, firstName: true, lastName: true, login: true } } },
      },
      remarkEntries: {
        where: { active: true },
        orderBy: { createdAt: "desc" },
        take: THREAD_LIMIT,
        include: { user: { select: { id: true, firstName: true, lastName: true, login: true } } },
      },
    },
  });
  if (!contract || contract.isDeleted) notFound();

  const owners = contract.userAccess.map((a) => userLabel(a.user));
  const recordHref = `${basePath}/${id}`;

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Link href={recordHref} className="text-sm text-muted-foreground hover:text-foreground">
          ← Wróć do rekordu
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-semibold">Zadaj pytanie</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {contract.identifier ?? `#${contract.id}`}
          {contract.description ? ` · ${contract.description}` : ""}
        </p>
      </div>

      <form action={askQuestion} className="rounded-lg border bg-card p-5 shadow-sm">
        <input type="hidden" name="recordId" value={id} />
        <label htmlFor="body" className="mb-1 block text-sm font-medium">
          Treść pytania
        </label>
        <textarea
          id="body"
          name="body"
          rows={5}
          required
          maxLength={4000}
          className={CONTROL_CLASS}
          placeholder="O co chcesz zapytać w sprawie tego rekordu?"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Pytanie trafi do notatek rekordu i powiadomi{" "}
          {owners.length > 0
            ? owners.join(", ")
            : "właścicieli umowy (rekord nie ma przypisanych osób)"}
          . Nie wysyłamy e-maili.
        </p>
        <div className="mt-4 flex justify-end">
          <Button type="submit" variant="primary">
            Wyślij pytanie
          </Button>
        </div>
      </form>

      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <h2 className="mb-3 font-heading text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Notatki i pytania ({contract.remarkEntries.length})
        </h2>
        {contract.remarkEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak notatek.</p>
        ) : (
          <ul className="space-y-3">
            {contract.remarkEntries.map((r) => (
              <li key={r.id} className="border-b border-border/60 pb-3 last:border-0 last:pb-0">
                <div className="text-xs text-muted-foreground">
                  {r.user ? userLabel(r.user) : "—"} ·{" "}
                  <span className="tabular-nums">{formatDateTime(r.createdAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-line text-sm">{r.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

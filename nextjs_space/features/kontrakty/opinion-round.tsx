import { prisma } from "@/lib/prisma";
import { formatDate, formatDateTime, userLabel } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Field, Section } from "@/components/ui/section";
import { compareOpinions, roundProgress } from "@/lib/opinions";
import { withdrawOpinion } from "./opinion-actions";
import { OpinionAnswerForm } from "./opinion-answer-form";
import { OpinionAskPanel, type AskPerson, type AskType } from "./opinion-ask-panel";

/**
 * Sekcja „Obieg FAU" rekordu (docs/features/16): koordynator, postęp, prośby pogrupowane
 * po rodzaju, odpowiedź w wierszu, wycofanie. Na projektach z akcjami; na umowach tylko
 * do odczytu i tylko wtedy, gdy wpisy istnieją.
 */

type Person = { id: number; firstName: string | null; lastName: string | null; login: string | null };

export interface RoundOpinion {
  id: number;
  opinionTypeId: number | null;
  opinionType: { name: string } | null;
  user: Person | null;
  userId: number | null;
  description: string;
  active: boolean;
  respondedAt: Date | null;
  requestedAt: Date | null;
}

export interface OpinionRoundProps {
  recordId: number;
  opinions: RoundOpinion[];
  coordinator: Person | null;
  actor: { id: number; isAdmin: boolean } | null;
  canEdit: boolean;
  /** Umowa albo rekord ryzyka — lista bez akcji. */
  readOnly: boolean;
  acceptanceForm: React.ReactNode;
}

/** Rodzaje opinii z członkami ich grup — grupa jest podpowiedzią dla „Sugerowani". */
async function loadAskOptions(): Promise<{ types: AskType[]; people: AskPerson[] }> {
  const [types, people] = await Promise.all([
    prisma.opinionType.findMany({
      orderBy: { id: "asc" },
      select: { id: true, name: true, group: { select: { members: { select: { userId: true } } } } },
    }),
    // Prosić można tylko osoby z aktywnym kontem (docs/features/16).
    prisma.user.findMany({
      where: { active: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { login: "asc" }],
      select: { id: true, firstName: true, lastName: true, login: true },
    }),
  ]);
  return {
    types: types.map((t) => ({
      id: t.id,
      name: t.name,
      memberIds: t.group?.members.map((m) => m.userId) ?? [],
    })),
    people: people.map((p) => ({ id: p.id, name: userLabel(p) })),
  };
}

export async function OpinionRound({
  recordId,
  opinions,
  coordinator,
  actor,
  canEdit,
  readOnly,
  acceptanceForm,
}: OpinionRoundProps) {
  const active = opinions.filter((o) => o.active).sort(compareOpinions);
  const withdrawn = opinions.filter((o) => !o.active).sort(compareOpinions);
  const progress = roundProgress(opinions);
  const canAsk = !readOnly && canEdit;
  const ask = canAsk ? await loadAskOptions() : null;

  const row = (o: RoundOpinion) => {
    const mine = actor !== null && o.userId === actor.id;
    const canAnswer = !readOnly && o.active && o.respondedAt === null && (mine || actor?.isAdmin);
    const canWithdraw =
      !readOnly && o.active && actor !== null && (actor.isAdmin || canEdit || coordinator?.id === actor.id);
    return (
      <li key={o.id} className="border-b border-border/60 py-2 last:border-0">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{o.opinionType?.name ?? "INNE"}</span>
          <span>·</span>
          <span className={mine ? "font-medium text-foreground" : undefined}>
            {o.user ? userLabel(o.user) : "—"}
            {mine && " (Ty)"}
          </span>
          {/* `signed` jest 0 na wszystkich rekordach legacy — stan wynika z daty odpowiedzi. */}
          <Badge tone={o.respondedAt ? "success" : "warning"}>
            {o.respondedAt ? `Zaopiniowano ${formatDate(o.respondedAt)}` : "Oczekuje"}
          </Badge>
          {o.requestedAt && (
            <span title={formatDateTime(o.requestedAt)}>poproszono {formatDate(o.requestedAt)}</span>
          )}
          {canWithdraw && (
            <form action={withdrawOpinion} className="ml-auto">
              <input type="hidden" name="opinionId" value={o.id} />
              <button type="submit" className="text-xs text-muted-foreground hover:text-red-700 hover:underline">
                Wycofaj
              </button>
            </form>
          )}
        </div>
        {o.respondedAt ? (
          o.description ? (
            <p className="mt-1 whitespace-pre-line text-sm">{o.description}</p>
          ) : (
            // Ok. 1 100 odpowiedzi w legacy to akceptacja bez komentarza.
            <p className="mt-1 text-sm italic text-muted-foreground">(bez uwag)</p>
          )
        ) : null}
        {canAnswer && (
          <details className="mt-1">
            <summary className="cursor-pointer text-sm text-primary hover:underline">Odpowiedz</summary>
            <OpinionAnswerForm opinionId={o.id} />
          </details>
        )}
      </li>
    );
  };

  const askPanel = ask && (
    <details className="mt-3">
      <summary className={`${buttonClass("primary")} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        Poproś o opinię
      </summary>
      <OpinionAskPanel
        recordId={recordId}
        types={ask.types}
        people={ask.people}
        activePairs={active.map((o) => `${o.opinionTypeId}:${o.userId}`)}
      />
    </details>
  );

  return (
    <Section title="Obieg FAU (Formularz Akceptacji Umowy)">
      {acceptanceForm}
      <dl className="mb-2">
        <Field label="Koordynator obiegu">{coordinator ? userLabel(coordinator) : null}</Field>
        <Field label="Postęp">
          {progress.total > 0 ? `Zaopiniowano ${progress.answered} z ${progress.total}` : null}
        </Field>
      </dl>

      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nie rozpoczęto obiegu opinii.</p>
      ) : (
        <ul>{active.map(row)}</ul>
      )}

      {withdrawn.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
            pokaż wycofane ({withdrawn.length})
          </summary>
          <ul className="opacity-70">{withdrawn.map(row)}</ul>
        </details>
      )}

      {askPanel}
    </Section>
  );
}

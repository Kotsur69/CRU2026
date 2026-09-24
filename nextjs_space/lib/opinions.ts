/**
 * Obieg opinii (FAU) — docs/features/16. Wiersz `opinions` to NIE „opinia typu X o
 * umowie Y", tylko „poprosiliśmy osobę U o opinię typu T": ten sam typ występuje na
 * rekordzie tyle razy, ile osób zapytano. Obieg jest zbiorem próśb, a „obieg zakończony"
 * znaczy: każda aktywna prośba ma odpowiedź.
 */

export const OPINION_ANSWER_MAX = 4000;

interface OpinionLike {
  id: number;
  active: boolean;
  respondedAt: Date | null;
  opinionTypeId: number | null;
}

/** „Zaopiniowano X z Y" — liczone tylko po prośbach aktywnych (wycofane się nie liczą). */
export function roundProgress(opinions: readonly OpinionLike[]): { answered: number; total: number } {
  const active = opinions.filter((o) => o.active);
  return { answered: active.filter((o) => o.respondedAt !== null).length, total: active.length };
}

/**
 * Kolejność listy: typy w porządku id słownika, w typie najpierw odpowiedzi, potem
 * oczekujące, a w obrębie — po id (legacy nie zapisuje daty prośby).
 */
export function compareOpinions(a: OpinionLike, b: OpinionLike): number {
  const type = (a.opinionTypeId ?? Number.MAX_SAFE_INTEGER) - (b.opinionTypeId ?? Number.MAX_SAFE_INTEGER);
  if (type !== 0) return type;
  if ((a.respondedAt === null) !== (b.respondedAt === null)) return a.respondedAt === null ? 1 : -1;
  return a.id - b.id;
}

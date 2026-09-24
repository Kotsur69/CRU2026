import { prisma } from "@/lib/prisma";

// Czysta stała mieszka osobno, bo czyta ją też formularz w przeglądarce.
export { NOTE_MAX_LENGTH } from "./note-rules";

export interface LastNote {
  body: string | null;
  createdAt: string;
}

/**
 * „Ostatnia notatka" dla strony rejestru. Najnowsze dziecko każdego wiersza to klasyczne
 * N+1, więc dwa zapytania na stronę niezależnie od jej rozmiaru: najwyższe id notatki
 * na rekord, potem treści (docs/features/07, 14).
 */
export async function loadLastNotes(ids: number[]): Promise<Map<number, LastNote>> {
  if (ids.length === 0) return new Map();
  const latest = await prisma.remark.groupBy({
    by: ["contractId"],
    where: { contractId: { in: ids }, active: true },
    _max: { id: true },
  });
  const noteIds = latest.map((l) => l._max.id).filter((id): id is number => id !== null);
  const notes = await prisma.remark.findMany({
    where: { id: { in: noteIds } },
    select: { contractId: true, body: true, createdAt: true },
  });
  return new Map(
    notes
      .filter((n): n is typeof n & { contractId: number } => n.contractId !== null)
      .map((n) => [n.contractId, { body: n.body, createdAt: n.createdAt.toISOString() }]),
  );
}

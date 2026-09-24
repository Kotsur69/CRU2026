import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentActor } from "@/lib/authz";
import { contractorLabel } from "@/lib/format";
import {
  NIP_LENGTH,
  nipCollisionMessage,
  nipDigits,
  nipFormatError,
  parseContractorInput,
} from "@/lib/contractors";
import { createContractorRecord, idsWithNip, idsWithNipFragment } from "@/lib/contractors-db";

/**
 * Podpowiedzi kontrahentów do pola „Kontrahent" w formularzu.
 *
 * Słownik ma tysiące firm i legacy obsługuje go autocomplete'em (audyt 1.6), więc
 * lista nigdy nie jedzie do przeglądarki w całości — szukamy po nazwie i po NIP-ie,
 * bo w legacy widoczne są obie te wartości. NIP porównujemy po cyfrach, więc
 * „526-025-09-95" i „5260250995" znajdują się nawzajem, a dokładne trafienie w NIP
 * idzie na początek listy (docs/features/20).
 */

const LIMIT = 20;
const MIN_QUERY = 2;

const OPTION = { id: true, shortName: true, fullName: true, vatId: true } as const;

export async function GET(req: NextRequest) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Brak sesji." }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < MIN_QUERY) return NextResponse.json({ items: [] });
  // Filtry rejestrów szukają też firm usuniętych — wiszą na nich historyczne umowy.
  // Formularz umowy (bez `all`) podpowiada wyłącznie firmy żywe.
  const includeDeleted = req.nextUrl.searchParams.get("all") === "1";
  const liveOnly = !includeDeleted;

  const digits = nipDigits(q);
  const [exactIds, fragmentIds] = await Promise.all([
    digits.length === NIP_LENGTH ? idsWithNip(digits, liveOnly) : [],
    digits.length >= MIN_QUERY ? idsWithNipFragment(digits, liveOnly) : [],
  ]);

  const [exact, rows] = await Promise.all([
    // Osobno, bo przy wielu trafieniach po nazwie limit mógłby odciąć właśnie tę firmę.
    exactIds.length > 0
      ? prisma.contractor.findMany({
          where: { id: { in: exactIds } },
          select: OPTION,
          orderBy: [{ shortName: "asc" }, { id: "asc" }],
        })
      : [],
    prisma.contractor.findMany({
      where: {
        ...(includeDeleted ? {} : { isDeleted: false }),
        OR: [
          { shortName: { contains: q, mode: "insensitive" } },
          { fullName: { contains: q, mode: "insensitive" } },
          { vatId: { contains: q, mode: "insensitive" } },
          ...(fragmentIds.length > 0 ? [{ id: { in: fragmentIds } }] : []),
        ],
      },
      select: OPTION,
      orderBy: [{ shortName: "asc" }, { id: "asc" }],
      take: LIMIT,
    }),
  ]);

  const exactSet = new Set(exactIds);
  const items = [...exact, ...rows.filter((r) => !exactSet.has(r.id))].slice(0, LIMIT);

  return NextResponse.json({
    items: items.map((r) => ({ id: r.id, name: contractorLabel(r), vatId: r.vatId })),
  });
}

/**
 * „dodaj" przy polu Kontrahent — dopisanie firmy do słownika bez opuszczania
 * formularza. Umowa trzyma JEDNEGO kontrahenta (`contractor_id`), więc ten przycisk
 * rozszerza słownik, a nie listę stron umowy.
 *
 * Dopisać może każdy zalogowany (Q57). NIP już obecny na żywym wpisie to 409 z tym
 * wpisem: formularz pyta „Użyć go?", a wybór należy do człowieka — legacy oddawał
 * istniejącą firmę po cichu, więc literówka w NIP-ie podpinała umowę pod obcą spółkę.
 */
export async function POST(req: NextRequest) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Brak sesji." }, { status: 401 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe żądanie." }, { status: 400 });
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return NextResponse.json({ error: "Nieprawidłowe żądanie." }, { status: 400 });
  }

  const parsed = parseContractorInput(payload as Record<string, unknown>);
  if (!parsed.ok) {
    const first = Object.values(parsed.errors)[0] ?? "Nieprawidłowe dane kontrahenta.";
    return NextResponse.json({ error: first, errors: parsed.errors }, { status: 400 });
  }
  const formatError = nipFormatError(parsed.values.vatId);
  if (formatError) {
    return NextResponse.json({ error: formatError, errors: { vatId: formatError } }, { status: 400 });
  }

  const result = await createContractorRecord(parsed.values, actor.id);
  if (!result.ok) {
    const { id, name, vatId } = result.conflict;
    return NextResponse.json(
      { error: nipCollisionMessage(name), conflict: { id, name, vatId } },
      { status: 409 },
    );
  }

  return NextResponse.json({ item: result.contractor }, { status: 201 });
}

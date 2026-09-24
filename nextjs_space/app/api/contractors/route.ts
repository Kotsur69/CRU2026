import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentActor } from "@/lib/authz";
import { contractorLabel } from "@/lib/format";

/**
 * Podpowiedzi kontrahentów do pola „Kontrahent" w formularzu.
 *
 * Słownik ma tysiące firm i legacy obsługuje go autocomplete'em (audyt 1.6), więc
 * lista nigdy nie jedzie do przeglądarki w całości — szukamy po nazwie i po NIP-ie,
 * bo w legacy widoczne są obie te wartości.
 */

const LIMIT = 20;
const MIN_QUERY = 2;

export async function GET(req: NextRequest) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Brak sesji." }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < MIN_QUERY) return NextResponse.json({ items: [] });

  const rows = await prisma.contractor.findMany({
    where: {
      isDeleted: false,
      OR: [
        { shortName: { contains: q, mode: "insensitive" } },
        { fullName: { contains: q, mode: "insensitive" } },
        { vatId: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, shortName: true, fullName: true, vatId: true },
    orderBy: [{ shortName: "asc" }, { id: "asc" }],
    take: LIMIT,
  });

  return NextResponse.json({
    items: rows.map((r) => ({ id: r.id, name: contractorLabel(r), vatId: r.vatId })),
  });
}

const MAX_NAME = 250;
const MAX_VAT_ID = 30;

/**
 * „dodaj" przy polu Kontrahent — dopisanie firmy do słownika bez opuszczania
 * formularza. Umowa trzyma JEDNEGO kontrahenta (`contractor_id`), więc ten przycisk
 * rozszerza słownik, a nie listę stron umowy.
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

  const body = (payload ?? {}) as Record<string, unknown>;
  const str = (key: string, max: number) => {
    const v = body[key];
    if (typeof v !== "string") return null;
    const trimmed = v.trim().slice(0, max);
    return trimmed === "" ? null : trimmed;
  };

  const shortName = str("shortName", MAX_NAME);
  if (!shortName) {
    return NextResponse.json({ error: "Nazwa kontrahenta jest wymagana." }, { status: 400 });
  }

  const vatId = str("vatId", MAX_VAT_ID);
  if (vatId) {
    // NIP bywa w danych zapisany z kreskami i spacjami — sprawdzamy same cyfry.
    const digits = vatId.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
      return NextResponse.json({ error: "NIP ma nieprawidłową długość." }, { status: 400 });
    }
    const duplicate = await prisma.contractor.findFirst({
      where: { vatId, isDeleted: false },
      select: { id: true, shortName: true, fullName: true, vatId: true },
    });
    if (duplicate) {
      // Nie tworzymy drugiego wpisu na ten sam NIP — oddajemy istniejący do wyboru.
      return NextResponse.json(
        {
          item: { id: duplicate.id, name: contractorLabel(duplicate), vatId: duplicate.vatId },
          existing: true,
        },
        { status: 200 },
      );
    }
  }

  const created = await prisma.contractor.create({
    data: {
      shortName,
      fullName: str("fullName", MAX_NAME),
      address: str("address", MAX_NAME),
      vatId,
      registeredAt: new Date(),
      registeredById: actor.id,
    },
    select: { id: true, shortName: true, fullName: true, vatId: true },
  });

  return NextResponse.json(
    { item: { id: created.id, name: contractorLabel(created), vatId: created.vatId } },
    { status: 201 },
  );
}

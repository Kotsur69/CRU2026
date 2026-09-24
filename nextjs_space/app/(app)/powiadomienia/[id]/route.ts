import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentActor } from "@/lib/authz";
import { modulePath } from "@/lib/contracts/modules";

export const dynamic = "force-dynamic";

/**
 * Otwarcie powiadomienia: oznacza je jako przeczytane i prowadzi do wątku notatek
 * rekordu (docs/features/15). Trasa, a nie akcja serwerowa, bo tylko przekierowanie HTTP
 * zachowuje kotwicę `#notatki`. Skrzynka linkuje tu zwykłym `<a>`, bez prefetchu —
 * inaczej przeglądarka „otwierałaby" powiadomienia sama.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const actor = await currentActor();
  if (!actor) return NextResponse.redirect(new URL("/login", req.url));

  const id = Number.parseInt(params.id, 10);
  // Cudzy wiersz to 404, tak samo jak nieistniejący.
  const row = Number.isSafeInteger(id)
    ? await prisma.shoutboxRecipient.findFirst({
        where: { id, userId: actor.id },
        select: {
          id: true,
          isRead: true,
          shoutbox: { select: { contract: { select: { id: true, module: true, isDeleted: true } } } },
        },
      })
    : null;
  if (!row) return new NextResponse("Nie znaleziono.", { status: 404 });

  if (!row.isRead) {
    await prisma.shoutboxRecipient.update({
      where: { id: row.id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  const contract = row.shoutbox.contract;
  const target =
    contract && !contract.isDeleted
      ? `${modulePath(contract.module)}/${contract.id}#notatki`
      : "/powiadomienia";
  return NextResponse.redirect(new URL(target, req.url), { status: 303 });
}

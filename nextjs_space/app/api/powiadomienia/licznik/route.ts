import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentActor } from "@/lib/authz";

export const dynamic = "force-dynamic";

/** Liczba nieprzeczytanych powiadomień zalogowanej osoby — dla dzwonka w topbarze. */
export async function GET() {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Brak sesji." }, { status: 401 });
  const unread = await prisma.shoutboxRecipient.count({
    where: { userId: actor.id, isRead: false },
  });
  return NextResponse.json({ unread }, { headers: { "Cache-Control": "no-store" } });
}

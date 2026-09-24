"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/authz";

/**
 * Skrzynka powiadomień (docs/features/15). Każda akcja dotyczy wyłącznie wierszy
 * `ShoutboxRecipient` zalogowanej osoby — cudzy wiersz to 404, nie 403: samo istnienie
 * cudzego powiadomienia jest informacją.
 */

function recipientId(formData: FormData): number {
  const id = Number.parseInt(String(formData.get("id") ?? ""), 10);
  if (!Number.isSafeInteger(id)) notFound();
  return id;
}

async function markOwn(actorId: number, id: number) {
  const row = await prisma.shoutboxRecipient.findFirst({
    where: { id, userId: actorId },
    select: { id: true, isRead: true },
  });
  if (!row) notFound();
  if (!row.isRead) {
    await prisma.shoutboxRecipient.update({
      where: { id: row.id },
      data: { isRead: true, readAt: new Date() },
    });
  }
}

/** „oznacz jako przeczytane" — zostajemy w skrzynce. */
export async function markRead(formData: FormData): Promise<void> {
  const actor = await requireActor();
  await markOwn(actor.id, recipientId(formData));
  revalidatePath("/powiadomienia");
}

/** „oznacz wszystkie jako przeczytane" — tylko własne, tylko nieprzeczytane. */
export async function markAllRead(): Promise<void> {
  const actor = await requireActor();
  await prisma.shoutboxRecipient.updateMany({
    where: { userId: actor.id, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  revalidatePath("/powiadomienia");
}

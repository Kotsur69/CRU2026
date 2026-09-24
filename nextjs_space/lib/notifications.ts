import type { Prisma } from "@prisma/client";

/**
 * Powiadomienia o notatkach — jedno miejsce, które decyduje, kto dostaje wpis w skrzynce
 * (docs/features/15). Legacy robi to wyzwalaczem `shoutbox_after_insert`: KAŻDE
 * powiadomienie idzie do KAŻDEGO administratora i do nikogo więcej.
 *
 * Zmiana tej reguły czeka na decyzję (Q5). Do tego czasu zostaje zachowanie, które ta
 * aplikacja ma od początku: właściciele rekordu (`contract_users`) bez autora notatki.
 * Kiedy Q5 zostanie rozstrzygnięte, zmienia się tylko `defaultRecipients`.
 */

type Tx = Prisma.TransactionClient;

async function defaultRecipients(tx: Tx, contractId: number, authorId: number): Promise<number[]> {
  const owners = await tx.contractUser.findMany({
    where: { contractId },
    select: { userId: true },
  });
  return owners.map((o) => o.userId).filter((id) => id !== authorId);
}

/**
 * Powiadomienie o notatce: jeden `Shoutbox` i po jednym `ShoutboxRecipient` na odbiorcę,
 * w tej samej transakcji co notatka. Legacy nie zna powiadomienia bez notatki — ta
 * funkcja też nie. `recipients` podaje wywołujący tylko wtedy, gdy wiadomość jest do
 * konkretnej osoby („poproś o formularz").
 */
export async function notifyAboutRemark(
  tx: Tx,
  input: { remarkId: number; contractId: number; authorId: number; recipients?: readonly number[] },
): Promise<void> {
  const recipients = [
    ...new Set(input.recipients ?? (await defaultRecipients(tx, input.contractId, input.authorId))),
  ];
  if (recipients.length === 0) return;

  // Legacy ma jeden szablon: „nowa notatka". Tabela zostaje tabelą, żeby nowy rodzaj
  // powiadomienia nie wymagał migracji (Q, docs/features/15 pkt 3).
  const template = await tx.messageTemplate.findFirst({ orderBy: { id: "asc" } });
  const shout = await tx.shoutbox.create({
    data: { contractId: input.contractId, remarkId: input.remarkId, messageId: template?.id ?? null },
  });
  await tx.shoutboxRecipient.createMany({
    data: recipients.map((userId) => ({ shoutboxId: shout.id, userId, isRead: false })),
  });
}

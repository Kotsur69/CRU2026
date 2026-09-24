"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canEditContract, requireActor } from "@/lib/authz";
import { userLabel } from "@/lib/format";
import { modulePath } from "@/lib/contracts/modules";
import { notifyAboutRemark } from "@/lib/notifications";
import { OPINION_ANSWER_MAX } from "@/lib/opinions";

/**
 * Akcje obiegu opinii (docs/features/16). Prosić o opinię może osoba z prawem edycji
 * rekordu — tak jak dotąd przez pole „Opiniujący" w formularzu (Q19 czeka na decyzję,
 * czy zawęzić to do koordynatorów). Odpowiadać może tylko zapytana osoba albo
 * administrator: odpowiedź to nie edycja umowy.
 *
 * Powiadomienia idą przez `lib/notifications.ts`, a legacy nie zna powiadomienia bez
 * notatki — więc prośba i odpowiedź zostawiają też krótką notatkę na rekordzie, jak
 * „poproś o formularz". Poczty nie wysyłamy.
 */

const MAX_PEOPLE = 20;

export interface OpinionState {
  error?: string;
  saved?: number;
}

function intField(formData: FormData, name: string): number | null {
  const value = Number.parseInt(String(formData.get(name) ?? ""), 10);
  return Number.isSafeInteger(value) ? value : null;
}

function revalidateRecord(module: Parameters<typeof modulePath>[0], id: number) {
  revalidatePath(`${modulePath(module)}/${id}`);
  revalidatePath(modulePath(module));
}

/** „Poproś o opinię" — jedna prośba na każdą wskazaną osobę. */
export async function requestOpinion(state: OpinionState, formData: FormData): Promise<OpinionState> {
  const actor = await requireActor();
  const recordId = intField(formData, "recordId");
  const typeId = intField(formData, "opinionTypeId");
  const userIds = [
    ...new Set(
      formData
        .getAll("userIds")
        .map((v) => Number.parseInt(String(v), 10))
        .filter((v) => Number.isSafeInteger(v)),
    ),
  ];
  const silent = formData.get("silent") === "1";

  if (recordId === null) return { error: "Nieprawidłowy rekord." };
  if (typeId === null) return { error: "Wybierz rodzaj opinii." };
  if (userIds.length === 0) return { error: "Wskaż co najmniej jedną osobę." };
  if (userIds.length > MAX_PEOPLE) return { error: `Najwyżej ${MAX_PEOPLE} osób naraz.` };
  if (!(await canEditContract(actor, recordId))) return { error: "Brak uprawnień do tego rekordu." };

  const [contract, type, people] = await Promise.all([
    prisma.contract.findUnique({
      where: { id: recordId },
      select: {
        isDeleted: true,
        module: true,
        opinionsRequestedById: true,
        _count: { select: { opinions: true } },
      },
    }),
    prisma.opinionType.findUnique({ where: { id: typeId }, select: { id: true, name: true } }),
    prisma.user.findMany({
      where: { id: { in: userIds }, active: true },
      select: { id: true, firstName: true, lastName: true, login: true },
    }),
  ]);
  if (!contract || contract.isDeleted) return { error: "Rekord nie istnieje." };
  // Obieg to cecha projektów; na umowie tylko tam, gdzie już jest (40 rekordów w danych).
  if (contract.module !== "PROJECT" && contract._count.opinions === 0) {
    return { error: "Obieg opinii prowadzi się na projektach." };
  }
  if (!type) return { error: "Nieznany rodzaj opinii." };
  if (people.length !== userIds.length) {
    return { error: "Można prosić tylko osoby z aktywnym kontem." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.opinion.createMany({
      data: people.map((p) => ({
        contractId: recordId,
        opinionTypeId: type.id,
        userId: p.id,
        description: "",
        active: true,
        sendInfo: true,
        mailingDisabled: silent,
      })),
    });
    // Pierwsza prośba na rekordzie bez koordynatora otwiera obieg — tak jak legacy
    // `giveopinions` (docs/features/01), z wpisem w historii w formacie legacy.
    if (contract.opinionsRequestedById === null) {
      await tx.contract.update({
        where: { id: recordId },
        data: { opinionsRequestedById: actor.id, opinionsRequested: true },
      });
      await tx.contractHistory.create({
        data: {
          contractId: recordId,
          columnName: "giveopinions",
          oldValue: "0",
          newValue: String(actor.id),
          userId: actor.id,
        },
      });
    }
    const remark = await tx.remark.create({
      data: {
        contractId: recordId,
        userId: actor.id,
        body: `Prośba o opinię (${type.name}): ${people.map(userLabel).join(", ")}`,
        active: true,
      },
    });
    if (!silent) {
      await notifyAboutRemark(tx, {
        remarkId: remark.id,
        contractId: recordId,
        authorId: actor.id,
        recipients: people.map((p) => p.id).filter((id) => id !== actor.id),
      });
    }
  });

  revalidateRecord(contract.module, recordId);
  return { saved: (state.saved ?? 0) + 1 };
}

/** „Zaopiniuj" / „Zaopiniuj bez uwag" — tylko zapytana osoba albo administrator. */
export async function answerOpinion(state: OpinionState, formData: FormData): Promise<OpinionState> {
  const actor = await requireActor();
  const opinionId = intField(formData, "opinionId");
  if (opinionId === null) return { error: "Nieprawidłowa prośba." };

  const bare = formData.get("mode") === "bez-uwag";
  const description = bare ? "" : String(formData.get("description") ?? "").trim();
  if (description.length > OPINION_ANSWER_MAX) {
    return { error: `Opinia może mieć najwyżej ${OPINION_ANSWER_MAX} znaków.` };
  }

  const opinion = await prisma.opinion.findUnique({
    where: { id: opinionId },
    select: {
      id: true,
      userId: true,
      active: true,
      respondedAt: true,
      sendInfo: true,
      mailingDisabled: true,
      opinionType: { select: { name: true } },
      contract: {
        select: { id: true, module: true, isDeleted: true, opinionsRequestedById: true },
      },
    },
  });
  if (!opinion || opinion.contract.isDeleted) return { error: "Prośba nie istnieje." };
  if (opinion.userId !== actor.id && !actor.isAdmin) {
    return { error: "Odpowiedzieć może tylko osoba, o której opinię poproszono." };
  }
  if (!opinion.active) return { error: "Prośba została wycofana." };
  if (opinion.respondedAt !== null) return { error: "Na tę prośbę już odpowiedziano." };

  const contract = opinion.contract;
  await prisma.$transaction(async (tx) => {
    await tx.opinion.update({
      where: { id: opinion.id },
      data: { respondedAt: new Date(), description },
    });
    const coordinator = contract.opinionsRequestedById;
    // Legacy: powiadamiaj, gdy `sendinfo` i nie `disableMailing` (docs/features/16).
    if (coordinator !== null && coordinator !== actor.id && opinion.sendInfo && !opinion.mailingDisabled) {
      const remark = await tx.remark.create({
        data: {
          contractId: contract.id,
          userId: actor.id,
          body: `Zaopiniowano (${opinion.opinionType?.name ?? "INNE"})${description ? `: ${description}` : " — bez uwag"}`,
          active: true,
        },
      });
      await notifyAboutRemark(tx, {
        remarkId: remark.id,
        contractId: contract.id,
        authorId: actor.id,
        recipients: [coordinator],
      });
    }
  });

  revalidateRecord(contract.module, contract.id);
  return { saved: (state.saved ?? 0) + 1 };
}

/**
 * „Wycofaj" — `active = false`. Wycofanie, nie zastąpienie: w danych 338 par
 * (rekord, typ) ma naraz kilka aktywnych próśb. Nic nie jest kasowane.
 */
export async function withdrawOpinion(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const opinionId = intField(formData, "opinionId");
  if (opinionId === null) throw new Error("Nieprawidłowa prośba.");

  const opinion = await prisma.opinion.findUnique({
    where: { id: opinionId },
    select: {
      id: true,
      active: true,
      contract: { select: { id: true, module: true, opinionsRequestedById: true } },
    },
  });
  if (!opinion || !opinion.active) throw new Error("Prośba nie istnieje albo już ją wycofano.");

  const allowed =
    actor.isAdmin ||
    opinion.contract.opinionsRequestedById === actor.id ||
    (await canEditContract(actor, opinion.contract.id));
  if (!allowed) throw new Error("Brak uprawnień do wycofania tej prośby.");

  await prisma.opinion.update({ where: { id: opinion.id }, data: { active: false } });
  revalidateRecord(opinion.contract.module, opinion.contract.id);
}

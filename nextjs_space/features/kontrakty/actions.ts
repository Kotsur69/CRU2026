"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ContractModule, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { userLabel } from "@/lib/format";
import { requireActor, assertCanEditContract, type Actor } from "@/lib/authz";
import {
  contractFormSchema,
  flattenIssues,
  type ContractFormErrors,
  type ContractFormValues,
} from "@/lib/contracts/form-schema";
import { loadFormDictionaries } from "@/lib/contracts/dictionaries";
import {
  buildSnapshot,
  diffSnapshots,
  withCounterparties,
  withOpinionRound,
} from "@/lib/contracts/history";
import {
  contractToFormValues,
  counterpartyLabels,
  fromDateInput,
  isAnnex,
  loadContractForForm,
} from "@/lib/contracts/record";
import { nextAnnexIdentifier, nextRecordIdentifier } from "@/lib/contracts/identifier";
import { nextRiskIdentifier } from "@/lib/contracts/risk";
import {
  isRegisterModule,
  MODULE_PATH,
  modulePath,
  registerOf,
  type RegisterModule,
} from "@/lib/contracts/modules";

/**
 * Zapis rekordu umowy / projektu.
 *
 * Cztery tryby, jeden formularz — dokładnie jak w legacy:
 *   `create`        „Dodaj nowy wpis": rekord bez rodzica, w rejestrze, z którego
 *                   przyszedł użytkownik,
 *   `edit`          edycja istniejącego rekordu,
 *   `annex`         „Dodaj aneks": nowa umowa z `parentId`, numer `<rodzic>/A01`,
 *   `annex-project` „Stwórz projekt aneksu": nowy PROJEKT z `parentId`, numer `P0299`
 *                   z własnej serii spółki (7 129 takich rekordów w dumpie).
 */

export type SaveMode = "create" | "edit" | "annex" | "annex-project";

const MODES: readonly SaveMode[] = ["create", "edit", "annex", "annex-project"];

export interface SaveContractState {
  errors: ContractFormErrors;
  /** Wartości do ponownego wypełnienia formularza po odrzuceniu zapisu. */
  values?: Record<string, unknown>;
}

/** Odczyt pól formularza — `FormData` zawsze daje tekst, resztę robi schemat. */
function readForm(formData: FormData) {
  const one = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v : undefined;
  };
  const many = (name: string) =>
    formData.getAll(name).filter((v): v is string => typeof v === "string");

  return {
    identifier: one("identifier"),
    documentTypeId: one("documentTypeId"),
    statusId: one("statusId"),
    companyId: one("companyId"),
    businesslineId: one("businesslineId"),
    primaryLocationId: one("primaryLocationId"),
    domainId: one("domainId"),
    natureId: one("natureId"),
    tradeId: one("tradeId"),
    deliveryMethodId: one("deliveryMethodId"),
    noticePeriodId: one("noticePeriodId"),
    contractReference: one("contractReference"),
    description: one("description"),
    dateBegin: one("dateBegin"),
    dateEnd: one("dateEnd"),
    indefinite: one("indefinite"),
    sentOn: one("sentOn"),
    salary: one("salary"),
    currencyId: one("currencyId"),
    specificSalaryTerms: one("specificSalaryTerms"),
    paymentTerm: one("paymentTerm"),
    contractorId: one("contractorId"),
    debtorId: one("debtorId"),
    companiesConnected: one("companiesConnected"),
    tempForm: one("tempForm"),
    obsc: one("obsc"),
    obscDescription: one("obscDescription"),
    insuranceGuarantee: one("insuranceGuarantee"),
    bill: one("bill"),
    ownerIds: many("ownerIds"),
    editorIds: many("editorIds"),
    reviewerIds: many("reviewerIds"),
    remarks: one("remarks"),
    formSession: one("formSession") || null,
  };
}

function contractData(values: ContractFormValues) {
  return {
    documentTypeId: values.documentTypeId,
    statusId: values.statusId,
    companyId: values.companyId,
    businesslineId: values.businesslineId,
    primaryLocationId: values.primaryLocationId,
    domainId: values.domainId,
    natureId: values.natureId,
    tradeId: values.tradeId,
    deliveryMethodId: values.deliveryMethodId,
    noticePeriodId: values.noticePeriodId,
    contractReference: values.contractReference,
    description: values.description,
    dateBegin: fromDateInput(values.dateBegin),
    dateEnd: fromDateInput(values.dateEnd),
    sentOn: fromDateInput(values.sentOn),
    salary: values.salary,
    currencyId: values.currencyId,
    specificSalaryTerms: values.specificSalaryTerms,
    paymentTerm: values.paymentTerm,
    contractorId: values.contractorId,
    debtorId: values.debtorId,
    companiesConnected: values.companiesConnected,
    tempForm: values.tempForm,
    obsc: values.obsc,
    obscDescription: values.obscDescription,
    insuranceGuarantee: values.insuranceGuarantee,
    bill: values.bill,
    remarks: values.remarks,
  };
}

interface OpinionRound {
  opinionsRequested: boolean;
  opinionsRequestedById: number | null;
}

/**
 * Legacy `giveopinions` to nie flaga, tylko id osoby, która otworzyła obieg opinii
 * (docs/features/01, 16). Ruszamy go wyłącznie zmianą listy opiniujących: wskazanie
 * pierwszego opiniującego otwiera obieg z zapisującym jako koordynatorem, usunięcie
 * ostatniego go zamyka. Edycja, która listy nie zmienia, zostawia obieg bez zmian —
 * około 10 000 rekordów legacy ma otwarty obieg bez ani jednego wpisu w `opinions`
 * i zapis innego pola nie może im go zamknąć.
 */
function opinionRound(
  reviewerIds: readonly number[],
  actor: Actor,
  current: (OpinionRound & { opinions: readonly unknown[] }) | null,
): OpinionRound {
  const now: OpinionRound = {
    opinionsRequested: current?.opinionsRequested ?? false,
    opinionsRequestedById: current?.opinionsRequestedById ?? null,
  };
  const hadReviewers = (current?.opinions.length ?? 0) > 0;
  const hasReviewers = reviewerIds.length > 0;

  if (hasReviewers && !now.opinionsRequested) {
    return { opinionsRequested: true, opinionsRequestedById: actor.id };
  }
  if (!hasReviewers && hadReviewers) {
    return { opinionsRequested: false, opinionsRequestedById: null };
  }
  return now;
}

export async function saveContract(
  _state: SaveContractState,
  formData: FormData,
): Promise<SaveContractState> {
  const actor = await requireActor();

  const mode = String(formData.get("mode") ?? "") as SaveMode;
  if (!MODES.includes(mode)) {
    return { errors: { _form: "Nieprawidłowe żądanie zapisu." } };
  }

  // „Dodaj nowy wpis" nie ma rekordu wyjściowego; pozostałe tryby bez niego nie istnieją.
  const recordId = Number.parseInt(String(formData.get("recordId") ?? ""), 10);
  if (mode !== "create" && !Number.isSafeInteger(recordId)) {
    return { errors: { _form: "Nieprawidłowe żądanie zapisu." } };
  }

  const raw = readForm(formData);
  const parsed = contractFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: flattenIssues(parsed.error), values: raw };
  }
  const values = parsed.data;

  if (mode === "create") {
    // Rejestr przychodzi z formularza, więc jest niezaufany — musi być jedną z trzech
    // wartości enuma, a wybrany status musi do niego pasować (sprawdzenie niżej).
    const registerKind = String(formData.get("registerKind") ?? "");
    if (!isRegisterModule(registerKind)) {
      return { errors: { _form: "Nieprawidłowy rejestr." } };
    }
    return createRecord(actor, values, raw, registerKind);
  }

  // `recordId` to edytowany rekord albo umowa nadrzędna aneksu — w obu razach prawo
  // edycji tego rekordu jest warunkiem wykonania akcji.
  await assertCanEditContract(actor, recordId);

  const base = await loadContractForForm(recordId);
  if (!base || base.isDeleted) {
    return { errors: { _form: "Rekord nie istnieje lub został usunięty." } };
  }

  // Aneksy nie zagnieżdżają się (docs/features/11) — formularz już tego nie proponuje,
  // ale żądanie może przyjść z pominięciem formularza.
  if (mode !== "edit" && isAnnex(base)) {
    return {
      errors: {
        _form: "Nie można dodać aneksu do aneksu. Dodaj kolejny aneks do umowy nadrzędnej.",
      },
      values: raw,
    };
  }
  // Nowy aneks nie obowiązuje z automatu, więc status jest wyborem, nie wartością domyślną.
  if (mode === "annex" && values.statusId === null) {
    return { errors: { statusId: "Wybierz status aneksu." }, values: raw };
  }

  const module: ContractModule =
    mode === "annex-project" ? "PROJECT" : mode === "annex" ? "CONTRACT" : base.module;

  // Status musi należeć do tego samego modułu co rekord — inaczej rekord wypadłby
  // z rejestru, w którym go utworzono (`module` i `status.kind` muszą się zgadzać).
  const status = values.statusId
    ? await prisma.contractStatus.findUnique({ where: { id: values.statusId } })
    : null;
  if (status && mode !== "edit" && status.kind !== registerOf(module)) {
    return {
      errors: { statusId: "Status nie pasuje do rodzaju tworzonego rekordu." },
      values: raw,
    };
  }

  // Oba stany rekordu trafiają do słowników, żeby historia zapisała nazwę także dla
  // pozycji wygaszonej (np. typ „Kontrakt" na 21 żywych rekordach), a nie samo id.
  const dicts = await loadFormDictionaries(
    status?.kind ?? registerOf(module),
    base,
    values,
  );
  const names = await counterpartyLabels(values.contractorId, values.debtorId);

  let targetId: number;
  let targetPath: string;

  if (mode === "edit") {
    const round = opinionRound(values.reviewerIds, actor, base);
    const previousNames = await counterpartyLabels(base.contractorId, base.debtorId);
    const before = withOpinionRound(
      withCounterparties(
        buildSnapshot(contractToFormValues(base), dicts),
        previousNames.contractor,
        previousNames.debtor,
      ),
      base.opinionsRequestedById,
    );
    const after = withOpinionRound(
      withCounterparties(buildSnapshot(values, dicts), names.contractor, names.debtor),
      round.opinionsRequestedById,
    );
    const changes = diffSnapshots(before, after);

    await prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id: base.id },
        data: {
          ...contractData(values),
          ...round,
          identifier: values.identifier,
          modifiedAt: new Date(),
          modifiedById: actor.id,
        },
      });
      await syncOwners(tx, base.id, values);
      await syncReviewers(tx, base.id, values);
      await bindAttachments(tx, base.id, values.formSession);
      if (changes.length > 0) {
        await tx.contractHistory.createMany({
          data: changes.map((c) => ({ ...c, contractId: base.id, userId: actor.id })),
        });
      }
    });

    targetId = base.id;
    targetPath = modulePath(base.module);
  } else {
    // Numer proponuje serwer, ale użytkownik może go nadpisać — tak działa legacy
    // (stąd 111 powtórzonych identyfikatorów w dumpie). Powiązanie aneksu z umową
    // trzyma `parentId` nadawany niżej, a nie treść numeru: przepisanie numeru nie
    // może zerwać relacji, a wpisanie cudzego numeru jej nie podmienia. Projekt aneksu
    // dostaje ten sam kształt `<rodzic>/Ann` co aneks (docs/features/11).
    const identifier =
      values.identifier ??
      (await nextAnnexIdentifier(base.id)) ??
      (await nextRecordIdentifier({
        companyId: values.companyId,
        businesslineId: values.businesslineId,
        module: registerOf(module),
      }));

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.contract.create({
        data: {
          ...contractData(values),
          ...opinionRound(values.reviewerIds, actor, null),
          identifier,
          parentId: base.id,
          module,
          registeredAt: new Date(),
          registeredById: actor.id,
        },
      });
      await syncOwners(tx, row.id, values);
      await syncReviewers(tx, row.id, values);
      await bindAttachments(tx, row.id, values.formSession);
      return row;
    });

    targetId = created.id;
    targetPath = modulePath(module);
  }

  revalidatePath(`${targetPath}/${targetId}`);
  revalidatePath(`${targetPath}/${recordId}`);
  revalidatePath(targetPath);
  redirect(`${targetPath}/${targetId}`);
}

/**
 * „Dodaj nowy wpis" — rekord bez rodzica, w rejestrze, z którego przyszedł użytkownik.
 * Rejestr decyduje o `module` i o tym, jaki status wolno wybrać; niezgodny status
 * wyrzuciłby rekord z listy, na której go założono.
 *
 * Twórca wchodzi na listę właścicieli z prawem edycji. Formularz nowego wpisu w legacy
 * nie ma pola „Właściciel umowy", a bez żadnego wiersza w `contract_users` rekord byłby
 * zaraz po zapisie edytowalny wyłącznie dla administratora (patrz lib/authz.ts).
 */
async function createRecord(
  actor: Actor,
  values: ContractFormValues,
  raw: Record<string, unknown>,
  registerKind: RegisterModule,
): Promise<SaveContractState> {
  const status = values.statusId
    ? await prisma.contractStatus.findUnique({ where: { id: values.statusId } })
    : null;
  if (status && status.kind !== registerKind) {
    return { errors: { statusId: "Status nie pasuje do rejestru." }, values: raw };
  }

  // Numer nadaje serwer — formularz nowego wpisu go nie pokazuje, bo zależy od spółki
  // i businessline'u wybranych dopiero tutaj. Dział ryzyka ma własną gramatykę
  // `YYYY/L/NNNN`, gdzie litera pochodzi z rodzaju (docs/features/08).
  let identifier = values.identifier;
  if (identifier === null && registerKind === "RISK") {
    identifier = await nextRiskIdentifier(values.domainId);
    if (identifier === null) {
      return {
        errors: { domainId: "Wybierz rodzaj — od niego zależy litera numeru (np. U dla ugody)." },
        values: raw,
      };
    }
  }
  identifier ??= await nextRecordIdentifier({
    companyId: values.companyId,
    businesslineId: values.businesslineId,
    module: registerKind,
  });

  const withCreator: ContractFormValues = {
    ...values,
    ownerIds: values.ownerIds.includes(actor.id) ? values.ownerIds : [...values.ownerIds, actor.id],
    editorIds: values.editorIds.includes(actor.id)
      ? values.editorIds
      : [...values.editorIds, actor.id],
  };

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.contract.create({
      data: {
        ...contractData(values),
        ...opinionRound(values.reviewerIds, actor, null),
        identifier,
        module: registerKind,
        registeredAt: new Date(),
        registeredById: actor.id,
      },
    });
    await syncOwners(tx, row.id, withCreator);
    await syncReviewers(tx, row.id, values);
    await bindAttachments(tx, row.id, values.formSession);
    return row;
  });

  const targetPath = MODULE_PATH[registerKind];
  revalidatePath(targetPath);
  revalidatePath(`${targetPath}/${created.id}`);
  redirect(`${targetPath}/${created.id}`);
}

type Tx = Prisma.TransactionClient;

/**
 * Lista właścicieli = `contract_users`. `onlyRead` nie decyduje o tym, KTO jest
 * właścicielem, tylko czy może edytować (patrz lib/contract-access.ts).
 */
async function syncOwners(tx: Tx, contractId: number, values: ContractFormValues) {
  const desiredReadOnly = new Map(
    values.ownerIds.map((id) => [id, !values.editorIds.includes(id)]),
  );

  // Do bazy trafiają tylko istniejące konta — lista przychodzi z formularza.
  const known = await tx.user.findMany({
    where: { id: { in: [...desiredReadOnly.keys()] } },
    select: { id: true },
  });
  const knownIds = known.map((u) => u.id);

  await tx.contractUser.deleteMany({
    where: { contractId, userId: { notIn: knownIds } },
  });
  for (const userId of knownIds) {
    const readOnly = desiredReadOnly.get(userId) ?? true;
    await tx.contractUser.upsert({
      where: { contractId_userId: { contractId, userId } },
      create: { contractId, userId, readOnly },
      update: { readOnly },
    });
  }
}

/**
 * „Opiniujący" — wskazanie osoby otwiera wpis w `opinions`. Usunięcie z listy tylko
 * wygasza wpis (`active = false`), tak jak robi to dump: opinie nie znikają z historii.
 */
async function syncReviewers(tx: Tx, contractId: number, values: ContractFormValues) {
  const current = await tx.opinion.findMany({
    where: { contractId, active: true },
    select: { id: true, userId: true },
  });
  const currentIds = new Set(
    current.map((o) => o.userId).filter((id): id is number => id !== null),
  );

  const toDeactivate = current.filter(
    (o) => o.userId === null || !values.reviewerIds.includes(o.userId),
  );
  if (toDeactivate.length > 0) {
    await tx.opinion.updateMany({
      where: { id: { in: toDeactivate.map((o) => o.id) } },
      data: { active: false },
    });
  }

  const toAdd = values.reviewerIds.filter((id) => !currentIds.has(id));
  if (toAdd.length === 0) return;

  const known = await tx.user.findMany({ where: { id: { in: toAdd } }, select: { id: true } });
  if (known.length === 0) return;

  await tx.opinion.createMany({
    // `description` jest w bazie wymagane; treść opinii dopisuje opiniujący, więc nowy
    // wpis startuje pusty i niepodpisany — tak liczy go raport zaległych opinii.
    data: known.map((u) => ({ contractId, userId: u.id, description: "", active: true })),
  });
}

/**
 * Pliki wgrane przed pierwszym zapisem czekają na `formSession` (kolumna z legacy).
 * Wiążemy je po tokenie, nie po identyfikatorach z formularza — token jest nadawany
 * po stronie serwera i nie da się przez niego wskazać cudzego załącznika.
 */
async function bindAttachments(tx: Tx, contractId: number, formSession: string | null) {
  if (!formSession) return;
  await tx.attachment.updateMany({
    where: { formSession, contractId: null },
    data: { contractId, formSession: null },
  });
}

/** Usunięcie rekordu — wyłącznie miękkie, tak jak `deleted` w legacy. */
export async function deleteContract(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const id = Number.parseInt(String(formData.get("recordId") ?? ""), 10);
  if (!Number.isSafeInteger(id)) throw new Error("Nieprawidłowy rekord.");

  await assertCanEditContract(actor, id);

  const record = await prisma.contract.findUnique({ where: { id }, select: { module: true } });

  await prisma.$transaction([
    prisma.contract.update({
      where: { id },
      data: { isDeleted: true, modifiedAt: new Date(), modifiedById: actor.id },
    }),
    prisma.contractHistory.create({
      data: {
        contractId: id,
        columnName: "deleted",
        oldValue: "0",
        newValue: "1",
        userId: actor.id,
      },
    }),
  ]);

  const path = modulePath(record?.module ?? "CONTRACT");
  revalidatePath(path);
  redirect(path);
}

/**
 * „zadaj pytanie" — pytanie o umowę trafia do notatek rekordu i powiadamia jego
 * właścicieli. Legacy wysyła je dalej mailem; tu poczty nie ruszamy (brak SMTP i
 * wprost pominięta funkcja wysyłki), więc zostaje obieg wewnętrzny na tych samych
 * tabelach: `remarks` + `shoutbox` + `shoutboxusers`.
 */
export async function askQuestion(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const id = Number.parseInt(String(formData.get("recordId") ?? ""), 10);
  const body = String(formData.get("body") ?? "").trim();
  if (!Number.isSafeInteger(id)) throw new Error("Nieprawidłowy rekord.");
  if (body.length === 0) throw new Error("Pytanie nie może być puste.");

  const contract = await prisma.contract.findUnique({
    where: { id },
    select: {
      isDeleted: true,
      module: true,
      userAccess: { select: { userId: true } },
    },
  });
  if (!contract || contract.isDeleted) throw new Error("Rekord nie istnieje.");

  const template = await prisma.messageTemplate.findFirst({ orderBy: { id: "asc" } });
  const recipients = contract.userAccess.map((a) => a.userId).filter((uid) => uid !== actor.id);

  await prisma.$transaction(async (tx) => {
    const remark = await tx.remark.create({
      data: { contractId: id, userId: actor.id, body: `Pytanie: ${body}`, active: true },
    });
    if (recipients.length === 0) return;
    const shout = await tx.shoutbox.create({
      data: { contractId: id, remarkId: remark.id, messageId: template?.id ?? null },
    });
    await tx.shoutboxRecipient.createMany({
      data: recipients.map((userId) => ({ shoutboxId: shout.id, userId, isRead: false })),
    });
  });

  revalidatePath(`${modulePath(contract.module)}/${id}`);
}

/**
 * „poproś o formularz" przy właścicielu umowy — prośba, żeby wypełnił Formularz
 * akceptacji umowy. Legacy wysyła ją mailem; poczty nie ruszamy, więc prośba idzie
 * tym samym obiegiem wewnętrznym co „zadaj pytanie": `remarks` + `shoutbox`.
 * Wymaga istniejącego rekordu — na nowym aneksie przycisk jest nieaktywny do zapisu.
 */
export async function requestAcceptanceForm(
  contractId: number,
  userId: number,
): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireActor();
  if (!Number.isSafeInteger(contractId) || !Number.isSafeInteger(userId)) {
    return { ok: false, error: "Nieprawidłowe żądanie." };
  }

  const [contract, target] = await Promise.all([
    prisma.contract.findUnique({
      where: { id: contractId },
      select: { isDeleted: true, identifier: true, module: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, login: true },
    }),
  ]);
  if (!contract || contract.isDeleted) return { ok: false, error: "Rekord nie istnieje." };
  if (!target) return { ok: false, error: "Nie znaleziono osoby." };

  try {
    await assertCanEditContract(actor, contractId);
  } catch {
    return { ok: false, error: "Brak uprawnień do tego rekordu." };
  }

  const template = await prisma.messageTemplate.findFirst({ orderBy: { id: "asc" } });

  await prisma.$transaction(async (tx) => {
    const remark = await tx.remark.create({
      data: {
        contractId,
        userId: actor.id,
        body: `Prośba o wypełnienie Formularza akceptacji umowy — ${userLabel(target)}`,
        active: true,
      },
    });
    const shout = await tx.shoutbox.create({
      data: { contractId, remarkId: remark.id, messageId: template?.id ?? null },
    });
    await tx.shoutboxRecipient.create({
      data: { shoutboxId: shout.id, userId: target.id, isRead: false },
    });
  });

  revalidatePath(`${modulePath(contract.module)}/${contractId}`);
  return { ok: true };
}

/** Formularz akceptacji umowy (procedura MDR) — pięć pól z `acceptance_form`. */
export async function saveAcceptanceForm(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const id = Number.parseInt(String(formData.get("recordId") ?? ""), 10);
  if (!Number.isSafeInteger(id)) throw new Error("Nieprawidłowy rekord.");

  await assertCanEditContract(actor, id);

  const on = (name: string) => formData.get(name) === "1" || formData.get(name) === "on";
  const ownerAccepted = on("ownerAccepted");

  const existing = await prisma.acceptanceForm.findUnique({ where: { contractId: id } });
  const data = {
    mdrProcedure: on("mdrProcedure"),
    initialVerification: on("initialVerification"),
    formSent: on("formSent"),
    ownerAccepted,
    // Znacznik akceptacji stawiamy raz — ponowny zapis nie przesuwa daty.
    ownerAcceptedAt: ownerAccepted ? (existing?.ownerAcceptedAt ?? new Date()) : null,
  };

  await prisma.acceptanceForm.upsert({
    where: { contractId: id },
    create: { contractId: id, ...data },
    update: data,
  });

  const record = await prisma.contract.findUnique({ where: { id }, select: { module: true } });
  revalidatePath(`${modulePath(record?.module ?? "CONTRACT")}/${id}`);
}

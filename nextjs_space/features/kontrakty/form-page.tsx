import { randomUUID } from "crypto";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { contractorLabel } from "@/lib/format";
import { currentActor, canEditContract } from "@/lib/authz";
import {
  BLANK_OPTION_NAME,
  loadFormDictionaries,
  optionId,
  type Option,
} from "@/lib/contracts/dictionaries";
import {
  annexDefaultsFrom,
  contractToFormValues,
  emptyFormValues,
  loadContractForForm,
} from "@/lib/contracts/record";
import { nextAnnexIdentifier } from "@/lib/contracts/identifier";
import { modulePath, registerOf, type RegisterModule } from "@/lib/contracts/modules";
import { ContractForm } from "./contract-form";
import type { SaveMode } from "./actions";

/**
 * Wspólna strona formularza dla wejść z paska akcji: „Edycja", „Dodaj aneks"
 * i „Stwórz projekt aneksu", oraz dla „Dodaj nowy wpis" z rejestru. Różnią się tylko
 * tym, co jest wpisane na starcie i jak nazwany jest ekran — sam formularz jest ten
 * sam, tak jak w legacy.
 */

const ANNEX_TYPE = "Aneks";
const NEW_ANNEX_STATUS = "Obowiązująca";
const NEW_PROJECT_STATUS = "Projekt - w toku";
const NEW_RISK_STATUS = "Dział ryzyka - aktywny";
/** Legacy `pri = 1` — waluta, na której otwiera się każdy nowy formularz. */
const DEFAULT_CURRENCY = "PLN";
/** „Eksport/Import" ma własny wiersz braku, nazwany inaczej niż w pozostałych słownikach. */
const NO_TRADE = "brak";

export interface ContractFormPageProps {
  id: number;
  mode: SaveMode;
  /** Rejestr, z którego przyszedł użytkownik. */
  basePath: string;
}

export async function ContractFormPage({ id, mode, basePath }: ContractFormPageProps) {
  const actor = await currentActor();
  if (!actor) redirect("/login");

  const record = await loadContractForForm(id);
  if (!record || record.isDeleted) notFound();

  // Prawo edycji rekordu wyjściowego jest warunkiem i edycji, i tworzenia jego aneksu.
  if (!(await canEditContract(actor, id))) redirect(`${basePath}/${id}`);

  const kind: RegisterModule =
    mode === "edit"
      ? (record.status?.kind ?? registerOf(record.module))
      : mode === "annex-project"
        ? "PROJECT"
        : "CONTRACT";

  const [dicts, annexType, defaultStatus, attachments] = await Promise.all([
    // Rekord niesie swoje wartości do list, żeby pozycja wygaszona (np. typ „Kontrakt")
    // nie zniknęła z formularza i nie wyczyściła się przy pierwszym zapisie.
    loadFormDictionaries(kind, record),
    mode === "edit" ? null : prisma.documentType.findFirst({ where: { name: ANNEX_TYPE } }),
    mode === "edit"
      ? null
      : prisma.contractStatus.findFirst({
          where: { kind, name: mode === "annex-project" ? NEW_PROJECT_STATUS : NEW_ANNEX_STATUS },
        }),
    mode === "edit"
      ? prisma.attachment.findMany({
          where: { contractId: id },
          orderBy: [{ isFinal: "desc" }, { id: "asc" }],
        })
      : [],
  ]);

  const values =
    mode === "edit"
      ? contractToFormValues(record)
      : annexDefaultsFrom(record, {
          // Numer aneksu pokazujemy z góry, żeby było widać, co powstanie; ostateczny
          // nadaje serwer przy zapisie, bo w międzyczasie mógł dojść inny aneks.
          identifier: mode === "annex" ? await nextAnnexIdentifier(record.id) : null,
          documentTypeId: annexType?.id ?? null,
          statusId: defaultStatus?.id ?? null,
        });

  const parentLabel = record.identifier ?? `#${record.id}`;

  /**
   * Wiersz „Aneks do umowy" / „Umowa" z odnośnikiem. Przy edycji nadrzędna jest umowa
   * rodzica rekordu, przy tworzeniu aneksu — rekord, z którego przyszliśmy, bo on
   * dopiero stanie się rodzicem. Rodzic bywa w innym rejestrze niż dziecko (projekt
   * aneksu wisi pod umową), więc ścieżkę bierzemy z jego własnego statusu.
   */
  const parentLink =
    mode === "edit"
      ? record.parent
        ? {
            identifier: record.parent.identifier ?? `#${record.parent.id}`,
            href: `${modulePath(record.parent.module)}/${record.parent.id}`,
          }
        : null
      : { identifier: parentLabel, href: `${basePath}/${id}` };

  const title =
    mode === "edit"
      ? `Edycja: ${parentLabel}`
      : mode === "annex"
        ? `Nowy aneks do ${parentLabel}`
        : `Nowy projekt aneksu do ${parentLabel}`;

  const subtitle =
    mode === "annex-project"
      ? "Rekord trafi do modułu Projekty i przejdzie obieg akceptacji, zanim stanie się aneksem."
      : mode === "annex"
        ? "Aneks zostanie podpięty pod umowę nadrzędną i dostanie kolejny numer w jej serii."
        : undefined;

  return (
    <ContractForm
      mode={mode}
      recordId={id}
      registerKind={kind}
      title={title}
      subtitle={subtitle}
      backHref={`${basePath}/${id}`}
      values={values}
      dicts={dicts}
      contractor={
        record.contractor
          ? {
              id: record.contractor.id,
              name: contractorLabel(record.contractor),
              vatId: record.contractor.vatId,
            }
          : null
      }
      debtor={
        record.debtor
          ? {
              id: record.debtor.id,
              name: contractorLabel(record.debtor),
              vatId: record.debtor.vatId,
            }
          : null
      }
      attachments={attachments.map((a) => ({
        id: a.id,
        name: a.name,
        url: a.storageKey ? `/api/files/${a.storageKey}` : null,
        isFinal: a.isFinal,
      }))}
      // Token sesji losujemy po stronie serwera przy każdym otwarciu formularza,
      // więc nie da się go zgadnąć ani podstawić cudzego (patrz bindAttachments).
      formSession={randomUUID()}
      showDebtor={kind === "RISK"}
      isProjectRecord={kind === "PROJECT"}
      parentLink={parentLink}
      acceptanceHref={`${basePath}/${id}/formularz-akceptacji`}
      questionHref={`${basePath}/${id}/pytanie`}
    />
  );
}

const NEW_RECORD_STATUS: Record<RegisterModule, string> = {
  CONTRACT: NEW_ANNEX_STATUS,
  PROJECT: NEW_PROJECT_STATUS,
  RISK: NEW_RISK_STATUS,
};

export interface NewRecordPageProps {
  /** Rejestr, z którego kliknięto „Dodaj nowy wpis". */
  kind: RegisterModule;
  basePath: string;
}

/**
 * „Dodaj nowy wpis" — ten sam formularz, ale pusty i bez rekordu wyjściowego.
 *
 * Wartości startowe biorą się ze zrzutu legacy: pola słownikowe otwierają się na
 * własnym wierszu „(brak danych)" (a nie na pustym wyborze), waluta na PLN,
 * „Eksport/Import" na „brak", a status na domyślnym statusie rejestru. Identyfikatora
 * nie ma — nadaje go serwer przy zapisie, bo zależy od spółki wybranej w tym
 * formularzu.
 */
export async function NewRecordPage({ kind, basePath }: NewRecordPageProps) {
  const actor = await currentActor();
  if (!actor) redirect("/login");

  const dicts = await loadFormDictionaries(kind);
  const blank = (options: Option[]) => optionId(options, BLANK_OPTION_NAME);

  const values = emptyFormValues({
    statusId: optionId(dicts.statuses, NEW_RECORD_STATUS[kind]),
    currencyId: optionId(dicts.currencies, DEFAULT_CURRENCY),
    tradeId: optionId(dicts.trades, NO_TRADE),
    deliveryMethodId: blank(dicts.deliveryMethods),
    companyId: blank(dicts.companies),
    primaryLocationId: blank(dicts.locations),
    domainId: blank(dicts.domains),
    noticePeriodId: blank(dicts.noticePeriods),
    natureId: blank(dicts.natures),
  });

  return (
    <ContractForm
      mode="create"
      recordId={null}
      registerKind={kind}
      title="Nowy wpis"
      subtitle="Numer nada system po zapisie — zależy od wybranej spółki, businessline'u i roku. Właścicieli, opiniujących i załączniki dodaje się w edycji, która otworzy się zaraz po zapisaniu."
      backHref={basePath}
      values={values}
      dicts={dicts}
      contractor={null}
      debtor={null}
      attachments={[]}
      formSession={randomUUID()}
      showDebtor={kind === "RISK"}
      isProjectRecord={kind === "PROJECT"}
      parentLink={null}
      acceptanceHref={null}
      questionHref={null}
    />
  );
}

"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { ContractStatusKind } from "@prisma/client";
import { Button, buttonClass } from "@/components/ui/button";
import { CONTROL_CLASS, FormRow, FormSection, YesNoRadio } from "@/components/ui/form";
import { BLANK_OPTION_NAME, type FormDictionaries, type Option } from "@/lib/contracts/dictionaries";
import type { ContractFormValues } from "@/lib/contracts/form-schema";
import { saveContract, type SaveContractState, type SaveMode } from "./actions";
import { ContractorPicker, type ContractorOption } from "./contractor-picker";
import { PeopleField } from "./people-field";
import { AttachmentsField, type AttachmentItem } from "./attachments-field";
import { PreviewPanel } from "./contract-preview-panel";

/**
 * Formularz umowy / projektu — jeden ekran dla „Dodaj nowy wpis", edycji, „Dodaj aneks"
 * i „Stwórz projekt aneksu", bo w legacy to jeden formularz różniący się tylko tym, co
 * jest w nim wypełnione i które wiersze pokazuje.
 *
 * Kolejność i nazwy pól idą za zrzutami z legacy. Dwa pola są tylko po stronie
 * projektów — „Data wysłania do podpisu" i „Opiniujący" — bo formularz aneksu umowy
 * ich nie pokazuje; zgadza się to z danymi, gdzie opinie wiszą na 3 860 projektach
 * i tylko 63 umowach (i te ostatnie to projekty, które umową dopiero się stały).
 *
 * Nowy wpis kończy się na OBSC — tak jak zrzut formularza „Dodaj nowy wpis". Nie ma
 * tam identyfikatora (nadaje go serwer po wyborze spółki), właścicieli, opiniujących
 * ani załączników: wszystkie trzy wymagają istniejącego rekordu i dochodzą w edycji,
 * która otwiera się od razu po zapisie.
 */

export interface ContractFormProps {
  mode: SaveMode;
  /** Edytowany rekord albo umowa nadrzędna aneksu; `null` dla nowego wpisu. */
  recordId: number | null;
  /** Rejestr, w którym powstaje nowy wpis — decyduje o `isProject` i o liście statusów. */
  registerKind: ContractStatusKind;
  title: string;
  subtitle?: string;
  backHref: string;
  values: ContractFormValues;
  dicts: FormDictionaries;
  contractor: ContractorOption | null;
  debtor: ContractorOption | null;
  attachments: AttachmentItem[];
  /** Token sesji formularza, nadany po stronie serwera. */
  formSession: string;
  /** Rekordy Działu ryzyka mają dłużnika; umowy i projekty nie. */
  showDebtor: boolean;
  /** Projekt: dochodzi „Data wysłania do podpisu" i „Opiniujący". */
  isProjectRecord: boolean;
  /** Umowa nadrzędna aneksu — wiersz „Aneks do umowy" z odnośnikiem, jak w legacy. */
  parentLink: { identifier: string; href: string } | null;
  /** Akcje wymagające zapisanego rekordu — `null` na formularzu nowego wpisu. */
  acceptanceHref: string | null;
  questionHref: string | null;
}

const EMPTY_STATE: SaveContractState = { errors: {} };

export function ContractForm(props: ContractFormProps) {
  const { values, dicts } = props;
  const isNew = props.mode === "create";
  const [state, formAction] = useFormState(saveContract, EMPTY_STATE);
  const formRef = useRef<HTMLFormElement>(null);

  const [indefinite, setIndefinite] = useState(values.indefinite);
  const [obsc, setObsc] = useState(values.obsc);
  const [companiesConnected, setCompaniesConnected] = useState(values.companiesConnected);
  const [tempForm, setTempForm] = useState(values.tempForm);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState<FormData | null>(null);

  const err = (field: string) => state.errors[field];
  const personName = (id: number) =>
    dicts.people.find((p) => p.id === String(id))?.name ?? `#${id}`;

  // Legacy pokazuje jedno pole „Opiniujący". Rekordy z dumpu miewają kilka aktywnych
  // opinii naraz, więc nadmiarowe niesiemy dalej ukrytymi polami, zamiast je kasować.
  const [firstReviewer, ...extraReviewers] = values.reviewerIds;

  /**
   * Wyjście z niezapisanego formularza kasuje wpisane dane, więc przyciski
   * prowadzące poza ekran pytają o potwierdzenie, gdy coś już zmieniono.
   */
  const confirmLeave = (event: React.MouseEvent) => {
    if (!dirty) return;
    if (!window.confirm("Formularz ma niezapisane zmiany. Opuścić go?")) event.preventDefault();
  };

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <Link href={props.backHref} className="text-sm text-muted-foreground hover:text-foreground">
          ← Anuluj i wróć
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-semibold">{props.title}</h1>
        {props.subtitle && <p className="mt-1 text-sm text-muted-foreground">{props.subtitle}</p>}
      </div>

      {state.errors._form && (
        <p
          role="alert"
          className="rounded-md border border-red-600/30 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.errors._form}
        </p>
      )}

      {preview && (
        <PreviewPanel
          data={preview}
          dicts={dicts}
          parentLabel={props.parentLink?.identifier ?? null}
          isProjectRecord={props.isProjectRecord}
          onClose={() => setPreview(null)}
        />
      )}

      <form
        ref={formRef}
        action={formAction}
        onInput={() => setDirty(true)}
        hidden={preview !== null}
        className="space-y-4"
      >
        <input type="hidden" name="mode" value={props.mode} />
        {props.recordId !== null && (
          <input type="hidden" name="recordId" value={props.recordId} />
        )}
        {isNew && <input type="hidden" name="registerKind" value={props.registerKind} />}

        <FormSection title="Klasyfikacja">
          <SelectRow
            label="Forma doręczenia"
            name="deliveryMethodId"
            options={dicts.deliveryMethods}
            value={values.deliveryMethodId}
            error={err("deliveryMethodId")}
          />

          {/* Nowy wpis nie był jeszcze nigdzie wysłany, więc tego wiersza nie ma —
              tak samo jak na zrzucie „Dodaj nowy wpis" i jak przy tworzeniu aneksu,
              gdzie data wysłania jako jedyna z dat startuje pusta. */}
          {props.isProjectRecord && !isNew && (
            <FormRow label="Data wysłania do podpisu" htmlFor="sentOn" error={err("sentOn")}>
              <input
                id="sentOn"
                name="sentOn"
                type="date"
                defaultValue={values.sentOn ?? ""}
                className={`${CONTROL_CLASS} max-w-xs`}
              />
            </FormRow>
          )}

          {/* Nowy wpis nie ma tego wiersza: numer zależy od spółki i businessline'u
              wybranych niżej, więc nadaje go serwer przy zapisie. */}
          {!isNew && (
            <FormRow
              label="Identyfikator"
              htmlFor="identifier"
              error={err("identifier")}
              hint={
                props.mode === "edit"
                  ? undefined
                  : "Numer proponowany przez system — można go nadpisać. Powiązanie z umową nadrzędną nie zależy od wpisanego numeru."
              }
            >
              <input
                id="identifier"
                name="identifier"
                type="text"
                defaultValue={values.identifier ?? ""}
                className={CONTROL_CLASS}
                aria-invalid={Boolean(err("identifier"))}
              />
            </FormRow>
          )}

          {props.parentLink && (
            <FormRow label={props.isProjectRecord ? "Umowa" : "Aneks do umowy"}>
              <Link
                href={props.parentLink.href}
                onClick={confirmLeave}
                className="inline-block py-1.5 text-sm text-primary hover:underline"
              >
                {props.parentLink.identifier}
              </Link>
            </FormRow>
          )}

          <SelectRow
            label="Typ dokumentu"
            name="documentTypeId"
            options={dicts.documentTypes}
            value={values.documentTypeId}
            error={err("documentTypeId")}
          />
          <FormRow label="Weksel">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="bill"
                value="1"
                defaultChecked={values.bill}
                className="h-4 w-4"
              />
              weksel zabezpiecza umowę
            </label>
          </FormRow>
          <TextRow
            label="Numer umowy"
            name="contractReference"
            value={values.contractReference}
            error={err("contractReference")}
          />
          <SelectRow
            label="Status"
            name="statusId"
            options={dicts.statuses}
            value={values.statusId}
            error={err("statusId")}
          />
          <SelectRow
            label="Spółka"
            name="companyId"
            options={dicts.companies}
            value={values.companyId}
            error={err("companyId")}
          />
          <SelectRow
            label="Businessline"
            name="businesslineId"
            options={dicts.businesslines}
            value={values.businesslineId}
            error={err("businesslineId")}
          />
          <SelectRow
            label="Lokalizacja"
            name="primaryLocationId"
            options={dicts.locations}
            value={values.primaryLocationId}
            error={err("primaryLocationId")}
          />
          <SelectRow
            label="Rodzaj umowy"
            name="domainId"
            options={dicts.domains}
            value={values.domainId}
            error={err("domainId")}
          />
          <FormRow label="Przedmiot umowy" htmlFor="description" error={err("description")}>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={values.description ?? ""}
              className={CONTROL_CLASS}
            />
          </FormRow>
        </FormSection>

        <FormSection title="Terminy">
          <FormRow label="Data zawarcia" htmlFor="dateBegin" error={err("dateBegin")}>
            <input
              id="dateBegin"
              name="dateBegin"
              type="date"
              defaultValue={values.dateBegin ?? ""}
              className={`${CONTROL_CLASS} max-w-xs`}
            />
          </FormRow>

          <FormRow label="Data zakończenia" htmlFor="dateEnd" error={err("dateEnd")}>
            <div className="flex flex-wrap items-center gap-3">
              <input
                id="dateEnd"
                name="dateEnd"
                type="date"
                defaultValue={values.dateEnd ?? ""}
                disabled={indefinite}
                className={`${CONTROL_CLASS} max-w-xs`}
                aria-invalid={Boolean(err("dateEnd"))}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="indefinite"
                  value="1"
                  checked={indefinite}
                  onChange={(e) => setIndefinite(e.target.checked)}
                  className="h-4 w-4"
                />
                na czas nieokreślony
              </label>
            </div>
          </FormRow>

          <SelectRow
            label="Okres wypowiedzenia"
            name="noticePeriodId"
            options={dicts.noticePeriods}
            value={values.noticePeriodId}
            error={err("noticePeriodId")}
          />
        </FormSection>

        {/* Jedna sekcja, bo legacy przeplata tu pieniądze ze stronami: wynagrodzenie,
            waluta, termin płatności, kontrahenci, podmiot powiązane i dopiero na końcu
            „Inne określenie wynagrodzenia". Kolejność zostaje taka jak w legacy. */}
        <FormSection title="Wynagrodzenie i strony">
          <FormRow label="Wynagrodzenie" htmlFor="salary" error={err("salary")}>
            <input
              id="salary"
              name="salary"
              type="text"
              inputMode="decimal"
              defaultValue={values.salary ?? ""}
              className={`${CONTROL_CLASS} max-w-xs tabular-nums`}
              aria-invalid={Boolean(err("salary"))}
            />
          </FormRow>
          <SelectRow
            label="Waluta"
            name="currencyId"
            options={dicts.currencies}
            value={values.currencyId}
            error={err("currencyId")}
          />
          <TextRow
            label="Termin płatności"
            name="paymentTerm"
            value={values.paymentTerm}
            error={err("paymentTerm")}
          />
          <FormRow label="Kontrahenci" error={err("contractorId")}>
            <ContractorPicker
              name="contractorId"
              label="Kontrahenci"
              initial={props.contractor}
              allowCreate
            />
          </FormRow>
          {props.showDebtor && (
            <FormRow label="Dłużnik" error={err("debtorId")}>
              <ContractorPicker name="debtorId" label="Dłużnik" initial={props.debtor} />
            </FormRow>
          )}
          <FormRow label="Podmiot powiązane">
            <YesNoRadio
              name="companiesConnected"
              value={companiesConnected}
              onChange={setCompaniesConnected}
            />
          </FormRow>
          <TextRow
            label="Inne określenie wynagrodzenia"
            name="specificSalaryTerms"
            value={values.specificSalaryTerms}
            error={err("specificSalaryTerms")}
          />
        </FormSection>

        <FormSection title="Cechy">
          <SelectRow
            label="Charakter umowy"
            name="natureId"
            options={dicts.natures}
            value={values.natureId}
            error={err("natureId")}
          />
          <SelectRow
            label="Eksport/Import"
            name="tradeId"
            options={dicts.trades}
            value={values.tradeId}
            error={err("tradeId")}
          />

          <FormRow label="Formularz" hint="Puste = nie określono, tak jak -1 w danych legacy.">
            <div className="flex items-center gap-4">
              {[
                { label: "Tak", v: true as boolean | null },
                { label: "Nie", v: false as boolean | null },
                { label: "nie określono", v: null as boolean | null },
              ].map((opt) => (
                <label key={String(opt.v)} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="tempFormChoice"
                    checked={tempForm === opt.v}
                    onChange={() => setTempForm(opt.v)}
                    className="h-4 w-4"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            {/* Trójstan: „nie określono" nie wysyła pola, więc schemat zapisze null. */}
            {tempForm !== null && (
              <input type="hidden" name="tempForm" value={tempForm ? "1" : "0"} />
            )}
          </FormRow>

        </FormSection>

        <FormSection title="Uwagi">
          <FormRow label="Uwagi" htmlFor="remarks" error={err("remarks")}>
            <textarea
              id="remarks"
              name="remarks"
              rows={4}
              defaultValue={values.remarks ?? ""}
              className={CONTROL_CLASS}
            />
          </FormRow>

          <FormRow label="OBSC">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="obsc"
                value="1"
                checked={obsc}
                onChange={(e) => setObsc(e.target.checked)}
                className="h-4 w-4"
              />
              rekord objęty OBSC
            </label>
          </FormRow>
          {obsc && (
            <TextRow
              label="Opis OBSC"
              name="obscDescription"
              value={values.obscDescription}
              error={err("obscDescription")}
            />
          )}

          {/* Pole spoza formularza legacy (kolumna `insurance_guarantee` istnieje, ale
              ekran aneksu jej nie pokazuje). Stoi na końcu flag, żeby nie rozbijać
              kolejności, do której przyzwyczajony jest dział prawny. */}
          <FormRow label="Gwarancja / ubezpieczenie">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="insuranceGuarantee"
                value="1"
                defaultChecked={values.insuranceGuarantee}
                className="h-4 w-4"
              />
              umowa objęta gwarancją lub ubezpieczeniem
            </label>
          </FormRow>
        </FormSection>

        {/* Właściciele, opiniujący i załączniki wiszą na istniejącym rekordzie, więc
            formularz nowego wpisu ich nie pokazuje — tak samo jak legacy. Dochodzą
            w edycji, która otwiera się zaraz po zapisie. */}
        {!isNew && (
          <FormSection title="Osoby">
            <FormRow label="Właściciel umowy" error={err("ownerIds") ?? err("editorIds")}>
              <PeopleField
                name="ownerIds"
                label="Właściciel umowy"
                people={dicts.people}
                initialIds={values.ownerIds}
                editableName="editorIds"
                initialEditableIds={values.editorIds}
                // „poproś o formularz" potrzebuje istniejącego rekordu; na nowym aneksie
                // przycisk jest nieaktywny do pierwszego zapisu.
                formRequestContractId={props.mode === "edit" ? props.recordId : null}
              />
            </FormRow>

            {props.isProjectRecord && (
              <FormRow
                label="Opiniujący"
                htmlFor="reviewerIds"
                error={err("reviewerIds")}
                hint="Wskazanie osoby otwiera dla niej wpis w obiegu opinii."
              >
                <select
                  id="reviewerIds"
                  name="reviewerIds"
                  defaultValue={firstReviewer === undefined ? "" : String(firstReviewer)}
                  className={CONTROL_CLASS}
                  aria-invalid={Boolean(err("reviewerIds"))}
                >
                  <option value="">— brak —</option>
                  {dicts.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {extraReviewers.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Pozostali w bieżącym obiegu: {extraReviewers.map(personName).join(", ")}
                    {extraReviewers.map((id) => (
                      <input key={id} type="hidden" name="reviewerIds" value={id} />
                    ))}
                  </p>
                )}
              </FormRow>
            )}
          </FormSection>
        )}

        {!isNew && (
          <FormSection title="Załączniki">
            <AttachmentsField
              contractId={props.mode === "edit" ? props.recordId : null}
              formSession={props.formSession}
              initial={props.attachments}
            />
          </FormSection>
        )}

        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-4 shadow-sm">
          <RecordActions
            acceptanceHref={props.acceptanceHref}
            questionHref={props.questionHref}
            onLeave={confirmLeave}
          />

          <div className="ml-auto flex gap-2">
            <Button onClick={() => formRef.current && setPreview(new FormData(formRef.current))}>
              Podgląd
            </Button>
            <SubmitButton />
          </div>
        </div>
      </form>
    </div>
  );
}

/**
 * Pasek akcji pod formularzem. Wszystkie trzy potrzebują zapisanego rekordu, więc na
 * nowym wpisie stoją nieaktywne z podpisem, zamiast prowadzić donikąd — tak samo jak
 * „poproś o formularz" przy właścicielu umowy.
 */
function RecordActions({
  acceptanceHref,
  questionHref,
  onLeave,
}: {
  acceptanceHref: string | null;
  questionHref: string | null;
  onLeave: (event: React.MouseEvent) => void;
}) {
  if (acceptanceHref === null || questionHref === null) {
    return (
      <>
        <Button disabled>Formularz akceptacji umowy-pdf</Button>
        <Button disabled>Formularz akceptacji umowy</Button>
        <Button disabled>zadaj pytanie</Button>
        <span className="text-xs text-muted-foreground">dostępne po zapisie</span>
      </>
    );
  }

  return (
    <>
      <Link
        href={`${acceptanceHref}?druk=1`}
        onClick={onLeave}
        className={buttonClass("secondary")}
      >
        Formularz akceptacji umowy-pdf
      </Link>
      <Link href={acceptanceHref} onClick={onLeave} className={buttonClass("secondary")}>
        Formularz akceptacji umowy
      </Link>
      <Link href={questionHref} onClick={onLeave} className={buttonClass("secondary")}>
        zadaj pytanie
      </Link>
    </>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "Zapisuję…" : "Zapisz"}
    </Button>
  );
}

function TextRow({
  label,
  name,
  value,
  error,
}: {
  label: string;
  name: string;
  value: string | null;
  error?: string;
}) {
  return (
    <FormRow label={label} htmlFor={name} error={error}>
      <input
        id={name}
        name={name}
        type="text"
        defaultValue={value ?? ""}
        className={CONTROL_CLASS}
        aria-invalid={Boolean(error)}
      />
    </FormRow>
  );
}

function SelectRow({
  label,
  name,
  options,
  value,
  error,
}: {
  label: string;
  name: string;
  options: Option[];
  value: number | null;
  error?: string;
}) {
  // Większość słowników niesie własny wiersz „(brak danych)". Gdy pole już go wskazuje,
  // nie dokładamy nad nim drugiej pozycji pustej — legacy pokazuje tylko tę ze słownika.
  // Rekord z prawdziwym brakiem wskazania nadal ma „— brak —", żeby zapis nie podmienił
  // mu cichcem pustej wartości na identyfikator wiersza „(brak danych)".
  const hasBlankRow = options.some((o) => o.name === BLANK_OPTION_NAME);

  return (
    <FormRow label={label} htmlFor={name} error={error}>
      <select
        id={name}
        name={name}
        defaultValue={value === null ? "" : String(value)}
        className={CONTROL_CLASS}
        aria-invalid={Boolean(error)}
      >
        {(!hasBlankRow || value === null) && <option value="">— brak —</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </FormRow>
  );
}

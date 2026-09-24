"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button, buttonClass } from "@/components/ui/button";
import { CONTROL_CLASS, FormRow, FormSection } from "@/components/ui/form";
import {
  CONTRACTOR_LIMITS,
  NO_NIP_WARNING,
  nipCollisionMessage,
  nipCollisionQuestion,
  normaliseVatId,
} from "@/lib/contractors";
import { createContractor, updateContractor, type ContractorFormState } from "./actions";

/**
 * Formularz kontrahenta — dopisanie (każdy zalogowany) i edycja (administrator).
 *
 * Pola i walidacja idą za docs/features/20: NIP nie jest obowiązkowy, bo firma zagraniczna
 * go nie ma, ale jego brak ostrzega. Zajęty NIP nigdy nie podmienia kontrahenta po cichu:
 * przy dopisywaniu formularz pyta „Użyć go?", przy edycji — czy zapisać mimo to.
 */

export interface ContractorFormFields {
  shortName: string;
  fullName: string;
  vatId: string;
  register: string;
  address: string;
  isCeidg: boolean;
  isConnected: boolean;
}

const EMPTY_CONTRACTOR: ContractorFormFields = {
  shortName: "",
  fullName: "",
  vatId: "",
  register: "",
  address: "",
  isCeidg: false,
  isConnected: false,
};

export interface ContractorFormProps {
  mode: "create" | "edit";
  /** Edytowany wpis; przy dopisywaniu brak. */
  recordId?: number;
  /** Wartości startowe edytowanego wpisu; nowy wpis startuje pusty. */
  initial?: ContractorFormFields;
  title: string;
  subtitle?: string;
  backHref: string;
}

const EMPTY_STATE: ContractorFormState = { errors: {} };

export function ContractorForm({
  mode,
  recordId,
  initial = EMPTY_CONTRACTOR,
  title,
  subtitle,
  backHref,
}: ContractorFormProps) {
  const [state, formAction] = useFormState(
    mode === "create" ? createContractor : updateContractor,
    EMPTY_STATE,
  );
  const [values, setValues] = useState(initial);
  const [conflict, setConflict] = useState(state.conflict ?? null);
  const nipRef = useRef<HTMLInputElement>(null);

  // Każda odpowiedź serwera stawia pytanie o kolizję od nowa albo je zdejmuje.
  useEffect(() => {
    setConflict(state.conflict ?? null);
  }, [state]);

  const set = <K extends keyof ContractorFormFields>(key: K, value: ContractorFormFields[K]) =>
    setValues((current) => ({ ...current, [key]: value }));
  const err = (field: string) => state.errors[field];
  const described = (field: string) => (err(field) ? `k-${field}-error` : undefined);

  const dismissConflict = () => {
    setConflict(null);
    nipRef.current?.focus();
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <Link href={backHref} className="text-sm text-muted-foreground hover:text-foreground">
          ← Anuluj i wróć
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>

      {state.errors._form && (
        <p
          role="alert"
          className="rounded-md border border-red-600/30 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.errors._form}
        </p>
      )}

      <form action={formAction} className="space-y-4">
        {recordId !== undefined && <input type="hidden" name="id" value={recordId} />}

        <FormSection title="Dane">
          <FormRow label="Nazwa skrócona" htmlFor="k-shortName" required error={err("shortName")}>
            <input
              id="k-shortName"
              name="shortName"
              value={values.shortName}
              onChange={(e) => set("shortName", e.target.value)}
              maxLength={CONTRACTOR_LIMITS.shortName}
              required
              aria-invalid={Boolean(err("shortName"))}
              aria-describedby={described("shortName")}
              className={CONTROL_CLASS}
            />
          </FormRow>

          <FormRow label="Nazwa pełna" htmlFor="k-fullName" error={err("fullName")}>
            <input
              id="k-fullName"
              name="fullName"
              value={values.fullName}
              onChange={(e) => set("fullName", e.target.value)}
              maxLength={CONTRACTOR_LIMITS.fullName}
              aria-invalid={Boolean(err("fullName"))}
              aria-describedby={described("fullName")}
              className={CONTROL_CLASS}
            />
          </FormRow>

          {/* Podpowiedź, ostrzeżenie i pytanie o kolizję stoją pod polem razem — `hint`
              z FormRow znika przy błędzie, a tu ma zostać. */}
          <FormRow label="NIP" htmlFor="k-vatId" error={err("vatId")}>
            <input
              id="k-vatId"
              ref={nipRef}
              name="vatId"
              value={values.vatId}
              onChange={(e) => {
                set("vatId", e.target.value);
                // Pytanie dotyczyło poprzedniego numeru — po zmianie traci sens.
                setConflict(null);
              }}
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={Boolean(err("vatId"))}
              aria-describedby={["k-vatId-hint", described("vatId")].filter(Boolean).join(" ")}
              className={CONTROL_CLASS}
            />
            <p id="k-vatId-hint" className="mt-1 text-xs text-muted-foreground">
              10 cyfr — kreski i spacje zostaną usunięte. Firma zagraniczna bez polskiego NIP-u:
              zostaw puste.
            </p>
            <p aria-live="polite" className="text-xs font-medium text-amber-800">
              {normaliseVatId(values.vatId) === null ? NO_NIP_WARNING : ""}
            </p>
            {conflict && (
              <div
                role="alert"
                className="mt-2 rounded-md border border-amber-600/30 bg-amber-50 p-3 text-sm text-amber-900"
              >
                <p className="font-medium">
                  {mode === "create"
                    ? nipCollisionQuestion(conflict.name)
                    : `${nipCollisionMessage(conflict.name)} Zapisać mimo to?`}
                </p>
                {conflict.vatId && <p className="mt-0.5 text-xs">NIP w słowniku: {conflict.vatId}</p>}
                {mode === "edit" && (
                  <p className="mt-0.5 text-xs">
                    Oba wpisy będą miały ten sam NIP i trafią na listę duplikatów.
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {mode === "create" ? (
                    <Link href={`/kontrahenci/${conflict.id}`} className={buttonClass("primary")}>
                      Tak — przejdź do kontrahenta
                    </Link>
                  ) : (
                    <>
                      <button
                        type="submit"
                        name="confirmVatId"
                        value={conflict.nip}
                        className={buttonClass("primary")}
                      >
                        Tak — zapisz mimo to
                      </button>
                      <Link href={`/kontrahenci/${conflict.id}`} className={buttonClass("secondary")}>
                        Otwórz {conflict.name}
                      </Link>
                    </>
                  )}
                  <Button onClick={dismissConflict}>Nie — popraw NIP</Button>
                </div>
              </div>
            )}
          </FormRow>

          <FormRow label="KRS / rejestr" htmlFor="k-register" error={err("register")}>
            <input
              id="k-register"
              name="register"
              value={values.register}
              onChange={(e) => set("register", e.target.value)}
              maxLength={CONTRACTOR_LIMITS.register}
              aria-invalid={Boolean(err("register"))}
              aria-describedby={described("register")}
              className={CONTROL_CLASS}
            />
          </FormRow>

          <FormRow label="Adres" htmlFor="k-address" error={err("address")}>
            <textarea
              id="k-address"
              name="address"
              value={values.address}
              onChange={(e) => set("address", e.target.value)}
              maxLength={CONTRACTOR_LIMITS.address}
              rows={3}
              aria-invalid={Boolean(err("address"))}
              aria-describedby={described("address")}
              className={CONTROL_CLASS}
            />
          </FormRow>

          <FormRow label="CEIDG" htmlFor="k-isCeidg">
            <div className="flex items-center gap-2 pt-1.5">
              <input
                id="k-isCeidg"
                type="checkbox"
                name="isCeidg"
                value="1"
                checked={values.isCeidg}
                onChange={(e) => set("isCeidg", e.target.checked)}
                aria-describedby="k-isCeidg-hint"
                className="h-4 w-4"
              />
              <span id="k-isCeidg-hint" className="text-xs text-muted-foreground">
                jednoosobowa działalność gospodarcza — wpis w CEIDG, nie w KRS
              </span>
            </div>
          </FormRow>

          <FormRow label="Podmiot powiązany" htmlFor="k-isConnected">
            <div className="pt-1.5">
              <input
                id="k-isConnected"
                type="checkbox"
                name="isConnected"
                value="1"
                checked={values.isConnected}
                onChange={(e) => set("isConnected", e.target.checked)}
                className="h-4 w-4"
              />
            </div>
          </FormRow>
        </FormSection>

        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton label={mode === "create" ? "Dodaj kontrahenta" : "Zapisz zmiany"} />
          <Link href={backHref} className={buttonClass("secondary")}>
            Anuluj
          </Link>
        </div>
      </form>
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "Zapisuję…" : label}
    </Button>
  );
}

"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { CONTROL_CLASS, FormRow } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import {
  grantLocation,
  revokeLocation,
  updateLocation,
  type LocationActionState,
} from "./actions";

/**
 * Formularze administratora na stronie lokalizacji. Po stronie klienta jest tylko stan
 * wysyłki i komunikat zwrotny; walidacja i uprawnienia siedzą w akcjach serwerowych.
 */

const IDLE: LocationActionState = {};

function Feedback({ state }: { state: LocationActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm font-medium text-red-700">
        {state.error}
      </p>
    );
  }
  if (state.notice) {
    return (
      <p role="status" className="text-sm text-emerald-700">
        {state.notice}
      </p>
    );
  }
  return null;
}

function SubmitButton({
  label,
  busyLabel,
  variant = "primary",
}: {
  label: string;
  busyLabel: string;
  variant?: ButtonVariant;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? busyLabel : label}
    </Button>
  );
}

export interface PersonOption {
  id: number;
  label: string;
  /** Rekord odtworzony z katalogu legacy — nie może się zalogować do czasu eksportu. */
  placeholder: boolean;
}

export function GrantForm({ locationId, people }: { locationId: number; people: PersonOption[] }) {
  const [state, formAction] = useFormState(grantLocation, IDLE);
  const accounts = people.filter((p) => !p.placeholder);
  const directory = people.filter((p) => p.placeholder);

  return (
    <form action={formAction} className="mt-4 space-y-2 border-t border-border/60 pt-4">
      <input type="hidden" name="locationId" value={locationId} />
      <label htmlFor="grant-user" className="block text-sm font-medium">
        Przyznaj dostęp
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id="grant-user"
          name="userId"
          required
          defaultValue=""
          className={cn(CONTROL_CLASS, "w-auto min-w-[16rem] flex-1")}
        >
          <option value="" disabled>
            — wybierz użytkownika —
          </option>
          {accounts.length > 0 && (
            <optgroup label="Konta">
              {accounts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </optgroup>
          )}
          {directory.length > 0 && (
            <optgroup label="Rekordy z katalogu (bez logowania)">
              {directory.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <SubmitButton label="Przyznaj dostęp" busyLabel="Przyznaję…" />
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function RevokeForm({
  locationId,
  locationName,
  userId,
  userName,
}: {
  locationId: number;
  locationName: string;
  userId: number;
  userName: string;
}) {
  return (
    <form
      action={revokeLocation}
      onSubmit={(event) => {
        if (!window.confirm(`Odebrać użytkownikowi ${userName} dostęp do lokalizacji ${locationName}?`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="locationId" value={locationId} />
      <input type="hidden" name="userId" value={userId} />
      <SubmitButton label="Odbierz dostęp" busyLabel="Odbieram…" variant="danger" />
    </form>
  );
}

export function LocationEditForm({
  locationId,
  name,
  active,
}: {
  locationId: number;
  name: string;
  active: boolean;
}) {
  const [state, formAction] = useFormState(updateLocation, IDLE);

  return (
    <form action={formAction}>
      <input type="hidden" name="locationId" value={locationId} />
      <FormRow label="Nazwa" htmlFor="location-name" required>
        <input
          id="location-name"
          name="name"
          defaultValue={name}
          required
          maxLength={45}
          className={CONTROL_CLASS}
        />
      </FormRow>
      <FormRow
        label="Aktywna"
        htmlFor="location-active"
        hint="Wyłączona lokalizacja znika z list wyboru w formularzu i w filtrach rejestrów, ale zostaje na rekordach, które już ją mają."
      >
        <input
          id="location-active"
          type="checkbox"
          name="active"
          value="1"
          defaultChecked={active}
          className="mt-2 h-4 w-4"
        />
      </FormRow>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <SubmitButton label="Zapisz" busyLabel="Zapisuję…" />
        <Feedback state={state} />
      </div>
    </form>
  );
}

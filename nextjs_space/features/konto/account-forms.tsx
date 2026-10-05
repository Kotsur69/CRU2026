"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { signOut, useSession } from "next-auth/react";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONTROL_CLASS, FormRow } from "@/components/ui/form";
import { changePassword, updateProfile, type AccountFormState } from "./actions";

const IDLE: AccountFormState = { status: "idle" };

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** Form-level outcome, announced politely so screen readers hear it without a focus jump. */
function FormStatus({ state }: { state: AccountFormState }) {
  if (state.status === "idle" || !state.message) return <p aria-live="polite" className="sr-only" />;
  const isOk = state.status === "ok";
  return (
    <p
      aria-live="polite"
      className={
        isOk
          ? "flex items-center gap-1.5 text-sm font-medium text-green-700"
          : "text-sm font-medium text-red-700"
      }
    >
      {isOk && <CheckCircle2 className="h-4 w-4" aria-hidden />}
      {state.message}
    </p>
  );
}

function fieldProps(state: AccountFormState, name: string) {
  const error = state.fieldErrors?.[name];
  return {
    id: name,
    name,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${name}-error` : undefined,
  };
}

interface ProfileFormProps {
  firstName: string;
  lastName: string;
}

export function ProfileForm({ firstName, lastName }: ProfileFormProps) {
  const [state, formAction] = useFormState(updateProfile, IDLE);
  const { update } = useSession();
  // `update` changes identity every time the session refreshes; depending on it
  // would re-run the effect after each refresh and loop. Read it through a ref.
  const updateRef = useRef(update);
  updateRef.current = update;

  // Refresh the client session so the name in the top bar follows the change.
  useEffect(() => {
    if (state.status === "ok") void updateRef.current();
  }, [state]);

  return (
    <form action={formAction} noValidate>
      <FormRow label="Imię" htmlFor="firstName" required error={state.fieldErrors?.firstName}>
        <input
          {...fieldProps(state, "firstName")}
          defaultValue={firstName}
          autoComplete="given-name"
          maxLength={80}
          required
          className={CONTROL_CLASS}
        />
      </FormRow>
      <FormRow label="Nazwisko" htmlFor="lastName" required error={state.fieldErrors?.lastName}>
        <input
          {...fieldProps(state, "lastName")}
          defaultValue={lastName}
          autoComplete="family-name"
          maxLength={80}
          required
          className={CONTROL_CLASS}
        />
      </FormRow>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <SubmitButton label="Zapisz" pendingLabel="Zapisywanie…" />
        <FormStatus state={state} />
      </div>
    </form>
  );
}

interface PasswordInputProps {
  name: string;
  autoComplete: "current-password" | "new-password";
  state: AccountFormState;
  isVisible: boolean;
}

function PasswordInput({ name, autoComplete, state, isVisible }: PasswordInputProps) {
  return (
    <input
      {...fieldProps(state, name)}
      type={isVisible ? "text" : "password"}
      autoComplete={autoComplete}
      required
      className={CONTROL_CLASS}
    />
  );
}

interface PasswordFormProps {
  login: string;
  /** Passed from the server: lib/password-policy uses Node crypto and cannot ship to the browser. */
  minLength: number;
}

export function PasswordForm({ login, minLength }: PasswordFormProps) {
  const [state, formAction] = useFormState(changePassword, IDLE);
  const [isVisible, setIsVisible] = useState(false);

  // The server already revoked every session of this account; leave cleanly.
  useEffect(() => {
    if (state.status !== "ok") return;
    const timer = setTimeout(() => void signOut({ callbackUrl: "/login" }), 1500);
    return () => clearTimeout(timer);
  }, [state]);

  return (
    <form action={formAction} noValidate>
      {/* Lets password managers attach the new password to the right account. Visually
          hidden rather than `hidden`: managers skip display:none fields. */}
      <input
        type="text"
        name="username"
        value={login}
        autoComplete="username"
        readOnly
        tabIndex={-1}
        aria-hidden
        className="sr-only"
      />
      {/* Once changed, the session is already revoked — block a second submit. */}
      <fieldset disabled={state.status === "ok"} className="contents">
      <FormRow
        label="Obecne hasło"
        htmlFor="currentPassword"
        required
        error={state.fieldErrors?.currentPassword}
      >
        <PasswordInput name="currentPassword" autoComplete="current-password" state={state} isVisible={isVisible} />
      </FormRow>
      <FormRow
        label="Nowe hasło"
        htmlFor="newPassword"
        required
        hint={`Co najmniej ${minLength} znaków: litery oraz cyfra lub znak specjalny.`}
        error={state.fieldErrors?.newPassword}
      >
        <PasswordInput name="newPassword" autoComplete="new-password" state={state} isVisible={isVisible} />
      </FormRow>
      <FormRow
        label="Powtórz nowe hasło"
        htmlFor="confirmPassword"
        required
        error={state.fieldErrors?.confirmPassword}
      >
        <PasswordInput name="confirmPassword" autoComplete="new-password" state={state} isVisible={isVisible} />
      </FormRow>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <SubmitButton label="Zmień hasło" pendingLabel="Zmienianie…" />
        <button
          type="button"
          onClick={() => setIsVisible((v) => !v)}
          aria-pressed={isVisible}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isVisible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          {isVisible ? "Ukryj hasła" : "Pokaż hasła"}
        </button>
        <FormStatus state={state} />
      </div>
      </fieldset>
    </form>
  );
}

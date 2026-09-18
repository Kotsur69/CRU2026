import { cn } from "@/lib/utils";

/**
 * Prymitywy formularza rejestru.
 *
 * Układ odtwarza formularz legacy: etykieta w lewej kolumnie, kontrolka w prawej,
 * wiersze oddzielone cienką linią. Na wąskim ekranie kolumny składają się pionowo,
 * bo dwukolumnowa siatka z legacy nie mieści się na telefonie.
 *
 * Kontrolki są natywne (input/select/textarea) — reszta aplikacji też taka jest, a
 * natywny select niesie za darmo klawiaturę, wyszukiwanie po literach i czytnik ekranu.
 */

export const CONTROL_CLASS =
  "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
  "disabled:cursor-not-allowed disabled:opacity-50 " +
  "aria-[invalid=true]:border-red-600 aria-[invalid=true]:ring-red-600/30";

export interface FormRowProps {
  label: string;
  /** Wiąże etykietę z kontrolką; pomijane przy grupach (radio, checkboxy). */
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormRow({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
  className,
}: FormRowProps) {
  return (
    <div
      className={cn(
        "grid gap-1 border-b border-border/60 py-2.5 last:border-0 sm:grid-cols-3 sm:items-start sm:gap-3",
        className,
      )}
    >
      <label htmlFor={htmlFor} className="pt-1.5 text-sm text-muted-foreground sm:col-span-1">
        {label}
        {required && (
          <span className="ml-0.5 text-red-600" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <div className="sm:col-span-2">
        {children}
        {hint && !error && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        {error && <FieldError id={htmlFor ? `${htmlFor}-error` : undefined}>{error}</FieldError>}
      </div>
    </div>
  );
}

/** Błąd pola — pod kontrolką i ogłaszany czytnikowi ekranu. */
export function FieldError({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-1 text-xs font-medium text-red-700">
      {children}
    </p>
  );
}

/** Nagłówek sekcji formularza — ta sama typografia co sekcje w podglądzie. */
export function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-5 shadow-sm">
      <h2 className="mb-2 font-heading text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div>{children}</div>
    </section>
  );
}

/** Para Tak/Nie — legacy używa radiobuttonów, nie checkboxa (zrzuty: „Podmiot powiązane"). */
export function YesNoRadio({
  name,
  value,
  onChange,
  disabled,
}: {
  name: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-4" role="radiogroup" aria-label={name}>
      {[true, false].map((option) => (
        <label key={String(option)} className="flex items-center gap-1.5 text-sm">
          <input
            type="radio"
            name={name}
            value={option ? "1" : "0"}
            checked={value === option}
            onChange={() => onChange(option)}
            disabled={disabled}
            className="h-4 w-4"
          />
          {option ? "Tak" : "Nie"}
        </label>
      ))}
    </div>
  );
}

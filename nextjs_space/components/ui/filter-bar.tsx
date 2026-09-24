import Link from "next/link";
import { cn } from "@/lib/utils";
import { ContractorFilter } from "./contractor-filter";

// Pasek filtrów rejestru. Zwykły formularz GET — bez JS po stronie klienta: stan filtra
// żyje w URL, więc widok jest linkowalny i odświeżalny, tak jak w legacy (audyt 1.2:
// filtry przenoszone w query stringu). Jedyny wyjątek to autocomplete kontrahenta —
// słownik ma tysiące firm, więc `<select>` nie wchodzi w grę.
export interface FilterField {
  name: string;
  label: string;
  /** Obecne `options` → select. */
  options?: { id: string; name: string }[];
  /** Etykieta pustego wyboru selecta; domyślnie „— wszystkie —". */
  blankLabel?: string;
  checkbox?: boolean;
  /** Pole daty (`<input type="date">`). */
  date?: boolean;
  /** Pole liczbowe, np. kwota. */
  number?: boolean;
  /** Autocomplete po słowniku kontrahentów; `selected` to etykieta wybranej firmy. */
  contractor?: { selected: { id: string; name: string } | null };
  /** Krótkie wyjaśnienie pod polem — gdy zachowanie filtra nie wynika z etykiety. */
  hint?: string;
}

export const PAGE_SIZES = [10, 15, 25, 50, 100, 250, 500];

export interface FilterBarProps {
  action: string;
  fields: FilterField[];
  values: Record<string, string | undefined>;
  /** Pominięty — lista bez paginacji (np. 35 lokalizacji), więc bez pola „Na stronie". */
  defaultPageSize?: number;
  /** Legacy Umów podpisuje przycisk „szukaj" małą literą. */
  submitLabel?: string;
  /** Szerokość siatki na dużym ekranie; rejestry z kilkunastoma polami biorą 6. */
  columns?: 5 | 6;
}

const CONTROL = "rounded-md border border-input px-2 py-1.5 text-sm";

export function FilterBar({
  action,
  fields,
  values,
  defaultPageSize,
  submitLabel = "Szukaj",
  columns = 5,
}: FilterBarProps) {
  const value = (name: string) => values[name] ?? "";
  const inputs = fields.filter((f) => !f.checkbox);
  const checkboxes = fields.filter((f) => f.checkbox);

  return (
    <details open className="group mb-4 rounded-lg border bg-card shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between p-4 [&::-webkit-details-marker]:hidden">
        <h2 className="font-heading text-sm font-semibold">Wyszukiwanie</h2>
        <span className="text-xs text-muted-foreground group-open:hidden">Rozwiń</span>
        <span className="hidden text-xs text-muted-foreground group-open:inline">Zwiń</span>
      </summary>

      <form method="get" action={action} className="px-4 pb-4">
        <div
          className={cn(
            "grid grid-cols-2 gap-3 sm:grid-cols-3",
            columns === 6 ? "lg:grid-cols-6" : "lg:grid-cols-5",
          )}
        >
          {inputs.map((f) =>
            f.contractor ? (
              <ContractorFilter
                key={f.name}
                name={f.name}
                label={f.label}
                selected={f.contractor.selected}
              />
            ) : (
              <label key={f.name} className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">{f.label}</span>
                {f.options ? (
                  <select name={f.name} defaultValue={value(f.name)} className={CONTROL}>
                    <option value="">{f.blankLabel ?? "— wszystkie —"}</option>
                    {f.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={f.date ? "date" : f.number ? "number" : "text"}
                    step={f.number ? "0.01" : undefined}
                    min={f.number ? "0" : undefined}
                    name={f.name}
                    defaultValue={value(f.name)}
                    className={CONTROL}
                  />
                )}
                {f.hint && <span className="text-xs text-muted-foreground">{f.hint}</span>}
              </label>
            ),
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4">
          {checkboxes.map((f) => (
            <label key={f.name} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={f.name}
                value="1"
                defaultChecked={value(f.name) === "1"}
              />
              {f.label}
            </label>
          ))}
          {defaultPageSize !== undefined && (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Na stronie</span>
              <select
                name="pageSize"
                defaultValue={value("pageSize") || String(defaultPageSize)}
                className="rounded-md border border-input px-2 py-1 text-sm"
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="ml-auto flex gap-2">
            <Link href={action} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
              Wyczyść
            </Link>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              {submitLabel}
            </button>
          </div>
        </div>
      </form>
    </details>
  );
}

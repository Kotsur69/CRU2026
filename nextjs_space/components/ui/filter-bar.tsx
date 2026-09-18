import Link from "next/link";

// Pasek filtrów dla rejestrów słownikowych. Zwykły formularz GET — bez JS po stronie
// klienta: stan filtra żyje w URL, więc widok jest linkowalny i odświeżalny, tak jak
// w legacy (audyt 1.2: filtry przenoszone w query stringu).
export interface FilterField {
  name: string;
  label: string;
  /** Obecne `options` → select; w przeciwnym razie pole tekstowe lub checkbox. */
  options?: { id: string; name: string }[];
  checkbox?: boolean;
}

const PAGE_SIZES = [10, 15, 25, 50, 100, 250, 500];

export interface FilterBarProps {
  action: string;
  fields: FilterField[];
  values: Record<string, string | undefined>;
  defaultPageSize: number;
}

export function FilterBar({ action, fields, values, defaultPageSize }: FilterBarProps) {
  const value = (name: string) => values[name] ?? "";
  const textOrSelect = fields.filter((f) => !f.checkbox);
  const checkboxes = fields.filter((f) => f.checkbox);

  return (
    <form method="get" action={action} className="mb-4 rounded-lg border bg-card p-4 shadow-sm">
      <h2 className="mb-3 font-heading text-sm font-semibold">Wyszukiwanie</h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {textOrSelect.map((f) => (
          <label key={f.name} className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{f.label}</span>
            {f.options ? (
              <select
                name={f.name}
                defaultValue={value(f.name)}
                className="rounded-md border border-input px-2 py-1.5 text-sm"
              >
                <option value="">— wszystkie —</option>
                {f.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                name={f.name}
                defaultValue={value(f.name)}
                className="rounded-md border border-input px-2 py-1.5 text-sm"
              />
            )}
          </label>
        ))}
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
        <div className="ml-auto flex gap-2">
          <Link href={action} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
            Wyczyść
          </Link>
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Szukaj
          </button>
        </div>
      </div>
    </form>
  );
}

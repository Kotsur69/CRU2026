"use client";

import { useEffect, useId, useState } from "react";

/**
 * Filtr „Kontrahenci" / „Dłużnik" w pasku wyszukiwania — autocomplete po nazwie i NIP-ie
 * (audyt 1.2: tysiące pozycji, legacy też podpowiada). Do formularza GET trafia tylko
 * identyfikator firmy w ukrytym polu; szukamy także wśród firm usuniętych, bo wiszą na
 * nich historyczne umowy.
 */

interface Option {
  id: string;
  name: string;
  vatId?: string | null;
}

const DEBOUNCE_MS = 250;
const MIN_QUERY = 2;

export function ContractorFilter({
  name,
  label,
  selected: initial,
}: {
  name: string;
  label: string;
  selected: Option | null;
}) {
  const inputId = useId();
  const [selected, setSelected] = useState<Option | null>(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Option[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (query.trim().length < MIN_QUERY) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/contractors?all=1&q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { items: { id: number; name: string; vatId: string | null }[] };
        setResults(data.items.map((i) => ({ id: String(i.id), name: i.name, vatId: i.vatId })));
        setFailed(false);
      } catch {
        // Przerwanie przez kolejne wciśnięcie klawisza nie jest błędem dla użytkownika.
        if (!controller.signal.aborted) setFailed(true);
      }
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="relative flex flex-col gap-1 text-sm">
      <label htmlFor={inputId} className="text-muted-foreground">
        {label}
      </label>
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      {selected ? (
        <div className="flex items-center gap-1 rounded-md border border-input px-2 py-1.5">
          <span className="min-w-0 flex-1 truncate" title={selected.name}>
            {selected.name}
          </span>
          <button
            type="button"
            onClick={() => setSelected(null)}
            aria-label={`Wyczyść: ${label}`}
            className="shrink-0 px-1 text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </div>
      ) : (
        <input
          id={inputId}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nazwa lub NIP…"
          autoComplete="off"
          className="rounded-md border border-input px-2 py-1.5 text-sm"
        />
      )}
      {!selected && results.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-auto rounded-md border bg-card shadow-lg">
          {results.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  setSelected(item);
                  setQuery("");
                  setResults([]);
                }}
                className="block w-full px-2 py-1.5 text-left hover:bg-muted"
              >
                {item.name}
                {item.vatId && <span className="ml-1 text-muted-foreground">NIP {item.vatId}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {failed && <span className="text-xs text-red-700">Wyszukiwanie nie powiodło się.</span>}
    </div>
  );
}

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CONTROL_CLASS, FieldError } from "@/components/ui/form";

/**
 * Pole „Kontrahent" — autocomplete po nazwie i NIP-ie, plus „dodaj" dopisujące firmę
 * do słownika bez wychodzenia z formularza (tak jak w legacy). Do formularza trafia
 * wyłącznie identyfikator; nazwa jest tylko tym, co widzi człowiek.
 */

export interface ContractorOption {
  id: number;
  name: string;
  vatId?: string | null;
}

const DEBOUNCE_MS = 250;
const MIN_QUERY = 2;

export interface ContractorPickerProps {
  name: string;
  label: string;
  initial: ContractorOption | null;
  /** Dłużnik nie potrzebuje dopisywania firm — przycisk pokazujemy tylko przy kontrahencie. */
  allowCreate?: boolean;
}

export function ContractorPicker({ name, label, initial, allowCreate }: ContractorPickerProps) {
  const inputId = useId();
  const [selected, setSelected] = useState<ContractorOption | null>(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContractorOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (query.trim().length < MIN_QUERY) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/contractors?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Wyszukiwanie nie powiodło się.");
        const data = (await res.json()) as { items: ContractorOption[] };
        setResults(data.items);
        setError(null);
      } catch (err) {
        // Przerwanie przez kolejne wciśnięcie klawisza to nie jest błąd dla użytkownika.
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Wyszukiwanie nie powiodło się.");
        }
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const choose = (option: ContractorOption) => {
    setSelected(option);
    setQuery("");
    setResults([]);
    setCreating(false);
  };

  return (
    <div>
      <input type="hidden" name={name} value={selected?.id ?? ""} />

      {selected ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border bg-muted/40 px-2 py-1 text-sm">
            {selected.name}
            {selected.vatId && (
              <span className="ml-1 text-muted-foreground">NIP {selected.vatId}</span>
            )}
          </span>
          <Button variant="ghost" onClick={() => setSelected(null)}>
            Zmień
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-[14rem] flex-1">
            <input
              id={inputId}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nazwa lub NIP…"
              autoComplete="off"
              aria-label={label}
              className={CONTROL_CLASS}
            />
            {busy && <p className="mt-1 text-xs text-muted-foreground">Szukam…</p>}
            {results.length > 0 && (
              <ul className="mt-1 max-h-56 overflow-auto rounded-md border bg-card text-sm shadow-sm">
                {results.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => choose(item)}
                      className="block w-full px-2 py-1.5 text-left hover:bg-muted"
                    >
                      {item.name}
                      {item.vatId && (
                        <span className="ml-1 text-muted-foreground">NIP {item.vatId}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {query.trim().length >= MIN_QUERY && !busy && results.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">Brak dopasowań w słowniku.</p>
            )}
          </div>
          {allowCreate && (
            <Button onClick={() => setCreating((v) => !v)} aria-expanded={creating}>
              dodaj
            </Button>
          )}
        </div>
      )}

      {error && <FieldError>{error}</FieldError>}

      {creating && !selected && <CreateContractor onCreated={choose} onError={setError} />}
    </div>
  );
}

function CreateContractor({
  onCreated,
  onError,
}: {
  onCreated: (option: ContractorOption) => void;
  onError: (message: string | null) => void;
}) {
  const [shortName, setShortName] = useState("");
  const [vatId, setVatId] = useState("");
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const submit = async () => {
    setSaving(true);
    onError(null);
    try {
      const res = await fetch("/api/contractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shortName, vatId }),
      });
      const data = (await res.json()) as { item?: ContractorOption; error?: string };
      if (!res.ok || !data.item) throw new Error(data.error ?? "Nie udało się dodać kontrahenta.");
      onCreated(data.item);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Nie udało się dodać kontrahenta.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 rounded-md border bg-muted/30 p-3">
      <p className="mb-2 text-xs font-medium">Nowy kontrahent w słowniku</p>
      <div className="flex flex-wrap gap-2">
        <input
          ref={nameRef}
          type="text"
          value={shortName}
          onChange={(e) => setShortName(e.target.value)}
          placeholder="Nazwa"
          aria-label="Nazwa kontrahenta"
          className={`${CONTROL_CLASS} min-w-[12rem] flex-1`}
        />
        <input
          type="text"
          value={vatId}
          onChange={(e) => setVatId(e.target.value)}
          placeholder="NIP"
          inputMode="numeric"
          aria-label="NIP kontrahenta"
          className={`${CONTROL_CLASS} w-40`}
        />
        <Button variant="primary" onClick={submit} disabled={saving || shortName.trim() === ""}>
          {saving ? "Dodaję…" : "Zapisz kontrahenta"}
        </Button>
      </div>
    </div>
  );
}

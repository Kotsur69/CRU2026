"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FieldError } from "@/components/ui/form";

/**
 * Sekcja „Załączniki" z przyciskiem „dodaj plik".
 *
 * Przycisk otwiera systemowy wybór plików (ukryty `<input type="file">` — przeglądarka
 * nie pozwala otworzyć go inaczej niż z gestu użytkownika). Plik leci na serwer OD RAZU,
 * jeszcze przed zapisem formularza, i czeka tam podpięty pod token sesji formularza:
 * tak samo działa kolumna `formsession` w legacy. Dzięki temu wielkie PDF-y nie muszą
 * jechać ponownie przy każdej nieudanej walidacji formularza.
 */

export interface AttachmentItem {
  id: number;
  name: string | null;
  url: string | null;
  isFinal?: boolean;
}

/** Legacy `attachment.finally` — „Wer ostateczna" przy liście plików. */
type FinalFlags = Record<number, boolean>;

interface UploadResponse {
  id: number;
  name: string | null;
  url: string;
  error?: string;
}

export interface AttachmentsFieldProps {
  /** Istniejący rekord — wtedy plik wiąże się od razu. */
  contractId: number | null;
  /** Token sesji formularza dla rekordu, który jeszcze nie istnieje. */
  formSession: string;
  initial: AttachmentItem[];
  disabled?: boolean;
}

export function AttachmentsField({
  contractId,
  formSession,
  initial,
  disabled,
}: AttachmentsFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<AttachmentItem[]>(initial);
  const [uploading, setUploading] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Znaczniki „Wer ostateczna" zmieniają się lokalnie, a na serwer idą dopiero
  // przyciskiem „zapisz" — tak samo jak w legacy.
  const [finalFlags, setFinalFlags] = useState<FinalFlags>(() =>
    Object.fromEntries(initial.map((i) => [i.id, Boolean(i.isFinal)])),
  );
  const [savedFlags, setSavedFlags] = useState<FinalFlags>(() =>
    Object.fromEntries(initial.map((i) => [i.id, Boolean(i.isFinal)])),
  );
  const [savingFlags, setSavingFlags] = useState(false);

  const changedIds = items
    .map((i) => i.id)
    .filter((id) => Boolean(finalFlags[id]) !== Boolean(savedFlags[id]));

  const saveFinalFlags = async () => {
    setError(null);
    setSavingFlags(true);
    try {
      for (const id of changedIds) {
        const res = await fetch(
          `/api/attachments?id=${id}&formSession=${encodeURIComponent(formSession)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isFinal: Boolean(finalFlags[id]) }),
          },
        );
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Nie udało się zapisać oznaczenia.");
        }
        setSavedFlags((prev) => ({ ...prev, [id]: Boolean(finalFlags[id]) }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się zapisać oznaczenia.");
    } finally {
      setSavingFlags(false);
    }
  };

  const upload = async (files: FileList) => {
    setError(null);
    const names = Array.from(files).map((f) => f.name);
    setUploading((prev) => [...prev, ...names]);

    for (const file of Array.from(files)) {
      // Pusty plik to dokument, którego nie ma — serwer i tak go odrzuci, ale nie ma
      // sensu czekać na to rundę żądania (docs/features/18).
      if (file.size === 0) {
        setError(`${file.name}: plik jest pusty (0 B).`);
        setUploading((prev) => prev.filter((n) => n !== file.name));
        continue;
      }
      const body = new FormData();
      body.append("file", file);
      body.append("formSession", formSession);
      if (contractId !== null) body.append("contractId", String(contractId));

      try {
        const res = await fetch("/api/attachments", { method: "POST", body });
        const data = (await res.json()) as UploadResponse;
        if (!res.ok) throw new Error(data.error ?? "Nie udało się wgrać pliku.");
        setItems((prev) => [...prev, { id: data.id, name: data.name, url: data.url }]);
        setFinalFlags((prev) => ({ ...prev, [data.id]: false }));
        setSavedFlags((prev) => ({ ...prev, [data.id]: false }));
      } catch (err) {
        setError(
          `${file.name}: ${err instanceof Error ? err.message : "nie udało się wgrać pliku."}`,
        );
      } finally {
        setUploading((prev) => prev.filter((n) => n !== file.name));
      }
    }

    // Bez tego ponowny wybór tego samego pliku nie wywoła zdarzenia change.
    if (inputRef.current) inputRef.current.value = "";
  };

  const detach = async (id: number) => {
    setError(null);
    try {
      const res = await fetch(
        `/api/attachments?id=${id}&formSession=${encodeURIComponent(formSession)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Nie udało się odpiąć pliku.");
      }
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się odpiąć pliku.");
    }
  };

  return (
    <div>
      <input type="hidden" name="formSession" value={formSession} />
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        onChange={(e) => e.target.files && e.target.files.length > 0 && upload(e.target.files)}
        // Nazwy nie ma celowo: pliki jadą własnym żądaniem, nie w treści formularza.
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          {items.length === 0 && uploading.length === 0 ? (
            <p className="text-sm text-muted-foreground">brak plików</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-2">
                  {disabled ? (
                    Boolean(finalFlags[item.id]) && <Badge tone="brand">Wer ostateczna</Badge>
                  ) : (
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={Boolean(finalFlags[item.id])}
                        onChange={(e) =>
                          setFinalFlags((prev) => ({ ...prev, [item.id]: e.target.checked }))
                        }
                        className="h-4 w-4"
                      />
                      Wer ostateczna
                    </label>
                  )}
                  {!disabled && (
                    <Button
                      variant="ghost"
                      onClick={() => detach(item.id)}
                      aria-label={`Usuń ${item.name ?? "załącznik"}`}
                    >
                      Usuń
                    </Button>
                  )}
                  {item.url ? (
                    <a href={item.url} className="text-primary hover:underline">
                      {item.name ?? `#${item.id}`}
                    </a>
                  ) : (
                    <span>{item.name ?? `#${item.id}`}</span>
                  )}
                </li>
              ))}
              {uploading.map((name) => (
                <li key={`up-${name}`} className="text-muted-foreground">
                  {name} — wgrywam…
                </li>
              ))}
            </ul>
          )}

          {!disabled && changedIds.length > 0 && (
            <Button onClick={saveFinalFlags} disabled={savingFlags} className="mt-2">
              {savingFlags ? "zapisuję…" : "zapisz"}
            </Button>
          )}
        </div>

        <Button
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          aria-label="Dodaj plik z dysku"
        >
          dodaj plik
        </Button>
      </div>

      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

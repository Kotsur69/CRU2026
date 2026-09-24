"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/form";

/**
 * „dodaj plik" i „Usuń" na podglądzie rekordu (docs/features/18). Plik wiąże się od razu
 * z rekordem (`contractId`), więc serwer sprawdza prawo edycji; po zmianie odświeżamy
 * listę renderowaną na serwerze.
 */

export function AttachmentUpload({ contractId }: { contractId: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFinal, setIsFinal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (files: FileList) => {
    setError(null);
    setBusy(true);
    const problems: string[] = [];
    for (const file of Array.from(files)) {
      if (file.size === 0) {
        problems.push(`${file.name}: plik jest pusty (0 B).`);
        continue;
      }
      const body = new FormData();
      body.append("file", file);
      body.append("contractId", String(contractId));
      if (isFinal) body.append("isFinal", "1");
      try {
        const res = await fetch("/api/attachments", { method: "POST", body });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          problems.push(`${file.name}: ${data.error ?? "nie udało się wgrać pliku."}`);
        }
      } catch {
        problems.push(`${file.name}: nie udało się wgrać pliku.`);
      }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (problems.length > 0) setError(problems.join(" "));
    router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => e.target.files && e.target.files.length > 0 && upload(e.target.files)}
      />
      <label className="flex items-center gap-1.5 text-sm">
        <input
          type="checkbox"
          checked={isFinal}
          onChange={(e) => setIsFinal(e.target.checked)}
          className="h-4 w-4"
        />
        Wersja ostateczna
      </label>
      <Button onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? "wgrywam…" : "dodaj plik"}
      </Button>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

export function AttachmentDelete({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (!window.confirm(`Odpiąć plik „${name}" od rekordu?`)) return;
        setBusy(true);
        const res = await fetch(`/api/attachments?id=${id}`, { method: "DELETE" });
        setBusy(false);
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          window.alert(data.error ?? "Nie udało się odpiąć pliku.");
          return;
        }
        router.refresh();
      }}
      className="text-xs text-muted-foreground hover:text-red-700 hover:underline disabled:opacity-50"
    >
      Usuń
    </button>
  );
}

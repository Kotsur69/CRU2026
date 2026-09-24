/**
 * Załączniki — reguły wspólne dla listy, pobierania i skryptów (docs/features/18).
 * Czyste funkcje, bez bazy i bez magazynu plików.
 */

export type FileKind = "pdf" | "word" | "excel" | "mail" | "archive" | "image" | "other";

const KIND_BY_EXTENSION: Record<string, FileKind> = {
  pdf: "pdf",
  doc: "word",
  docx: "word",
  docm: "word",
  dotx: "word",
  odt: "word",
  rtf: "word",
  xls: "excel",
  xlsx: "excel",
  xlsb: "excel",
  ods: "excel",
  msg: "mail",
  oft: "mail",
  eml: "mail",
  mht: "mail",
  zip: "archive",
  "7z": "archive",
  jpg: "image",
  jpeg: "image",
  png: "image",
  tif: "image",
};

/**
 * `filetype` w legacy to wolny tekst w dowolnej wielkości liter (`PDF` 43 razy, `01`,
 * `umowy zlecenia`, `exe`). Normalizujemy przy ODCZYCIE; zapisanych wartości nie ruszamy,
 * bo porównuje je rekoncyliacja przy cutoverze.
 */
export function normalizeFileType(fileType: string | null | undefined): string {
  return (fileType ?? "").trim().toLowerCase();
}

export function fileKind(fileType: string | null | undefined): FileKind {
  return KIND_BY_EXTENSION[normalizeFileType(fileType)] ?? "other";
}

/**
 * Tylko PDF i obrazy wolno pokazać w przeglądarce. Reszta idzie jako `attachment` —
 * zwłaszcza zapisane wątki mailowe `.htm/.html/.mht`: wyrenderowane na naszej domenie
 * byłyby drogą do stored XSS, a w danych jest też `.exe` (docs/features/18).
 */
const INLINE_TYPES = new Set(["pdf", "jpg", "jpeg", "png"]);

export function isInlineRenderable(fileType: string | null | undefined): boolean {
  return INLINE_TYPES.has(normalizeFileType(fileType));
}

/** „1,2 MB" — rozmiar czytany z magazynu, nie z bazy (baza go nie trzyma). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["kB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`;
}

/**
 * Nagłówek `Content-Disposition` z nazwą pliku od użytkownika: ASCII-owy zapas dla
 * starych klientów i pełna nazwa UTF-8 (RFC 6266 / 5987) — polskie znaki w nazwach
 * umów są normą.
 */
export function contentDisposition(kind: "inline" | "attachment", filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "plik";
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

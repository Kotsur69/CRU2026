import { FileArchive, FileImage, FileSpreadsheet, FileText, File as FileIcon, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { fileKind, formatBytes, normalizeFileType, type FileKind } from "@/lib/attachments";
import { getStorage } from "@/lib/storage";

/**
 * Lista plików rekordu albo kontrahenta (docs/features/18). Kolejność: najpierw
 * „Wersja ostateczna", potem kolejność wgrania (id) — nigdy po `addedAt`, bo na wszystkich
 * 39 272 importowanych wierszach to data importu.
 *
 * Rozmiar i obecność pliku czytamy z magazynu przy wyświetleniu: pusty plik (23 na
 * żywych rekordach) albo brak pliku to najgorsza możliwa awaria w rejestrze prawnym —
 * rejestr mówi, że dokument jest, a go nie ma — więc pokazujemy to wprost.
 */

export interface ListedAttachment {
  id: number;
  name: string | null;
  storageKey: string | null;
  fileType: string | null;
  isFinal: boolean;
  addedAt: Date;
  addedAtEstimated: boolean;
}

const ICON: Record<FileKind, typeof FileIcon> = {
  pdf: FileText,
  word: FileText,
  excel: FileSpreadsheet,
  mail: Mail,
  archive: FileArchive,
  image: FileImage,
  other: FileIcon,
};

async function sizeOf(key: string | null): Promise<number | null> {
  if (!key) return null;
  try {
    const stat = await getStorage().stat(key);
    return stat ? (stat.sizeBytes ?? null) : null;
  } catch {
    return null;
  }
}

export async function AttachmentList({
  attachments,
  deleteButton,
}: {
  attachments: readonly ListedAttachment[];
  /** Przycisk „Usuń" dla osoby z prawem edycji — renderuje go wywołujący. */
  deleteButton?: (attachment: ListedAttachment) => React.ReactNode;
}) {
  if (attachments.length === 0) {
    return <p className="text-sm text-muted-foreground">Brak załączników.</p>;
  }

  const sorted = [...attachments].sort(
    (a, b) => Number(b.isFinal) - Number(a.isFinal) || a.id - b.id,
  );
  const sizes = await Promise.all(sorted.map((a) => sizeOf(a.storageKey)));

  return (
    <ul className="divide-y divide-border/60 text-sm">
      {sorted.map((a, i) => {
        const size = sizes[i];
        const missing = size === null;
        const empty = size === 0;
        const Icon = ICON[fileKind(a.fileType)];
        const label = a.name ?? a.storageKey ?? `#${a.id}`;
        const type = normalizeFileType(a.fileType).toUpperCase() || "PLIK";
        return (
          <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
            <Icon aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
            {a.storageKey && !missing && !empty ? (
              <a
                href={`/api/files/${encodeURIComponent(a.storageKey)}`}
                className="min-w-0 break-words text-primary hover:underline"
              >
                {label}
              </a>
            ) : (
              <span className="min-w-0 break-words">{label}</span>
            )}
            <span className="text-xs text-muted-foreground">
              {type}
              {size ? ` · ${formatBytes(size)}` : ""}
            </span>
            {a.isFinal && <Badge tone="brand">Wersja ostateczna</Badge>}
            {empty && <Badge tone="danger">plik pusty (0 B)</Badge>}
            {missing && <Badge tone="danger">brak pliku</Badge>}
            <span className="text-xs text-muted-foreground">
              {a.addedAtEstimated ? "data nieznana (import)" : formatDate(a.addedAt)}
            </span>
            {deleteButton && <span className="ml-auto">{deleteButton(a)}</span>}
          </li>
        );
      })}
    </ul>
  );
}

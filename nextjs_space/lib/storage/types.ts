// Abstrakcja magazynu plików. UI/routing zależą TYLKO od tego interfejsu —
// nigdy od konkretnego backendu. Docelowo: fizyczny serwer (Bytom) / SharePoint / S3.

/**
 * Thrown when the deployment has no file storage attached (STORAGE_DRIVER=none),
 * e.g. a cloud test deployment before the OneDrive/Graph adapter exists. Routes map
 * it to 503 so users see "not available yet" instead of "not found".
 */
export class StorageUnavailableError extends Error {
  constructor() {
    super("File storage is not configured for this deployment");
    this.name = "StorageUnavailableError";
  }
}

/**
 * The storage backend (e.g. Microsoft Graph) failed or is unreachable. Unlike a bad
 * key this is not the caller's fault — routes answer 502 and log it.
 */
export class StorageBackendError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StorageBackendError";
  }
}

export interface StoredObject {
  key: string; // opaque klucz (Attachment.storageKey)
  filename: string;
  sizeBytes?: number;
  mimeType?: string;
  modifiedAt?: Date;
}

export interface StorageAdapter {
  /** Czy obiekt istnieje pod danym kluczem. */
  exists(key: string): Promise<boolean>;

  /** Metadane obiektu (bez pobierania treści). */
  stat(key: string): Promise<StoredObject | null>;

  /** Lista obiektów pod prefiksem (np. wszystkie załączniki umowy). */
  list(prefix: string): Promise<StoredObject[]>;

  /** Treść pliku jako bufor (do pobrania/streamu przez trasę serwerową). */
  getBuffer(key: string): Promise<Buffer>;

  /** URL/ścieżka do pobrania — dla adaptera lokalnego trasa proxy /api/files. */
  getDownloadUrl(key: string): Promise<string>;

  /**
   * Short-lived URL the browser may fetch the bytes from directly, or null when the
   * object does not exist. Backends that can hand one out implement it so large files
   * skip the app server (Vercel caps response bodies at ~4.5 MB); the /api/files route
   * still checks the session and the Attachment row before redirecting.
   */
  getDirectDownloadUrl?(key: string): Promise<string | null>;

  /**
   * Zapis nowego obiektu. Klucz wyznacza adapter (legacy: `attachments/<md5>.<ext>`),
   * żeby UI nigdy nie układał ścieżek w magazynie.
   *
   * Zwraca klucz zapisanego obiektu. Gdy identyczna treść już tam jest, adapter może
   * zwrócić klucz istniejącego obiektu zamiast zapisywać duplikat.
   */
  put(filename: string, data: Buffer): Promise<string>;

  /** Usunięcie obiektu — dla plików wgranych do formularza, który porzucono. */
  remove(key: string): Promise<void>;
}

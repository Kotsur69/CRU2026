// Abstrakcja magazynu plików. UI/routing zależą TYLKO od tego interfejsu —
// nigdy od konkretnego backendu. Docelowo: fizyczny serwer (Bytom) / SharePoint / S3.

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

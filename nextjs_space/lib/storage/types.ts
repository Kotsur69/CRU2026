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
}

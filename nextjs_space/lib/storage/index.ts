import type { StorageAdapter } from "./types";
import { LocalStorageAdapter } from "./local-adapter";

export type { StorageAdapter, StoredObject } from "./types";

let instance: StorageAdapter | null = null;

/** Fabryka storage. Wybór backendu wg STORAGE_DRIVER (na start: local). */
export function getStorage(): StorageAdapter {
  if (instance) return instance;

  const driver = process.env.STORAGE_DRIVER ?? "local";
  switch (driver) {
    case "local":
      instance = new LocalStorageAdapter(
        process.env.STORAGE_LOCAL_ROOT ?? "./storage-local",
      );
      break;
    // Docelowo: "physical" (serwer Bytom), "sharepoint", "s3" — bez zmian w UI.
    default:
      throw new Error(`Nieznany STORAGE_DRIVER: ${driver}`);
  }
  return instance;
}

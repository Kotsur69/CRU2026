import { StorageUnavailableError, type StorageAdapter, type StoredObject } from "./types";

/**
 * Adapter for deployments without file storage (STORAGE_DRIVER=none). Every call
 * fails with StorageUnavailableError, which routes turn into a 503 message.
 */
export class UnavailableStorageAdapter implements StorageAdapter {
  async exists(): Promise<boolean> {
    throw new StorageUnavailableError();
  }

  async stat(): Promise<StoredObject | null> {
    throw new StorageUnavailableError();
  }

  async list(): Promise<StoredObject[]> {
    throw new StorageUnavailableError();
  }

  async getBuffer(): Promise<Buffer> {
    throw new StorageUnavailableError();
  }

  async getDownloadUrl(): Promise<string> {
    throw new StorageUnavailableError();
  }

  async put(): Promise<string> {
    throw new StorageUnavailableError();
  }

  async remove(): Promise<void> {
    throw new StorageUnavailableError();
  }
}

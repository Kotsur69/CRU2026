import { promises as fs } from "fs";
import path from "path";
import type { StorageAdapter, StoredObject } from "./types";

// Adapter-stub symulujący fizyczny serwer plików (Bytom) przez lokalny katalog.
// Klucz = ścieżka względna wewnątrz STORAGE_LOCAL_ROOT. Do podmiany bez zmian w UI.
export class LocalStorageAdapter implements StorageAdapter {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(key: string): string {
    // Zabezpieczenie przed path traversal poza root.
    const full = path.resolve(this.root, key);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) {
      throw new Error(`Niedozwolony klucz storage: ${key}`);
    }
    return full;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async stat(key: string): Promise<StoredObject | null> {
    try {
      const full = this.resolve(key);
      const s = await fs.stat(full);
      if (!s.isFile()) return null;
      return {
        key,
        filename: path.basename(full),
        sizeBytes: s.size,
        modifiedAt: s.mtime,
      };
    } catch {
      return null;
    }
  }

  async list(prefix: string): Promise<StoredObject[]> {
    const dir = this.resolve(prefix);
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return [];
    }
    const out: StoredObject[] = [];
    for (const name of entries) {
      const stat = await this.stat(path.join(prefix, name));
      if (stat) out.push(stat);
    }
    return out;
  }

  async getBuffer(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async getDownloadUrl(key: string): Promise<string> {
    // Adapter lokalny nie ma publicznego URL — pobieranie przez trasę proxy.
    return `/api/files/${encodeURIComponent(key)}`;
  }
}

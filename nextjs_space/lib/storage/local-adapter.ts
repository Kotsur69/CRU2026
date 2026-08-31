import { promises as fs } from "fs";
import path from "path";
import type { StorageAdapter, StoredObject } from "./types";

// Adapter-stub symulujący fizyczny serwer plików (Bytom) przez lokalny katalog.
// Klucz = ścieżka względna wewnątrz STORAGE_LOCAL_ROOT. Do podmiany bez zmian w UI.

/** Content types for the extensions actually present in the Bytom export. */
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  docm: "application/vnd.ms-word.document.macroEnabled.12",
  dotx: "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsb: "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  msg: "application/vnd.ms-outlook",
  oft: "application/vnd.ms-outlook",
  eml: "message/rfc822",
  rtf: "application/rtf",
  txt: "text/plain; charset=utf-8",
  htm: "text/html; charset=utf-8",
  html: "text/html; charset=utf-8",
  mht: "message/rfc822",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  tif: "image/tiff",
  zip: "application/zip",
  "7z": "application/x-7z-compressed",
};

function mimeFor(filename: string): string {
  const ext = path.extname(filename).slice(1).toLowerCase();
  return MIME_BY_EXTENSION[ext] ?? "application/octet-stream";
}

/**
 * Legacy stored `attachments/<md5>.<ext>`, but for a handful of uploads the extension
 * written to disk was mangled (the original filename contained spaces or extra dots),
 * so the DB key and the real filename disagree past the dot — e.g. the DB says
 * `…5d3d.pdf` while disk holds `…5d3d.A`. The md5 stem is unique across the export
 * (verified: 39 280 files, 39 280 distinct stems), so it is a safe fallback key.
 */
export class LocalStorageAdapter implements StorageAdapter {
  private readonly root: string;
  /** Lazily built per directory: md5 stem → actual filename. */
  private readonly stemIndexes = new Map<string, Promise<Map<string, string>>>();

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

  private stemIndex(dirKey: string): Promise<Map<string, string>> {
    const cached = this.stemIndexes.get(dirKey);
    if (cached) return cached;

    const building = (async () => {
      const index = new Map<string, string>();
      let entries: string[];
      try {
        entries = await fs.readdir(this.resolve(dirKey));
      } catch {
        return index;
      }
      for (const name of entries) {
        const stem = name.split(".")[0];
        // A colliding stem would make the fallback ambiguous — keep the first and
        // let the exact-match path handle the rest.
        if (stem && !index.has(stem)) index.set(stem, name);
      }
      return index;
    })();

    this.stemIndexes.set(dirKey, building);
    return building;
  }

  /** Absolute path of the file backing `key`, or null when nothing matches. */
  private async locate(key: string): Promise<string | null> {
    const exact = this.resolve(key);
    try {
      const s = await fs.stat(exact);
      if (s.isFile()) return exact;
      return null;
    } catch {
      // Fall through to the stem fallback below.
    }

    const dirKey = path.posix.dirname(key.split(path.sep).join("/"));
    const stem = path.basename(key).split(".")[0];
    if (!stem) return null;

    const actual = (await this.stemIndex(dirKey === "." ? "" : dirKey)).get(stem);
    if (!actual) return null;

    const full = this.resolve(dirKey === "." ? actual : `${dirKey}/${actual}`);
    try {
      const s = await fs.stat(full);
      return s.isFile() ? full : null;
    } catch {
      return null;
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.locate(key)) !== null;
  }

  async stat(key: string): Promise<StoredObject | null> {
    const full = await this.locate(key);
    if (!full) return null;
    const s = await fs.stat(full);
    // Name and type come from the KEY, not from the file on disk: where legacy mangled
    // the extension the key still carries the true one (verified — every such file is a
    // well-formed PDF), and reporting the mangled name would break inline preview.
    const filename = path.basename(key);
    return {
      key,
      filename,
      sizeBytes: s.size,
      mimeType: mimeFor(filename),
      modifiedAt: s.mtime,
    };
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
      // Storage keys are always "/"-separated, whatever the host OS uses.
      const stat = await this.stat(prefix ? `${prefix}/${name}` : name);
      if (stat) out.push(stat);
    }
    return out;
  }

  async getBuffer(key: string): Promise<Buffer> {
    const full = await this.locate(key);
    if (!full) throw new Error(`Brak pliku w storage: ${key}`);
    return fs.readFile(full);
  }

  async getDownloadUrl(key: string): Promise<string> {
    // Adapter lokalny nie ma publicznego URL — pobieranie przez trasę proxy.
    return `/api/files/${encodeURIComponent(key)}`;
  }
}

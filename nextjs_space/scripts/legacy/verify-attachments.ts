/**
 * Reconciles `Attachment.storageKey` in PostgreSQL against the actual file store.
 *
 * Usage (from `nextjs_space/`):
 *   yarn db:verify-files                 report against STORAGE_LOCAL_ROOT
 *   yarn db:verify-files --prefix media  reconcile a different top-level folder
 *
 * Why this exists: plan.md principle 4 requires a compatibility check before cutover,
 * and the ETL is re-run for every fresh legacy dump. A row whose bytes are absent is a
 * silent gap — the record looks complete in the UI until someone clicks the link.
 *
 * Three outcomes are reported separately, because they need different follow-up:
 *  - EXACT     key and filename agree; nothing to do.
 *  - EXTENSION the md5 stem matches but the extension on disk differs. Legacy mangled
 *              the extension for uploads whose original name held spaces or extra dots;
 *              LocalStorageAdapter resolves these by stem, so they are served correctly.
 *  - MISSING   no file for the key at all. Must be chased with the Bytom admins.
 * Files present on disk but referenced by no row are reported as orphans (harmless,
 * but they signal an incomplete DELETE in legacy or a stale export).
 *
 * Exit code is 1 when anything is MISSING, so this can gate the cutover checklist.
 */

import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { getStorage } from "../../lib/storage";

const prisma = new PrismaClient();

/** The md5 stem legacy derives the filename from — everything before the first dot. */
function stemOf(filename: string): string {
  return filename.split(".")[0] ?? "";
}

function parseArgs(argv: string[]): { prefix: string } {
  const index = argv.indexOf("--prefix");
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (index >= 0 && !value) {
    throw new Error("--prefix wymaga wartości, np. --prefix attachments");
  }
  return { prefix: value ?? "attachments" };
}

async function main(): Promise<void> {
  const started = Date.now();
  const { prefix } = parseArgs(process.argv.slice(2));
  const storage = getStorage();

  const rows = await prisma.attachment.findMany({
    select: { id: true, name: true, storageKey: true, contractId: true },
    orderBy: { id: "asc" },
  });

  const onDisk = await storage.list(prefix);
  const diskKeys = new Set(onDisk.map((o) => o.key));
  const diskByStem = new Map<string, string>();
  for (const object of onDisk) {
    const stem = stemOf(object.filename);
    if (stem && !diskByStem.has(stem)) diskByStem.set(stem, object.key);
  }

  const withoutKey: typeof rows = [];
  const missing: typeof rows = [];
  const extensionMismatch: { row: (typeof rows)[number]; actual: string }[] = [];
  const referenced = new Set<string>();
  let exact = 0;

  for (const row of rows) {
    if (!row.storageKey) {
      withoutKey.push(row);
      continue;
    }
    if (diskKeys.has(row.storageKey)) {
      referenced.add(row.storageKey);
      exact += 1;
      continue;
    }
    const actual = diskByStem.get(stemOf(path.basename(row.storageKey)));
    if (actual) {
      referenced.add(actual);
      extensionMismatch.push({ row, actual });
      continue;
    }
    missing.push(row);
  }

  const orphans = onDisk.filter((o) => !referenced.has(o.key));

  const write = (line: string) => process.stdout.write(`${line}\n`);
  const pad = (label: string) => label.padEnd(34);
  const count = (value: number) => value.toLocaleString("pl-PL");

  write(`\nWeryfikacja załączników — prefiks "${prefix}"`);
  write(`Storage: ${process.env.STORAGE_DRIVER ?? "local"} → ${process.env.STORAGE_LOCAL_ROOT ?? "?"}\n`);
  write(`${pad("Rekordów Attachment")}${count(rows.length)}`);
  write(`${pad("Plików w storage")}${count(onDisk.length)}`);
  write(`${pad("  zgodnych 1:1")}${count(exact)}`);
  write(`${pad("  zgodnych po md5 (inne rozsz.)")}${count(extensionMismatch.length)}`);
  write(`${pad("  BEZ PLIKU")}${count(missing.length)}`);
  write(`${pad("  bez storageKey w bazie")}${count(withoutKey.length)}`);
  write(`${pad("Plików bez rekordu (sieroty)")}${count(orphans.length)}`);

  if (extensionMismatch.length > 0) {
    write("\nRozszerzenie w bazie ≠ rozszerzenie na dysku (serwowane po md5):");
    for (const { row, actual } of extensionMismatch) {
      write(`  #${row.id}  ${row.storageKey}  →  ${actual}`);
    }
  }

  if (missing.length > 0) {
    write("\nBRAK PLIKU — do wyjaśnienia z administratorami serwera bytomskiego:");
    write(`  ${"ID".padEnd(8)}${"UMOWA".padEnd(9)}${"KLUCZ".padEnd(50)}NAZWA`);
    for (const row of missing) {
      write(
        `  ${String(row.id).padEnd(8)}${String(row.contractId ?? "—").padEnd(9)}` +
          `${(row.storageKey ?? "—").padEnd(50)}${row.name ?? ""}`,
      );
    }
  }

  if (orphans.length > 0) {
    write("\nSieroty (plik bez rekordu w bazie) — próbka:");
    for (const object of orphans.slice(0, 20)) {
      write(`  ${object.key}`);
    }
    if (orphans.length > 20) write(`  … i ${count(orphans.length - 20)} więcej`);
  }

  write(`\nZakończono w ${((Date.now() - started) / 1000).toFixed(1)}s`);

  if (missing.length > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    process.exitCode = 1;
    process.stderr.write(
      `\nWeryfikacja nie powiodła się: ${error instanceof Error ? error.stack : String(error)}\n`,
    );
  })
  .finally(() => prisma.$disconnect());

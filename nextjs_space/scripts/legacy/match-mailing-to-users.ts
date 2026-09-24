/**
 * Proposes `User.login` ↔ `MailingContact` pairs using the two conventions the
 * data shows: logins are first-initial + surname (`mborowiecka`), addresses are
 * imie.nazwisko@arcelormittal.com with diacritics folded. Writes nothing.
 * See docs/features/25 and spec 04's Q1.
 *
 * Usage (from `nextjs_space/`):
 *   npx tsx --require dotenv/config scripts/legacy/match-mailing-to-users.ts
 *       every real login in `User` against every contact that has no match yet
 *   npx tsx --require dotenv/config scripts/legacy/match-mailing-to-users.ts --logins mborowiecka,mgolosz
 *       the given logins instead — e.g. the two the audit records (audyt §1.4)
 *
 * The report has three groups: unambiguous (an administrator approves them as a group),
 * ambiguous (one by one) and unmatched. Approving is a separate, reviewed step that this
 * script does not take (Q67). Its reads run in a READ ONLY transaction, so it cannot
 * write even by mistake.
 *
 * It stays idle until real logins exist: 451 of the 452 imported accounts carry a
 * `legacy-<id>` placeholder, which is skipped (Q1 — the export needs logins only).
 */

import { PrismaClient } from "@prisma/client";

import { addressIssue } from "../../lib/mailing/address";
import {
  AMBIGUITY_LABEL,
  CONFIDENCE_LABEL,
  PLACEHOLDER_LOGIN_PREFIX,
  proposeMatches,
  type ContactNames,
  type LoginEntry,
} from "../../lib/mailing/match";
import { loadMatchInputs } from "../../lib/mailing/sources";

const prisma = new PrismaClient();

function parseLogins(argv: readonly string[]): string[] | null {
  const index = argv.indexOf("--logins");
  if (index === -1) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error("--logins wymaga listy, np. --logins mborowiecka,mgolosz");
  }
  return [...new Set(value.split(",").map((l) => l.trim()).filter(Boolean))];
}

function write(line = ""): void {
  process.stdout.write(`${line}\n`);
}

function loginLabel(entry: LoginEntry): string {
  return entry.userId === null ? entry.login : `${entry.login} (#${entry.userId})`;
}

function contactLabel(contact: ContactNames): string {
  const name = [contact.lastName, contact.firstName].filter(Boolean).join(" ") || "(bez nazwiska)";
  // Approving copies the address onto the account, so a possibly truncated one must show.
  const flag = addressIssue(contact.email) === "suspect" ? " (adres do sprawdzenia)" : "";
  return `#${contact.id} ${name} <${contact.email ?? "brak adresu"}>${flag}`;
}

/** A fixed-width column that never runs into the next one. */
function cell(text: string, width: number): string {
  return text.length < width ? text.padEnd(width) : `${text}  `;
}

/** Three columns — login, proposed contact, confidence — plus the reason on an ambiguous row. */
function row(login: string, contact: string, confidence: string, note = ""): void {
  write(`  ${cell(login, 28)}${cell(contact, 72)}${cell(confidence, 9)}${note}`.trimEnd());
}

async function main(): Promise<void> {
  const given = parseLogins(process.argv.slice(2));

  const read = await prisma.$transaction(
    async (tx) => {
      // Belt and braces: PostgreSQL itself refuses any write made in this transaction.
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const inputs = await loadMatchInputs(tx);
      const placeholders = await tx.user.count({
        where: { login: { startsWith: PLACEHOLDER_LOGIN_PREFIX } },
      });
      const matchedContacts = await tx.mailingContact.count({ where: { userId: { not: null } } });
      return { ...inputs, placeholders, matchedContacts };
    },
    { timeout: 60_000 },
  );

  const logins: LoginEntry[] = given
    ? given.map((login) => ({ login, userId: null }))
    : read.logins;
  const report = proposeMatches(logins, read.contacts);

  write("Propozycja dopasowań login ↔ kontakt mailingowy. Nic nie jest zapisywane.");
  write(
    given
      ? `Loginy z wiersza poleceń: ${logins.length}`
      : `Loginy z tabeli User: ${logins.length} — bez zastępczych ${PLACEHOLDER_LOGIN_PREFIX}<id> ` +
          `(${read.placeholders}) i bez kont już dopasowanych`,
  );
  write(`Kontakty bez dopasowania: ${read.contacts.length} (już dopasowane: ${read.matchedContacts})`);

  write(`\nJEDNOZNACZNE (${report.unambiguous.length}) — do zatwierdzenia zbiorczo`);
  if (report.unambiguous.length > 0) row("LOGIN", "KONTAKT", "PEWNOŚĆ");
  for (const { login, candidates } of report.unambiguous) {
    const [only] = candidates;
    row(loginLabel(login), contactLabel(only.contact), CONFIDENCE_LABEL[only.confidence]);
  }

  write(`\nNIEJEDNOZNACZNE (${report.ambiguous.length}) — do rozstrzygnięcia pojedynczo`);
  if (report.ambiguous.length > 0) row("LOGIN", "KONTAKT", "PEWNOŚĆ", "POWÓD");
  for (const { login, candidates, reason } of report.ambiguous) {
    candidates.forEach((candidate, i) =>
      row(
        i === 0 ? loginLabel(login) : "",
        contactLabel(candidate.contact),
        CONFIDENCE_LABEL[candidate.confidence],
        i === 0 ? AMBIGUITY_LABEL[reason] : "",
      ),
    );
  }

  write(`\nBEZ DOPASOWANIA (${report.unmatched.length})`);
  for (const login of report.unmatched) write(`  ${loginLabel(login)}`);
}

main()
  .catch((error: unknown) => {
    process.exitCode = 1;
    process.stderr.write(
      `\nDopasowanie nie powiodło się: ${error instanceof Error ? error.stack : String(error)}\n`,
    );
  })
  .finally(() => prisma.$disconnect());

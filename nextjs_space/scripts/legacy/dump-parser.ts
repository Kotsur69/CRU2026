/**
 * Quote-aware parser for the legacy MySQL dump (`cru.sql`, HeidiSQL export of MySQL 5.1).
 *
 * It walks the file as a character stream rather than line by line, so string literals
 * containing commas, parentheses or literal newlines cannot break tuple boundaries.
 * Only INSERT statements are read; DDL, views and session pragmas are skipped.
 */

export type SqlValue = string | null;

export interface InsertStatement {
  readonly table: string;
  readonly columns: readonly string[];
  readonly rows: readonly SqlValue[][];
}

const INSERT_PREFIX = "INSERT INTO `";

/**
 * Yields one entry per INSERT statement. A table split across several statements
 * (the dump chunks `contracthistory` into 24) yields several entries.
 */
export function* parseInsertStatements(sql: string): Generator<InsertStatement> {
  let cursor = 0;

  while (cursor < sql.length) {
    const start = sql.indexOf(INSERT_PREFIX, cursor);
    if (start === -1) return;

    const tableEnd = sql.indexOf("`", start + INSERT_PREFIX.length);
    if (tableEnd === -1) return;
    const table = sql.slice(start + INSERT_PREFIX.length, tableEnd);

    const valuesAt = sql.indexOf(" VALUES", tableEnd);
    if (valuesAt === -1) return;

    const columns = parseColumnList(sql.slice(tableEnd + 1, valuesAt));
    const { rows, end } = parseTuples(sql, valuesAt + " VALUES".length, columns.length, table);

    yield { table, columns, rows };
    cursor = end;
  }
}

function parseColumnList(segment: string): string[] {
  const open = segment.indexOf("(");
  const close = segment.lastIndexOf(")");
  if (open === -1 || close === -1) return [];
  return segment
    .slice(open + 1, close)
    .split(",")
    .map((raw) => raw.trim().replace(/^`|`$/g, ""));
}

interface TupleScan {
  rows: SqlValue[][];
  end: number;
}

/** Reads `(…), (…), …;` starting at `from`, stopping at the statement's terminating semicolon. */
function parseTuples(sql: string, from: number, expectedWidth: number, table: string): TupleScan {
  const rows: SqlValue[][] = [];
  let i = from;

  while (i < sql.length) {
    while (i < sql.length && /[\s,]/.test(sql[i]!)) i += 1;

    if (i >= sql.length || sql[i] === ";") {
      return { rows, end: i + 1 };
    }
    if (sql[i] !== "(") {
      // Not a tuple — the statement ended without a semicolon we could see.
      return { rows, end: i };
    }

    i += 1; // consume "("
    const row: SqlValue[] = [];

    while (i < sql.length) {
      while (i < sql.length && /\s/.test(sql[i]!)) i += 1;

      if (sql[i] === ")") {
        i += 1;
        break;
      }
      if (sql[i] === ",") {
        i += 1;
        continue;
      }

      if (sql[i] === "'") {
        const { value, next } = readQuoted(sql, i);
        row.push(value);
        i = next;
      } else {
        const { value, next } = readBare(sql, i);
        row.push(value);
        i = next;
      }
    }

    if (expectedWidth > 0 && row.length !== expectedWidth) {
      throw new Error(
        `Malformed row in \`${table}\`: expected ${expectedWidth} values, parsed ${row.length}. ` +
          `First value: ${String(row[0])}`,
      );
    }
    rows.push(row);
  }

  return { rows, end: i };
}

/** Reads a single-quoted literal, resolving MySQL backslash escapes and `''`. */
function readQuoted(sql: string, at: number): { value: string; next: number } {
  let i = at + 1;
  let out = "";

  while (i < sql.length) {
    const ch = sql[i]!;

    if (ch === "\\") {
      const escaped = sql[i + 1];
      switch (escaped) {
        case "n":
          out += "\n";
          break;
        case "r":
          out += "\r";
          break;
        case "t":
          out += "\t";
          break;
        case "0":
          out += "\0";
          break;
        case "Z":
          out += "\x1a";
          break;
        case undefined:
          out += "\\";
          break;
        default:
          // \' \" \\ \% \_ and anything else: the character itself.
          out += escaped;
      }
      i += 2;
      continue;
    }

    if (ch === "'") {
      if (sql[i + 1] === "'") {
        out += "'";
        i += 2;
        continue;
      }
      return { value: out, next: i + 1 };
    }

    out += ch;
    i += 1;
  }

  throw new Error(`Unterminated string literal at offset ${at}`);
}

/** Reads NULL, a number, or an unquoted token up to the next delimiter. */
function readBare(sql: string, at: number): { value: SqlValue; next: number } {
  let i = at;
  while (i < sql.length && !/[,)]/.test(sql[i]!)) i += 1;

  const token = sql.slice(at, i).trim();
  return { value: token.toUpperCase() === "NULL" ? null : token, next: i };
}

// ─────────────────────────────────────────────────────────────────────────
// Value coercion — MySQL 5.1 conventions to PostgreSQL / TypeScript
// ─────────────────────────────────────────────────────────────────────────

const ZERO_DATE = /^0000-00-00(?:[ T]00:00:00)?$/;

/** Turns a dump row into a column-keyed record. */
export function toRecord(
  columns: readonly string[],
  row: readonly SqlValue[],
): Record<string, SqlValue> {
  const record: Record<string, SqlValue> = {};
  for (let i = 0; i < columns.length; i += 1) {
    record[columns[i]!] = row[i] ?? null;
  }
  return record;
}

/** Trims, then maps the empty string to null — legacy uses `''` where it means "unset". */
export function asText(value: SqlValue): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Same as {@link asText} but keeps the empty string, for NOT NULL text columns. */
export function asRequiredText(value: SqlValue): string {
  return value === null ? "" : value.trim();
}

export function asInt(value: SqlValue): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/** `0` -> false, anything else non-null -> true. Null stays null. */
export function asBool(value: SqlValue): boolean | null {
  const parsed = asInt(value);
  return parsed === null ? null : parsed !== 0;
}

/** Legacy tri-state (`1` yes / `0` no / `-1` unspecified) to a nullable boolean. */
export function asTriBool(value: SqlValue): boolean | null {
  const parsed = asInt(value);
  if (parsed === null || parsed < 0) return null;
  return parsed !== 0;
}

/** Date-only column. Rejects the `0000-00-00` sentinel and unparseable values. */
export function asDate(value: SqlValue): Date | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "" || ZERO_DATE.test(trimmed)) return null;
  const parsed = new Date(`${trimmed.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Timestamp column. Legacy stores local time without a zone; read as UTC. */
export function asDateTime(value: SqlValue): Date | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "" || ZERO_DATE.test(trimmed)) return null;
  const parsed = new Date(`${trimmed.replace(" ", "T")}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Decimal column, kept as a string so no precision is lost before Prisma. */
export function asDecimal(value: SqlValue): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

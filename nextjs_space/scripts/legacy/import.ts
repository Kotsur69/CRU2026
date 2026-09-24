/**
 * Imports the legacy AMDS CRU MySQL dump (`cru.sql`) into the CRU2026 PostgreSQL schema.
 *
 * Usage (from `nextjs_space/`):
 *   yarn db:import --dry-run           parse + integrity report, writes nothing
 *   yarn db:import --file ../cru.sql    explicit dump location
 *   yarn db:import                      full load
 *
 * The load is ordered by foreign-key dependency. Legacy integer ids are preserved, so the
 * import is repeatable: re-running it against a populated database skips existing rows.
 *
 * Two legacy facts shape this script:
 *  - `users` is a VIEW over a corporate directory that is NOT in the dump. Every user id
 *    referenced anywhere becomes a placeholder User row, to be enriched once the directory
 *    export arrives.
 *  - Legacy does not enforce referential integrity on several columns, so dangling foreign
 *    keys are nulled and counted rather than aborting the load.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  PrismaClient,
  type AccessDimension,
  type ContractModule,
  type ContractStatusKind,
  type DomainKind,
} from "@prisma/client";

import {
  asBool,
  asDate,
  asDateTime,
  asDecimal,
  asInt,
  asRequiredText,
  asText,
  asTriBool,
  parseInsertStatements,
  toRecord,
  type SqlValue,
} from "./dump-parser";
import { addressIssue } from "../../lib/mailing/address";

type Row = Record<string, SqlValue>;
type TableMap = Map<string, Row[]>;

const CHUNK_SIZE = 2_000;

/** Sentinel for required timestamps the legacy data never filled in. */
const UNKNOWN_DATE = new Date(0);

const prisma = new PrismaClient();

function notNull<T>(value: T | null): value is T {
  return value !== null;
}

/** A legacy integer reference where `0` means "none" (`giveopinions`, author columns). */
function asId(value: SqlValue): number | null {
  const id = asInt(value);
  return id !== null && id > 0 ? id : null;
}

// ─────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────

interface Options {
  readonly dumpPath: string;
  readonly dryRun: boolean;
}

function parseOptions(argv: readonly string[]): Options {
  const fileArgIndex = argv.indexOf("--file");
  const dumpPath =
    fileArgIndex !== -1 && argv[fileArgIndex + 1]
      ? path.resolve(argv[fileArgIndex + 1]!)
      : path.resolve(process.cwd(), "..", "cru.sql");

  return { dumpPath, dryRun: argv.includes("--dry-run") };
}

// ─────────────────────────────────────────────────────────────────────────
// Parse
// ─────────────────────────────────────────────────────────────────────────

async function readDump(dumpPath: string): Promise<TableMap> {
  const sql = await readFile(dumpPath, "utf8");
  const tables: TableMap = new Map();

  for (const statement of parseInsertStatements(sql)) {
    const bucket = tables.get(statement.table) ?? [];
    for (const row of statement.rows) {
      bucket.push(toRecord(statement.columns, row));
    }
    tables.set(statement.table, bucket);
  }

  return tables;
}

function rowsOf(tables: TableMap, table: string): Row[] {
  return tables.get(table) ?? [];
}

/** Collects the primary keys of a legacy table, so dangling references can be detected. */
function idSet(rows: readonly Row[], column = "id"): Set<number> {
  const ids = new Set<number>();
  for (const row of rows) {
    const id = asInt(row[column] ?? null);
    if (id !== null) ids.add(id);
  }
  return ids;
}

// ─────────────────────────────────────────────────────────────────────────
// Foreign-key sanitation
// ─────────────────────────────────────────────────────────────────────────

class DroppedRefs {
  private readonly counts = new Map<string, number>();

  /** Returns `id` when it exists in `valid`, otherwise null, recording the drop. */
  resolve(label: string, id: number | null, valid: ReadonlySet<number>): number | null {
    if (id === null) return null;
    if (valid.has(id)) return id;
    this.counts.set(label, (this.counts.get(label) ?? 0) + 1);
    return null;
  }

  get entries(): [string, number][] {
    return [...this.counts.entries()].sort((a, b) => b[1] - a[1]);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Enum mapping
// ─────────────────────────────────────────────────────────────────────────

function statusKind(legacyProject: SqlValue): ContractStatusKind {
  switch (asInt(legacyProject)) {
    case 1:
      return "PROJECT";
    case 2:
      return "RISK";
    default:
      return "CONTRACT";
  }
}

/**
 * Legacy `contract.project` — four values, not a flag (docs/features/01): 0 Umowy,
 * 1 Projekty, 2 Dział ryzyka, and 3 for the 39 records of an abandoned 2021 experiment.
 */
function contractModule(legacyProject: SqlValue): ContractModule {
  switch (asInt(legacyProject)) {
    case 1:
      return "PROJECT";
    case 2:
      return "RISK";
    case 3:
      return "LEGACY_2021";
    default:
      return "CONTRACT";
  }
}

function domainKind(legacyType: SqlValue): DomainKind {
  return asInt(legacyType) === 2 ? "RISK" : "GENERAL";
}

/** Legacy `access.id` -> AccessDimension, taken from the dump's own `access` table. */
const ACCESS_DIMENSIONS: Record<number, AccessDimension> = {
  1: "COMPANY",
  2: "DOMAIN",
  3: "LOCATION",
  4: "NATURE",
  5: "NOTICE_PERIOD",
  6: "DOCUMENT_TYPE",
  7: "TRADE",
  8: "CONNECTED_ENTITY",
  9: "PROJECT_MODULE",
  10: "BUSINESSLINE",
};

// ─────────────────────────────────────────────────────────────────────────
// Load helper
// ─────────────────────────────────────────────────────────────────────────

const loaded: { model: string; rows: number }[] = [];

async function load<T>(
  model: string,
  rows: readonly T[],
  insert: (chunk: T[]) => Promise<unknown>,
  dryRun: boolean,
): Promise<void> {
  loaded.push({ model, rows: rows.length });
  if (dryRun || rows.length === 0) return;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    await insert(rows.slice(i, i + CHUNK_SIZE) as T[]);
  }
  process.stdout.write(`  ${model.padEnd(26)}${rows.length}\n`);
}

/**
 * Resolves and de-duplicates a legacy junction table with no primary key
 * (`users_groups`, `users_locations` and `contract_has_location` all permit duplicates).
 */
function dedupePairs(
  rows: readonly Row[],
  leftColumn: string,
  rightColumn: string,
  leftValid: ReadonlySet<number>,
  rightValid: ReadonlySet<number>,
  dropped: DroppedRefs,
  table: string,
): [number, number][] {
  const seen = new Set<string>();
  const pairs: [number, number][] = [];

  for (const row of rows) {
    const left = dropped.resolve(`${table}.${leftColumn}`, asInt(row[leftColumn] ?? null), leftValid);
    const right = dropped.resolve(`${table}.${rightColumn}`, asInt(row[rightColumn] ?? null), rightValid);
    if (left === null || right === null) continue;

    const key = `${left}:${right}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push([left, right]);
  }

  return pairs;
}

// ─────────────────────────────────────────────────────────────────────────
// Restore pass (docs/features/01)
//
// The first version of this script collapsed `contract.project` to a boolean, reduced
// `giveopinions` to a flag and dropped `contractor.cru_id`. `createMany` skips rows that
// already exist, so on a database loaded by that version the new columns would stay
// empty. This pass fills them from the dump — and only where the application has not
// written a value of its own, so re-running it is a no-op and records created or edited
// since the import keep what they hold.
// ─────────────────────────────────────────────────────────────────────────

async function restoreLostColumns(
  contracts: readonly Row[],
  contractors: readonly Row[],
  attachments: readonly Row[],
  userIds: ReadonlySet<number>,
): Promise<void> {
  const contractIds: number[] = [];
  const modules: string[] = [];
  const requesterContractIds: number[] = [];
  const requesterIds: number[] = [];
  for (const r of contracts) {
    const id = asInt(r.id)!;
    contractIds.push(id);
    modules.push(contractModule(r.project));
    const requester = asId(r.giveopinions);
    if (requester !== null && userIds.has(requester)) {
      requesterContractIds.push(id);
      requesterIds.push(requester);
    }
  }

  const contractorIds: number[] = [];
  const cruIds: number[] = [];
  for (const r of contractors) {
    const cruId = asInt(r.cru_id);
    if (cruId === null) continue;
    contractorIds.push(asInt(r.id)!);
    cruIds.push(cruId);
  }

  const attachmentIds = attachments.map((r) => asInt(r.id)).filter(notNull);

  // A record with a status got its module from the status's kind in the migration, which
  // is exact. Only status-less records needed the legacy value (projects vs. LEGACY_2021).
  const module = await prisma.$executeRaw`
    UPDATE "Contract" AS c SET "module" = v.module::"ContractModule"
    FROM unnest(${contractIds}::int[], ${modules}::text[]) AS v(id, module)
    WHERE c."id" = v.id AND c."statusId" IS NULL AND c."module"::text <> v.module`;

  // Only rounds that are still open here: an edit that closed one must not reopen it.
  const requester = await prisma.$executeRaw`
    UPDATE "Contract" AS c SET "opinionsRequestedById" = v.requester
    FROM unnest(${requesterContractIds}::int[], ${requesterIds}::int[]) AS v(id, requester)
    WHERE c."id" = v.id AND c."opinionsRequested" AND c."opinionsRequestedById" IS NULL`;

  const cruId = await prisma.$executeRaw`
    UPDATE "Contractor" AS c SET "legacyCruId" = v.cru_id
    FROM unnest(${contractorIds}::int[], ${cruIds}::int[]) AS v(id, cru_id)
    WHERE c."id" = v.id AND c."legacyCruId" IS NULL`;

  const estimated = await prisma.$executeRaw`
    UPDATE "Attachment" SET "addedAtEstimated" = true
    WHERE "id" = ANY(${attachmentIds}::int[]) AND NOT "addedAtEstimated"`;

  process.stdout.write(
    "\nRestore pass (rows already present, filled where empty):\n" +
      `  ${"Contract.module".padEnd(36)}${module}\n` +
      `  ${"Contract.opinionsRequestedById".padEnd(36)}${requester}\n` +
      `  ${"Contractor.legacyCruId".padEnd(36)}${cruId}\n` +
      `  ${"Attachment.addedAtEstimated".padEnd(36)}${estimated}\n`,
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { dumpPath, dryRun } = parseOptions(process.argv.slice(2));
  const started = Date.now();

  process.stdout.write(`Reading ${dumpPath}\n`);
  const tables = await readDump(dumpPath);

  const summary = [...tables.entries()]
    .map(([name, rows]) => `${name}=${rows.length}`)
    .sort()
    .join("  ");
  process.stdout.write(`Parsed ${tables.size} tables\n${summary}\n\n`);

  const dropped = new DroppedRefs();

  // ── Dictionaries ───────────────────────────────────────────────────────
  const documentTypes = rowsOf(tables, "contract_type");
  const statuses = rowsOf(tables, "contract_status");
  const companies = rowsOf(tables, "contract_company");
  const businesslines = rowsOf(tables, "buissnesline");
  const locations = rowsOf(tables, "contract_location");
  const domains = rowsOf(tables, "contract_domain");
  const natures = rowsOf(tables, "contract_nature");
  const noticePeriods = rowsOf(tables, "contract_notice_period");
  const currencies = rowsOf(tables, "currency");
  const deliveryMethods = rowsOf(tables, "delivery_method");
  const trades = rowsOf(tables, "trade");
  const messages = rowsOf(tables, "message");
  const mailingGroups = rowsOf(tables, "mailing_groups");
  const opinionTypes = rowsOf(tables, "opiniontypes");

  const documentTypeIds = idSet(documentTypes);
  const statusIds = idSet(statuses);
  const companyIds = idSet(companies);
  const businesslineIds = idSet(businesslines);
  const locationIds = idSet(locations);
  const domainIds = idSet(domains);
  const natureIds = idSet(natures);
  const noticePeriodIds = idSet(noticePeriods);
  const currencyIds = idSet(currencies, "id_currency");
  const deliveryMethodIds = idSet(deliveryMethods);
  const tradeIds = idSet(trades);
  const messageIds = idSet(messages);
  const mailingGroupIds = idSet(mailingGroups);
  const opinionTypeIds = idSet(opinionTypes);

  await load(
    "DocumentType",
    documentTypes.map((r) => ({
      id: asInt(r.id)!,
      name: asRequiredText(r.contract_type),
      active: asBool(r.active) ?? false,
      sortOrder: asInt(r.id)!,
    })),
    (data) => prisma.documentType.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  await load(
    "ContractStatus",
    statuses.map((r) => ({
      id: asInt(r.id)!,
      name: asRequiredText(r.contract_status),
      kind: statusKind(r.project),
      sortOrder: asInt(r.id)!,
    })),
    (data) => prisma.contractStatus.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  await load(
    "Company",
    companies.map((r) => ({
      id: asInt(r.id)!,
      shortName: asRequiredText(r.company_short),
      fullName: asText(r.company_long),
      active: asBool(r.active) ?? false,
      sortOrder: asInt(r.id)!,
    })),
    (data) => prisma.company.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  await load(
    "Businessline",
    businesslines.map((r) => ({
      id: asInt(r.id)!,
      name: asRequiredText(r.name),
      shortName: asText(r.name_short),
      sortOrder: asInt(r.id)!,
    })),
    (data) => prisma.businessline.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  await load(
    "Location",
    locations.map((r) => ({
      id: asInt(r.id)!,
      name: asRequiredText(r.location),
      description: asText(r.description),
      sortOrder: asInt(r.id)!,
    })),
    (data) => prisma.location.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  await load(
    "Domain",
    domains.map((r) => ({
      id: asInt(r.id)!,
      name: asRequiredText(r.domain),
      kind: domainKind(r.type),
      sortOrder: asInt(r.id)!,
    })),
    (data) => prisma.domain.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  await load(
    "ContractNature",
    natures.map((r) => ({
      id: asInt(r.id)!,
      name: asRequiredText(r.nature),
      sortOrder: asInt(r.id)!,
    })),
    (data) => prisma.contractNature.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  await load(
    "NoticePeriod",
    noticePeriods.map((r) => ({
      id: asInt(r.id)!,
      name: asRequiredText(r.period_name),
      days: asInt(r.days),
    })),
    (data) => prisma.noticePeriod.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  await load(
    "Currency",
    currencies.map((r) => ({
      id: asInt(r.id_currency)!,
      code: asRequiredText(r.currency_code),
      priority: asInt(r.pri) ?? 0,
    })),
    (data) => prisma.currency.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  await load(
    "DeliveryMethod",
    deliveryMethods.map((r) => ({ id: asInt(r.id)!, name: asRequiredText(r.delivery) })),
    (data) => prisma.deliveryMethod.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  await load(
    "Trade",
    trades.map((r) => ({ id: asInt(r.id)!, name: asRequiredText(r.name) })),
    (data) => prisma.trade.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  await load(
    "MessageTemplate",
    messages.map((r) => ({ id: asInt(r.id)!, name: asRequiredText(r.name) })),
    (data) => prisma.messageTemplate.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  await load(
    "MailingGroup",
    mailingGroups.map((r) => ({ id: asInt(r.id)!, name: asRequiredText(r.name) })),
    (data) => prisma.mailingGroup.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  // ── Users: placeholders for every legacy id referenced anywhere ─────────
  const contracts = rowsOf(tables, "contract");
  const contractors = rowsOf(tables, "contractor");
  const groups = rowsOf(tables, "group");
  const admins = rowsOf(tables, "admins");

  const adminIds = new Set<number>();
  for (const row of admins) {
    const id = asInt(row.user_id);
    if (id !== null) adminIds.add(id);
  }

  const userIds = new Set<number>();
  const noteUser = (value: SqlValue): void => {
    const id = asInt(value);
    if (id !== null && id > 0) userIds.add(id);
  };

  for (const r of contracts) {
    noteUser(r.registered_by);
    noteUser(r.modified_by);
    noteUser(r.acceptuser);
    noteUser(r.giveopinions);
  }
  for (const r of contractors) {
    noteUser(r.registered_by);
    noteUser(r.modified_by);
  }
  for (const r of groups) noteUser(r.owner_id);
  for (const table of [
    "contract_users",
    "opinions",
    "remarks",
    "contracthistory",
    "shoutboxusers",
    "users_groups",
    "users_groups_history",
    "users_locations",
    "useraccess",
    "admins",
  ]) {
    for (const r of rowsOf(tables, table)) noteUser(r.user_id);
  }

  await load(
    "User (placeholders)",
    [...userIds]
      .sort((a, b) => a - b)
      .map((id) => ({
        id,
        login: `legacy-${id}`,
        active: false,
        isAdmin: adminIds.has(id),
        isPlaceholder: true,
      })),
    (data) => prisma.user.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  // ── Groups, roles and per-user scoping ─────────────────────────────────
  await load(
    "Group",
    groups.map((r) => ({
      id: asInt(r.id)!,
      name: asRequiredText(r.name),
      active: asBool(r.active) ?? true,
      ownerId: dropped.resolve("group.owner_id", asInt(r.owner_id), userIds),
      businesslineId: dropped.resolve(
        "group.buissnesline_id",
        asInt(r.buissnesline_id),
        businesslineIds,
      ),
    })),
    (data) => prisma.group.createMany({ data, skipDuplicates: true }),
    dryRun,
  );
  const groupIds = idSet(groups);

  await load(
    "OpinionType",
    opinionTypes.map((r) => ({
      id: asInt(r.id)!,
      name: asRequiredText(r.name),
      groupId: dropped.resolve("opiniontypes.group_id", asInt(r.group_id), groupIds),
    })),
    (data) => prisma.opinionType.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  await load(
    "MailingContact",
    rowsOf(tables, "mailing_lists").map((r) => ({
      id: asInt(r.id)!,
      firstName: asText(r.name),
      lastName: asText(r.surname),
      email: asText(r.email),
      mailingGroupId: dropped.resolve(
        "mailing_lists.mailing_group_id",
        asInt(r.mailing_group_id),
        mailingGroupIds,
      ),
    })),
    (data) => prisma.mailingContact.createMany({ data, skipDuplicates: true }),
    dryRun,
  );
  // `mailing_lists.email` is char(50) and MySQL cut longer values silently: an address
  // that fills the column, or no longer ends in a domain, is reported (docs/features/25).
  const suspectAddresses = rowsOf(tables, "mailing_lists").filter(
    (r) => addressIssue(asText(r.email)) === "suspect",
  );
  if (suspectAddresses.length > 0) {
    process.stdout.write(
      `  ! MailingContact: ${suspectAddresses.length} address(es) may be truncated, ids ` +
        `${suspectAddresses.map((r) => asInt(r.id)).join(", ")}\n`,
    );
  }

  await load(
    "UserGroup",
    dedupePairs(
      rowsOf(tables, "users_groups"),
      "user_id",
      "group_id",
      userIds,
      groupIds,
      dropped,
      "users_groups",
    ).map(([userId, groupId]) => ({ userId, groupId })),
    (data) => prisma.userGroup.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  await load(
    "UserGroupHistory",
    rowsOf(tables, "users_groups_history")
      .map((r) => {
        const userId = dropped.resolve("users_groups_history.user_id", asInt(r.user_id), userIds);
        const groupId = dropped.resolve("users_groups_history.group_id", asInt(r.group_id), groupIds);
        return userId === null || groupId === null ? null : { userId, groupId };
      })
      .filter(notNull),
    (data) => prisma.userGroupHistory.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  await load(
    "UserLocation",
    dedupePairs(
      rowsOf(tables, "users_locations"),
      "user_id",
      "location_id",
      userIds,
      locationIds,
      dropped,
      "users_locations",
    ).map(([userId, locationId]) => ({ userId, locationId })),
    (data) => prisma.userLocation.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  await load(
    "UserAccessScope",
    rowsOf(tables, "useraccess")
      .map((r) => {
        const accessId = asInt(r.access_id);
        const dimension = accessId === null ? undefined : ACCESS_DIMENSIONS[accessId];
        const userId = dropped.resolve("useraccess.user_id", asInt(r.user_id), userIds);
        const valueId = asInt(r.key);
        if (dimension === undefined || userId === null || valueId === null) return null;
        return { userId, dimension, valueId };
      })
      .filter(notNull),
    (data) => prisma.userAccessScope.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  // Legacy `access`: the metamodel behind `useraccess`. `has_many` is `0` on every row
  // except location, where it names the link table a location grant must also match.
  await load(
    "AccessDefinition",
    rowsOf(tables, "access")
      .map((r) => {
        const id = asInt(r.id);
        const dimension = id === null ? undefined : ACCESS_DIMENSIONS[id];
        if (id === null || dimension === undefined) return null;
        const joinTable = asText(r.has_many);
        return {
          id,
          dimension,
          dictionaryTable: asRequiredText(r.table),
          labelColumn: asRequiredText(r.column),
          contractColumn: asRequiredText(r.name),
          joinTable: joinTable === null || joinTable === "0" ? null : joinTable,
        };
      })
      .filter(notNull),
    (data) => prisma.accessDefinition.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  // ── Contractors ────────────────────────────────────────────────────────
  await load(
    "Contractor",
    contractors.map((r) => ({
      id: asInt(r.id)!,
      shortName: asText(r.name_short),
      fullName: asText(r.name_full),
      address: asText(r.address),
      vatId: asText(r.vat_identification),
      register: asText(r.register),
      cruIdentifier: asText(r.cru_identifier),
      legacyCruId: asInt(r.cru_id),
      isCeidg: asBool(r.CEIDG) ?? false,
      isConnected: asBool(r.companies_connected) ?? false,
      isDeleted: asBool(r.deleted) ?? false,
      registeredAt: asDateTime(r.registered_on),
      registeredById: dropped.resolve("contractor.registered_by", asId(r.registered_by), userIds),
      modifiedAt: asDateTime(r.modified_on),
      modifiedById: dropped.resolve("contractor.modified_by", asId(r.modified_by), userIds),
    })),
    (data) => prisma.contractor.createMany({ data, skipDuplicates: true }),
    dryRun,
  );
  const contractorIds = idSet(contractors);

  // ── Contracts. `parent_id` is a self-reference, applied in a second pass. ──
  const contractIds = idSet(contracts);
  const parentLinks: { id: number; parentId: number }[] = [];

  await load(
    "Contract",
    contracts.map((r) => {
      const id = asInt(r.id)!;
      const parentId = dropped.resolve("contract.parent_id", asInt(r.parent_id), contractIds);
      if (parentId !== null && parentId !== id) parentLinks.push({ id, parentId });

      return {
        id,
        identifier: asText(r.identifier),
        contractReference: asText(r.contract_reference),
        description: asText(r.description),
        remarks: asText(r.remarks),
        documentTypeId: dropped.resolve("contract.type_id", asInt(r.type_id), documentTypeIds),
        statusId: dropped.resolve("contract.status_id", asInt(r.status_id), statusIds),
        companyId: dropped.resolve("contract.company_id", asInt(r.company_id), companyIds),
        businesslineId: dropped.resolve(
          "contract.buissnesline_id",
          asInt(r.buissnesline_id),
          businesslineIds,
        ),
        domainId: dropped.resolve("contract.domain_id", asInt(r.domain_id), domainIds),
        natureId: dropped.resolve(
          "contract.contract_nature_id",
          asInt(r.contract_nature_id),
          natureIds,
        ),
        tradeId: dropped.resolve("contract.trade_id", asInt(r.trade_id), tradeIds),
        contractorId: dropped.resolve("contract.contractor_id", asInt(r.contractor_id), contractorIds),
        debtorId: dropped.resolve("contract.debtor_id", asInt(r.debtor_id), contractorIds),
        primaryLocationId: dropped.resolve("contract.location_id", asInt(r.location_id), locationIds),
        dateBegin: asDate(r.date_begin),
        dateEnd: asDate(r.date_end),
        sentOn: asDate(r.date_send),
        salary: asDecimal(r.salary),
        currencyId: dropped.resolve("contract.currency_id", asInt(r.currency_id), currencyIds),
        specificSalaryTerms: asText(r.specific_salary_terms),
        paymentTerm: asText(r.date_payment),
        noticePeriodId: dropped.resolve(
          "contract.notice_period_id",
          asInt(r.notice_period_id),
          noticePeriodIds,
        ),
        deliveryMethodId: dropped.resolve(
          "contract.delivery_id",
          asInt(r.delivery_id),
          deliveryMethodIds,
        ),
        companiesConnected: asBool(r.companies_connected) ?? false,
        insuranceGuarantee: asBool(r.insurance_guarantee) ?? false,
        obsc: asBool(r.OBSC) ?? false,
        obscDescription: asText(r.descOBSC),
        // Who opened the opinion round. The flag follows the legacy value rather than
        // the resolved id, so an unresolvable requester cannot silently close a round.
        opinionsRequestedById: dropped.resolve(
          "contract.giveopinions",
          asId(r.giveopinions),
          userIds,
        ),
        opinionsRequested: asId(r.giveopinions) !== null,
        isEditable: asBool(r.edittable) ?? true,
        module: contractModule(r.project),
        isDeleted: asBool(r.deleted) ?? false,
        tempForm: asTriBool(r.temp_form),
        bill: asBool(r.bill) ?? false,
        spsId: asInt(r.sps_id),
        spsLastVersion: asInt(r.sps_last_version),
        isAccepted: asBool(r.accept),
        acceptedById: dropped.resolve("contract.acceptuser", asInt(r.acceptuser), userIds),
        acceptedAt: asDateTime(r.acceptdate),
        registeredAt:
          asDateTime(r.registered_on) ?? asDateTime(r.oldregistered_on) ?? UNKNOWN_DATE,
        registeredById: dropped.resolve("contract.registered_by", asInt(r.registered_by), userIds),
        modifiedAt: asDateTime(r.modified_on),
        modifiedById: dropped.resolve("contract.modified_by", asInt(r.modified_by), userIds),
        legacyRegisteredAt: asDateTime(r.oldregistered_on),
      };
    }),
    (data) => prisma.contract.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  // A silently discarded contract would break every foreign key that follows, so the
  // stored count is verified rather than trusted.
  if (!dryRun) {
    const stored = await prisma.contract.count();
    if (stored !== contracts.length) {
      throw new Error(
        `Contract: parsed ${contracts.length} rows but stored ${stored}. ` +
          "A unique constraint discarded rows — fix the schema before re-running.",
      );
    }
  }

  loaded.push({ model: "Contract.parentId (pass 2)", rows: parentLinks.length });
  if (!dryRun) {
    for (const { id, parentId } of parentLinks) {
      await prisma.contract.update({ where: { id }, data: { parentId } });
    }
    process.stdout.write(`  ${"Contract.parentId".padEnd(26)}${parentLinks.length}\n`);
  }

  // ── Contract children ──────────────────────────────────────────────────
  await load(
    "ContractLocationLink",
    dedupePairs(
      rowsOf(tables, "contract_has_location"),
      "contract_id",
      "location_id",
      contractIds,
      locationIds,
      dropped,
      "contract_has_location",
    ).map(([contractId, locationId]) => ({ contractId, locationId })),
    (data) => prisma.contractLocationLink.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  // Duplicate (contract, user) pairs exist; the widest permission wins.
  const contractUsers = new Map<string, { contractId: number; userId: number; readOnly: boolean }>();
  for (const r of rowsOf(tables, "contract_users")) {
    const contractId = dropped.resolve("contract_users.contract_id", asInt(r.contract_id), contractIds);
    const userId = dropped.resolve("contract_users.user_id", asInt(r.user_id), userIds);
    if (contractId === null || userId === null) continue;

    const key = `${contractId}:${userId}`;
    const readOnly = asBool(r.onlyRead) ?? false;
    const existing = contractUsers.get(key);
    if (!existing || (existing.readOnly && !readOnly)) {
      contractUsers.set(key, { contractId, userId, readOnly });
    }
  }
  await load(
    "ContractUser",
    [...contractUsers.values()],
    (data) => prisma.contractUser.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  await load(
    "Attachment",
    rowsOf(tables, "attachment").map((r) => ({
      id: asInt(r.id)!,
      name: asText(r.name),
      storageKey: asText(r.path),
      fileType: asText(r.filetype),
      version: asInt(r.version),
      // Legacy `finally` is NULL or 1, never 0, so null → false loses nothing (Q29).
      isFinal: asBool(r.finally) ?? false,
      formSession: asText(r.formsession),
      contractId: dropped.resolve("attachment.contract_id", asInt(r.contract_id), contractIds),
      contractorId: dropped.resolve("attachment.contractor_id", asInt(r.contractor_id), contractorIds),
      // Legacy has no upload date; `addedAt` becomes the import time and says so.
      addedAtEstimated: true,
    })),
    (data) => prisma.attachment.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  await load(
    "Opinion",
    rowsOf(tables, "opinions")
      .map((r) => {
        const contractId = dropped.resolve("opinions.contract_id", asInt(r.contract_id), contractIds);
        if (contractId === null) return null;
        return {
          id: asInt(r.id)!,
          contractId,
          opinionTypeId: dropped.resolve(
            "opinions.opiniontype_id",
            asInt(r.opiniontype_id),
            opinionTypeIds,
          ),
          userId: dropped.resolve("opinions.user_id", asInt(r.user_id), userIds),
          description: asRequiredText(r.desc),
          signed: asBool(r.signature) ?? false,
          // Misnamed in legacy: `sign_date` is when the opinion was answered.
          respondedAt: asDateTime(r.sign_date),
          // Legacy never recorded when a request was made — null, not the import time.
          requestedAt: null,
          active: asBool(r.active) ?? true,
          noMdr: asBool(r.nomdr) ?? false,
          formVerified: asBool(r.form_ver) ?? false,
          sendVerified: asBool(r.send_ver) ?? false,
          sendInfo: asBool(r.sendinfo) ?? false,
          mailingDisabled: asBool(r.disableMailing) ?? false,
        };
      })
      .filter(notNull),
    (data) => prisma.opinion.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  // AcceptanceForm is 1:1 with a contract, so a repeated contract_id keeps the first row.
  const acceptanceSeen = new Set<number>();
  await load(
    "AcceptanceForm",
    rowsOf(tables, "acceptance_form")
      .map((r) => {
        const contractId = dropped.resolve(
          "acceptance_form.contract_id",
          asInt(r.contract_id),
          contractIds,
        );
        if (contractId === null || acceptanceSeen.has(contractId)) return null;
        acceptanceSeen.add(contractId);
        return {
          id: asInt(r.id)!,
          contractId,
          mdrProcedure: asBool(r.mdr_proc) ?? false,
          initialVerification: asBool(r.initial_verification) ?? false,
          formSent: asBool(r.sended_form) ?? false,
          ownerAccepted: asBool(r.owner_acceptance) ?? false,
          ownerAcceptedAt: asDateTime(r.owner_accept_date),
        };
      })
      .filter(notNull),
    (data) => prisma.acceptanceForm.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  const remarks = rowsOf(tables, "remarks");
  await load(
    "Remark",
    remarks.map((r) => ({
      id: asInt(r.id)!,
      contractId: dropped.resolve("remarks.contract_id", asInt(r.contract_id), contractIds),
      userId: dropped.resolve("remarks.user_id", asInt(r.user_id), userIds),
      body: asText(r.body),
      active: asBool(r.active) ?? true,
      createdAt: asDateTime(r.created_on) ?? UNKNOWN_DATE,
    })),
    (data) => prisma.remark.createMany({ data, skipDuplicates: true }),
    dryRun,
  );
  const remarkIds = idSet(remarks);

  const shoutbox = rowsOf(tables, "shoutbox");
  await load(
    "Shoutbox",
    shoutbox.map((r) => ({
      id: asInt(r.id)!,
      messageId: dropped.resolve("shoutbox.message_id", asInt(r.message_id), messageIds),
      contractId: dropped.resolve("shoutbox.contract_id", asInt(r.contract_id), contractIds),
      remarkId: dropped.resolve("shoutbox.remark_id", asInt(r.remark_id), remarkIds),
    })),
    (data) => prisma.shoutbox.createMany({ data, skipDuplicates: true }),
    dryRun,
  );
  const shoutboxIds = idSet(shoutbox);

  await load(
    "ShoutboxRecipient",
    rowsOf(tables, "shoutboxusers")
      .map((r) => {
        const shoutboxId = dropped.resolve(
          "shoutboxusers.shoutbox_id",
          asInt(r.shoutbox_id),
          shoutboxIds,
        );
        if (shoutboxId === null) return null;
        return {
          id: asInt(r.id)!,
          shoutboxId,
          userId: dropped.resolve("shoutboxusers.user_id", asInt(r.user_id), userIds),
          isRead: asBool(r.readed) ?? false,
        };
      })
      .filter(notNull),
    (data) => prisma.shoutboxRecipient.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  await load(
    "ContractHistory",
    rowsOf(tables, "contracthistory").map((r) => ({
      id: asInt(r.id)!,
      contractId: dropped.resolve("contracthistory.contract_id", asInt(r.contract_id), contractIds),
      columnName: asText(r.column_name),
      oldValue: asText(r.oldvalue),
      newValue: asText(r.newvalue),
      userId: dropped.resolve("contracthistory.user_id", asInt(r.user_id), userIds),
      createdAt: asDateTime(r.created_on) ?? UNKNOWN_DATE,
    })),
    (data) => prisma.contractHistory.createMany({ data, skipDuplicates: true }),
    dryRun,
  );

  if (!dryRun) {
    await restoreLostColumns(contracts, contractors, rowsOf(tables, "attachment"), userIds);
  }

  // ── Report ─────────────────────────────────────────────────────────────
  process.stdout.write(`\n${dryRun ? "DRY RUN — nothing written" : "Loaded"}\n`);
  process.stdout.write(`${"MODEL".padEnd(30)}ROWS\n`);
  for (const { model, rows } of loaded) {
    process.stdout.write(`${model.padEnd(30)}${rows.toLocaleString("en-US")}\n`);
  }
  const total = loaded.reduce((sum, entry) => sum + entry.rows, 0);
  process.stdout.write(`${"TOTAL".padEnd(30)}${total.toLocaleString("en-US")}\n`);

  const droppedEntries = dropped.entries;
  if (droppedEntries.length > 0) {
    process.stdout.write("\nDangling foreign keys set to NULL (legacy had no constraint):\n");
    for (const [label, count] of droppedEntries) {
      process.stdout.write(`  ${label.padEnd(36)}${count.toLocaleString("en-US")}\n`);
    }
  } else {
    process.stdout.write("\nNo dangling foreign keys.\n");
  }

  process.stdout.write(`\nFinished in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
}

main()
  .catch((error: unknown) => {
    process.exitCode = 1;
    process.stderr.write(
      `\nImport failed: ${error instanceof Error ? error.stack : String(error)}\n`,
    );
  })
  .finally(() => prisma.$disconnect());

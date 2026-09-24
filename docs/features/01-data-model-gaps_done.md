---
id: 01
title: Data-model gaps and re-import
group: A-foundations
status: done
depends-on: []
legacy-tables: [contract, contractor, opinions, attachment, access, companies_connected, project, admins, contract_type]
prisma-models: [Contract, Contractor, Opinion, Attachment, UserAccessScope, User]
routes: []
---

# 01 — Data-model gaps and re-import

## Why

The ETL in `scripts/legacy/import.ts` carried 457,542 rows with zero parse failures,
but four conversions are lossy and three legacy tables were never imported at all.
Two of those losses destroy information that no later feature can recover: which user
opened an opinion round (13,988 records), and which of the three modules a record
belongs to (421 risk records plus 39 unexplained ones). Everything downstream —
the opinion workflow, read authorization, the change log — reads these columns, so
they must be fixed before any of it is built.

The fix is a schema migration plus a full re-import. Both are cheap today (the import
takes 1.8 s) and expensive after cutover, when the new database is the system of record.

## Legacy behaviour

### `contract.giveopinions` is a user id, not a flag

```
cru.sql:39444    `giveopinions` int(11) DEFAULT '0',
cru.sql:39468    KEY `giveopinion` (`giveopinions`),
```

`int(11)` with its own index. Distribution over 20,624 rows:

| Value | Rows | |
|---|---|---|
| `0` | 6,636 | no opinion round |
| `50463` | 6,497 | user id |
| `50530` | 3,690 | user id |
| `50464` | 2,618 | user id |
| `50881` | 467 | user id |
| `539` | 353 | user id |
| `51126` | 145 | user id |
| `50968` | 57 | user id |
| `50763` | 38 | user id |
| `50554` | 37 | user id |
| `50556` | 33 | user id |
| `50956` | 26 | user id |
| `50555` | 25 | user id |
| `50468` | 2 | user id |

Every non-zero value is a user id that also appears in `admins` or in
`contract.registered_by`. `contracthistory` logs 8,192 changes to this column, so
rounds are re-assigned in practice — this is live workflow state, not a leftover.

`import.ts:642` does `opinionsRequested: asBool(r.giveopinions) ?? false`, mapping all
fourteen values to `true`. **"Who opened the round" is lost on 13,988 contracts.**

### `contract.project` has four values, not two

```
cru.sql:  `project` int(1) DEFAULT '0',
```

| Value | Rows | Status ids observed | Module |
|---|---|---|---|
| `0` | 11,115 | 1, 2, 3 | Umowy |
| `1` | 9,049 | 4, 5, 6, 7, 8, 12, 13 | Projekty |
| `2` | 421 | 9, 10, 11 | Dział ryzyka |
| `3` | 39 | `NULL` | — see Q11 |

This is the same three-way split as `contract_status.project`, which the importer
*does* honour — `import.ts:281` maps it to `ContractStatusKind{CONTRACT,PROJECT,RISK}`.
But `import.ts:644` does `isProject: asBool(r.project) ?? false`, collapsing 1, 2 and 3
into `true`. The schema comment on `Contract.isProject` says it "must agree with
status.kind"; for the 39 `project = 3` rows there is no status to agree with.

The 39 rows are one abandoned 2021 experiment: identifiers `2021/DYS/0002`,
`2021/DYS/0003`, …, all `deleted = 1`, all `status_id = NULL`, all
`buissnesline_id = 9` (a businessline that does not exist — `buissnesline` has ids
1–3 only), and they hold the only four `accept = 1` values in the entire table
(e.g. contract 13248: `accept=1, acceptuser=50463, acceptdate='2021-07-16 11:01:19'`).

### Three tables in the dump were never imported

`import.ts` never calls `rowsOf()` for `access`, `companies_connected` or `project`.

**`access`** (10 rows) is the access-control metamodel — a data-driven query builder.
Full contents:

| id | model | table | column | name (contract column) | has_many |
|---|---|---|---|---|---|
| 1 | company | contract_company | company_short | company_id | 0 |
| 2 | domain | contract_domain | domain | domain_id | 0 |
| 3 | location | contract_location | location | location_id | **contract_has_location** |
| 4 | nature | contract_nature | nature | contract_nature_id | 0 |
| 5 | period | contract_notice_period | period_name | notice_period_id | 0 |
| 6 | type | contract_type | contract_type | **notice_period_id** | 0 |
| 7 | trade | trade | name | trade_id | 0 |
| 8 | connected | companies_connected | name | companies_connected | 0 |
| 9 | project | project | name | project | 0 |
| 10 | buissnesline | buissnesline | name | buissnesline_id | 0 |

Frozen into `enum AccessDimension` in the schema, which loses two things the table
carries: `column` (which dictionary field the admin grant picker renders) and
`has_many` (location grants must also match through `contract_has_location`).
Row 6 is a legacy bug — see spec 03.

**`companies_connected`** (2 rows) and **`project`** (2 rows) are the label
dictionaries for access dimensions 8 and 9:

```
companies_connected:  (0, 'brak'), (1, 'tak')
project:              (0, 'brak'), (1, 'dostęp projekty')
```

Note `id = 0` is a real row in both. Any "ids are positive" assumption breaks them —
including `lib/utils.ts:13` `intParam`, which accepts positive safe integers only.

### Other lossy conversions

| Legacy | Type | Data | Current mapping | Problem |
|---|---|---|---|---|
| `contractor.cru_id` | `int(11)` | 1,019 of 3,580 non-null, range 656–1693 | **dropped** | The only remaining link to the pre-CRU system that CRU itself was migrated from. `cru_identifier` (`K0001`, `K0002`, …) is kept; this is its numeric counterpart. |
| `opinions.sign_date` | `datetime` | populated while `opinions.signature` is `0` on **all 16,531 rows** | `Opinion.signedAt` | Misnamed. The e-signature feature was never used; this column is when the opinion was *answered*. A UI built on `signedAt` would show an empty "signed" column beside a populated date. |
| `attachment.finally` | `int(1)` | `NULL` 22,669, `1` 16,602, **never `0`** | `Attachment.isFinal Boolean` via `asBool(…) ?? false` | Tri-state in practice: NULL = never marked, 1 = final. After conversion you cannot distinguish "never marked" from "marked not-final". |
| `contractor.registered_by` / `modified_by` | `int(11)` | | `registeredByLegacyId` / `modifiedByLegacyId` as plain `Int?` | Not relations, unlike the equivalent columns on `Contract`. A contractor's author cannot be joined to a user. |
| `attachment` (no timestamp column at all) | — | — | `Attachment.addedAt @default(now())` | All 39,271 historical files will carry the import date. Real upload dates are **unrecoverable**. |
| `contract.registered_on` + `oldregistered_on` both null | — | — | falls back to `new Date(0)` | Renders as 1970-01-01 in the UI. |

### Referential integrity direction changed

Legacy used `NO ACTION` on nearly every contract foreign key: the database *refused*
to delete a dictionary row still in use. Prisma adds `onDelete: Cascade` on
`Attachment`, `Opinion` and `AcceptanceForm`, so deleting a contract now silently
destroys its attachments, opinions and acceptance form. Legacy never physically
deleted a contract — it has 487 soft-deleted rows and no hard deletes.

## Legacy quirks

### Quirk: `contract_type` rows become inactive because legacy `active` is NULL

- **Legacy:** `contract_type.active` is `NULL` for id 1 `(brak danych)`, id 4
  `Kontrakt`, id 7 `Przetarg`. Legacy shows six types in its dropdown, so it treats
  NULL as inactive.
- **Why it matters:** `import.ts` does `asBool(r.active) ?? false`, which reproduces
  that. But 21 live contracts use type 4 and 19 use type 7 — hiding the option
  outright would blank the field on their first save.
- **We do:** keep the `?? false` mapping (it matches legacy), and rely on the
  keep-current guard already in `lib/contracts/dictionaries.ts:87` (`keep()`), which
  holds a record's own value on the list even when inactive. Already implemented and
  verified on record 2354.
- **Sign-off:** not needed.

### Quirk: `admins` doubles as the notification recipient list

- **Legacy:** `admins` (10 rows) grants admin rights **and** is the target of the
  `shoutbox_after_insert` trigger (`cru.sql:447494`), which inserts one
  `shoutboxusers` row per admin for every notification.
- **Why it matters:** `User.isAdmin` preserves membership, so the data survives —
  but only if whoever builds notifications knows that "admin" meant "subscriber".
  Gaps in the `admins.id` sequence (1–3, 6, 7, 9, 11, 13–18, 20–22) show 16 admins
  were revoked with no history kept.
- **We do:** record it here; the recipient-selection change itself belongs to spec 15.
- **Sign-off:** see Q5, owned by spec 15.

## Data migration

A Prisma migration (`db:migrate`, **not** `db:push` — `start.ps1` currently uses push
and so never applies migrations, see spec 31), then a full `db:import` re-run.

### Schema changes

```prisma
// Contract
opinionsRequestedById Int?
opinionsRequestedBy   User? @relation("ContractOpinionsRequestedBy",
                                      fields: [opinionsRequestedById], references: [id])
/// Derived: true when opinionsRequestedById is set. Kept as a column for indexing.
opinionsRequested     Boolean @default(false)

/// Replaces `isProject Boolean`. Mirrors ContractStatusKind, plus LEGACY_2021 for
/// the 39 rows with project = 3 and no status (see Q11).
module ContractModule @default(CONTRACT)

// Opinion
respondedAt DateTime?   // was signedAt; legacy sign_date
signed      Boolean @default(false)  // legacy signature — 0 on every row, kept for fidelity

// Contractor
legacyCruId    Int?     // legacy cru_id, restored
registeredById Int?
registeredBy   User? @relation("ContractorRegisteredBy", fields: [registeredById], references: [id])
modifiedById   Int?
modifiedBy     User? @relation("ContractorModifiedBy", fields: [modifiedById], references: [id])

// Attachment
/// Legacy `finally`: null = never marked, true = "Wersja ostateczna".
/// Never explicitly false in 39,271 imported rows.
isFinal Boolean?
/// True when addedAt is the import timestamp rather than a real upload date.
/// Legacy `attachment` has no timestamp column; unrecoverable for historical files.
addedAtEstimated Boolean @default(false)
```

New enum:

```prisma
enum ContractModule { CONTRACT PROJECT RISK LEGACY_2021 }
```

New model for the access metamodel (spec 03 consumes it):

```prisma
/// Legacy `access` — the 10 visibility dimensions and how each one filters.
model AccessDefinition {
  id              Int             @id
  dimension       AccessDimension @unique
  dictionaryTable String          // legacy `table`
  labelColumn     String          // legacy `column`
  contractColumn  String          // legacy `name`
  joinTable       String?         // legacy `has_many`, only set for location
}
```

`companies_connected` and `project` are two rows each and exist only to label a
boolean; they do **not** get tables. Their labels go into a constant in spec 03, with
the `id = 0` case documented.

### Importer changes

| File | Change |
|---|---|
| `scripts/legacy/import.ts:642` | `opinionsRequestedById: asId(r.giveopinions)` (0 → null); `opinionsRequested: derived` |
| `scripts/legacy/import.ts:644` | `module: contractModule(r.project)` replacing `isProject: asBool(...)` |
| `scripts/legacy/import.ts` (contractor block) | map `cru_id` → `legacyCruId`; `registered_by`/`modified_by` → relations with the same dangling-FK nulling the contract columns get |
| `scripts/legacy/import.ts` (opinions block) | `sign_date` → `respondedAt` |
| `scripts/legacy/import.ts` (attachment block) | `finally` → `isFinal` as nullable; set `addedAtEstimated: true` |
| `scripts/legacy/import.ts` (new) | import `access` → `AccessDefinition` |

### Backfill for records created since the import

At the time of writing the only such records are 21234 and 21235 (soft-deleted smoke
tests Mati asked to keep). `module` is derived from `status.kind`;
`opinionsRequestedById` stays null. No data loss either way — but the migration must
not assume the table is import-only.

### Cascade review

Change `onDelete: Cascade` to `Restrict` on `Attachment.contract`,
`Opinion.contract` and `AcceptanceForm.contract`, matching legacy `NO ACTION`.
Deletion in this application is soft (`Contract.isDeleted`) and must stay that way;
`Restrict` makes an accidental hard delete fail loudly instead of destroying history.

## Verification

Run before the migration, capture the numbers, run again after.

```sql
-- 1. Module split must match the status discriminator exactly.
select c.module, cs.kind, count(*)
from "Contract" c left join "ContractStatus" cs on cs.id = c."statusId"
group by 1, 2 order by 1, 2;
-- expected: CONTRACT×CONTRACT 11115, PROJECT×PROJECT 9049, RISK×RISK 421,
--           LEGACY_2021×NULL 39. No off-diagonal rows except LEGACY_2021.

-- 2. Opinion-round requester restored.
select count(*) from "Contract" where "opinionsRequestedById" is not null;
-- expected: 13988

select count(*) from "Contract" c
left join "User" u on u.id = c."opinionsRequestedById"
where c."opinionsRequestedById" is not null and u.id is null;
-- expected: 0 (every requester resolves to a user)

-- 3. Contractor provenance restored.
select count("legacyCruId") from "Contractor";   -- expected: 1019
select min("legacyCruId"), max("legacyCruId") from "Contractor";  -- expected: 656, 1693

-- 4. Attachment finality is tri-state again.
select "isFinal", count(*) from "Attachment" group by 1;
-- expected: true 16602, null 22669. No `false` rows.

-- 5. Access metamodel present.
select count(*) from "AccessDefinition";  -- expected: 10
select dimension, "joinTable" from "AccessDefinition" where "joinTable" is not null;
-- expected: exactly one row, LOCATION → contract_has_location

-- 6. Nothing else moved. Compare to the pre-migration baseline.
select 'Contract', count(*) from "Contract"
union all select 'ContractHistory', count(*) from "ContractHistory"
union all select 'Attachment', count(*) from "Attachment"
union all select 'Remark', count(*) from "Remark"
union all select 'Opinion', count(*) from "Opinion";
-- baseline: 20626 / 237405 / 39272 / 50737 / 16531
```

psql notes: use the Bash tool, `export PGCLIENTENCODING=UTF8`, and wrap any `UNION`
in a subquery before `ORDER BY` — Postgres rejects expressions in a union's order-by.

- [ ] `npx prisma migrate dev` produces one migration, no shadow-database errors
- [ ] `yarn db:import` completes, reports 0 unparseable rows and the same 93 dangling
      foreign keys as the last run (54 + 25 + 8 + 4 + 1 + 1)
- [ ] `yarn db:verify-files` still exits 0
- [ ] `npx tsc --noEmit` clean after the `isProject` → `module` rename propagates
      (call sites: `features/kontrakty/actions.ts`, `features/kontrakty/form-page.tsx`,
      `lib/contracts/record.ts`, the three register pages)
- [ ] `corepack yarn build` green

## Open questions

1. **Q11 — the 39 `project = 3` records.** All soft-deleted, no status, businessline 9
   which does not exist, and the only four `accept = 1` values in the table. Proposed:
   import as `ContractModule.LEGACY_2021` so they stay visible to an admin and
   invisible everywhere else. Alternative: leave them out of the import entirely.
   Needs Mati.
2. **`contract.accept` / `acceptuser` / `acceptdate`.** Four rows, all inside the
   cohort above. Carried for fidelity; no UI. Confirm nobody expects an acceptance
   feature here — it is unrelated to `AcceptanceForm` (spec 17).
3. **`Attachment.isFinal` nullable.** Making it `Boolean?` is honest about the data
   but every read site gains a null branch. Confirm the UI should show three states
   ("ostateczna" / "nie" / "—") rather than two.

## Implementation notes (2026-09-24)

Built as specified, with the decisions below. Verified on a synthetic dump and a
fixture database; the real-data queries above still need a run against `cru2026`
once `cru.sql` is at hand — the dump is not in the repository.

- **Migration** `prisma/migrations/20260924100000_data_model_gaps` is hand-written:
  Prisma's generated diff would have dropped and re-added the renamed columns
  (`Opinion.signedAt`, the contractor author ids). It renames instead, derives
  `module` from `status.kind` (status-less rows fall back to the old boolean), nulls
  contractor author ids that resolve to no user, and switches the three cascades to
  `Restrict`. `prisma migrate diff` against the schema is empty.
- **Restore pass** in `scripts/legacy/import.ts`. `createMany({skipDuplicates})`
  never touches existing rows, so re-running the import on today's database would
  not fill the new columns. The pass fills `module` on status-less records,
  `opinionsRequestedById` where the round is still open, `legacyCruId` and
  `addedAtEstimated` — only where empty, never over an application write. A second
  run reports zero changes. No database reset, so 21234/21235 survive.
- **Q11:** imported as `ContractModule.LEGACY_2021`, as proposed.
- **`Attachment.isFinal` stays `Boolean`.** Spec 18 (Q29) and the README later
  settled on "leave it": no legacy row is an explicit 0, so null → false loses
  nothing. `addedAtEstimated` is added as specified.
- **Writes.** `opinionsRequestedById` moves only when the reviewer list changes:
  naming the first reviewer opens the round with the actor as coordinator, removing
  the last closes it. An unrelated edit leaves it alone. History writes raw user ids
  to `giveopinions` (`0` → `50463`), as legacy does.
- **Display.** Opinion state now reads `respondedAt` ("Zaopiniowano {date}" /
  "Oczekuje"), the rule from spec 16. `signed` is 0 everywhere and is no longer read.
- **Shared helper.** `lib/contracts/modules.ts` holds `MODULE_PATH`, `modulePath()` and
  `registerOf()` (spec 05's file, created here to carry the rename).

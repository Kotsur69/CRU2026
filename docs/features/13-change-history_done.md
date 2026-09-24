---
id: 13
title: Historia zmian (change log)
group: C-missing-subsystems
status: done
depends-on: [01]
legacy-tables: [contracthistory]
prisma-models: [ContractHistory]
routes: ["/umowy/[id]/historia", "/projekty/[id]/historia", "/ryzyko/[id]/historia"]
---

# 13 — Historia zmian (change log)

## Why

`ContractHistory` is the largest table in the database — 237,405 rows, one per
changed field, going back to January 2015. The application writes to it on every save
(`features/kontrakty/actions.ts:235`) and on every soft delete (`:447`), and **nothing
ever reads it**. The only reference anywhere in the UI is a count on a user's detail
page (`app/(app)/dostepy/[id]/page.tsx:166`).

For a contract register in a legal department this is the highest-value thing we are
not showing. "Who changed the end date, and when?" is a question that gets asked, and
right now the answer exists and is unreachable. It is also the cheapest of the missing
subsystems: the data is complete, the writes are correct, only a read path is missing.

## Legacy behaviour

Legacy keeps one row per changed column: `contracthistory(contract_id, column_name,
oldvalue, newvalue, user_id, created_on)`. `plan.md` (Faza 3) records that legacy
maintains this log and that we must keep doing so.

The audit never reached a history screen — `audyt_legacy_strony.md` documents the
contract preview in full (34 fields) and does not mention a change log, so
**we do not know what legacy's history UI looked like, or whether it had one**.
`[UNKNOWN]`. The table may have been written for audit purposes and surfaced only in
the inaccessible Raporty module. The design below is therefore ours; it reproduces the
data faithfully and does not claim to reproduce a screen.

### Which fields are audited

Every distinct `columnName`, with live counts. This list *is* the effective edit-form
field set as far as legacy was concerned:

| Legacy column | Rows | Our field |
|---|---|---|
| `status_id` | 24,549 | `statusId` |
| `description` | 13,760 | `description` ("Przedmiot umowy") |
| `delivery_id` | 13,670 | `deliveryMethodId` |
| `date_end` | 12,377 | `dateEnd` |
| `date_begin` | 11,840 | `dateBegin` |
| `notice_period_id` | 11,814 | `noticePeriodId` |
| `contractor_id` | 11,257 | `contractorId` |
| `temp_form` | 10,948 | `tempForm` |
| `contract_nature_id` | 10,931 | `natureId` |
| `domain_id` | 10,356 | `domainId` |
| `location_id` | 10,114 | `primaryLocationId` |
| `type_id` | 10,078 | `documentTypeId` |
| `debtor_id` | 9,699 | `debtorId` |
| `currency_id` | 9,686 | `currencyId` |
| `trade_id` | 9,570 | `tradeId` |
| `companies_connected` | 9,455 | `companiesConnected` |
| `giveopinions` | 8,192 | `opinionsRequestedById` (spec 01) |
| `salary` | 8,092 | `salary` |
| `company_id` | 6,941 | `companyId` |
| `buissnesline_id` | 6,859 | `businesslineId` |
| `contract_reference` | 6,360 | `contractReference` ("Numer umowy") |
| `date_payment` | 2,589 | `paymentTerm` |
| `remarks` | 2,545 | `remarks` ("Uwagi") |
| `specific_salary_terms` | 2,388 | `specificSalaryTerms` |
| `date_send` | 2,372 | `sentOn` |
| `bill` | 472 | `bill` |
| `OBSC` | 176 | `obsc` |
| `descOBSC` | 129 | `obscDescription` |
| `insurance_guarantee` | 76 | `insuranceGuarantee` |
| `identifier` | 71 | `identifier` |
| `project` | 37 | `module` (spec 01) |
| `deleted` | 2 | `isDeleted` — **written by us, not by legacy** |

**Never audited by legacy:** `parent_id`, `edittable`, `accept`/`acceptuser`/`acceptdate`,
`sps_id`/`sps_last_version`. Re-parenting an annex, freezing a record and the 2021
acceptance experiment leave no trace. Our `deleted` rows (2) are the only entries our
own application has contributed so far — both from the smoke tests on records 21234
and 21235.

`giveopinions` at 8,192 changes confirms the opinion round is re-assigned in practice
and is not a write-once flag (see spec 01).

### Metadata, verified against the live table

| Property | Value |
|---|---|
| Rows | 237,405 |
| Date range | 2015-01-13 → 2026-09-18 |
| Rows with `userId IS NULL` | **0** |
| Rows with `contractId IS NULL` | **5,212** |
| `oldValue` at 50 characters | 3,012 |
| `newValue` at 50 characters | 9,798 |

Two of these correct assumptions worth stating explicitly:

- **There are no system-authored history rows.** Every row has a user. The daily
  auto-close procedure (`SetEndContract`, `cru.sql:430540`) does a bare `UPDATE
  contract SET status_id = 3` and writes no history at all — so the single most
  common status transition in the system is invisible in the log. That is a legacy
  gap, not a null-user rendering problem. Spec 19 fixes it going forward.
- **5,212 rows are orphaned.** `ContractHistory.contract` is `onDelete: SetNull`,
  matching legacy's `FK_contracthistory_contract`. These are entries whose contract
  was hard-deleted in legacy at some point. They can never be shown on a record page
  and are only reachable from a global view.

## Legacy quirks

### Quirk: imported values are truncated at 50 characters

- **Legacy:** `contracthistory.oldvalue` and `newvalue` are `varchar(50)`.
- **Why it matters:** 3,012 old values and 9,798 new values sit at exactly the limit,
  overwhelmingly on `description` ("Przedmiot umowy"), the second-most-audited field.
  The log is **not** a reliable source for restoring a previous value, and must never
  be presented as one.
- **We do:** our columns are unbounded `String?`, so new entries are complete. Render
  a truncated value with an explicit marker (an ellipsis plus a tooltip saying the
  legacy log stored only the first 50 characters), and never offer a "restore" action
  on a legacy row.
- **Sign-off:** not needed, but the UI copy matters.

### Quirk: values are stored as raw ids

- **Legacy:** for the 16 dictionary columns, `oldvalue`/`newvalue` hold the numeric
  id, not the label. `status_id: "2" → "3"` tells the reader nothing.
- **We do:** resolve ids to labels at render time, per column. `lib/contracts/history.ts`
  already has the mapping in the other direction — `buildSnapshot(values, dicts)` maps
  form values to legacy snake_case column names — so the column-to-dictionary table
  exists and only needs inverting.
- **Important:** resolve against the **full** dictionary including inactive rows, or
  a history entry referencing retired type 4 (`Kontrakt`) or type 7 (`Przetarg`)
  renders as a bare number. `loadFormDictionaries` already supports this through its
  `keep()` parameter (`lib/contracts/dictionaries.ts:87`), and
  `features/kontrakty/actions.ts` already feeds it both the before and after state
  for exactly this reason.
- **Sign-off:** not needed.

### Quirk: dates and booleans are stored in legacy formats

- `date_*` columns carry `0000-00-00` sentinels in older rows (22,384 occurrences
  across the dump). Render those as "—", not as a date.
- `temp_form` is tri-state `-1/0/1` in the DDL, though no `-1` exists in the data.
- Booleans are `0`/`1` strings; render as "Tak"/"Nie" using `lib/format.ts:44` `yesNo`.

## UI

### Routes

| Route | File | Kind |
|---|---|---|
| `/umowy/[id]/historia` | `features/kontrakty/record-action-page.tsx` (new branch) | detail |
| `/projekty/[id]/historia` | same | detail |
| `/ryzyko/[id]/historia` | same | detail |

`record-action-page.tsx:12` already dispatches five actions
(`edycja | aneks | projekt-aneksu | formularz-akceptacji | pytanie`) and `notFound()`s
on anything else (`:29`). `historia` is a sixth branch — no new route files needed,
which is why this feature is cheap.

### Screen: Historia zmian

Header: the record's identifier and "Historia zmian", with a back link to the detail
page. Reuse the shell that `question-page.tsx` and `acceptance-form-page.tsx` use.

Body: a reverse-chronological list grouped by **save**, not by row. A single edit
writes one row per changed field; showing 12 separate lines for one save is noise.
Group by `(userId, createdAt)` — legacy writes every row of a save with the same
timestamp.

Each group renders as:

```
2026-07-16 10:16:06 · mgolosz                     ← formatDateTime, userLabel
  Status                Obowiązująca → Zakończona
  Data zakończenia      2026-01-09 → 2026-06-30
  Przedmiot umowy       "Dostawa…" → "Dostawa…"   ← both truncated, marked
```

- Field labels are the Polish form labels, not column names.
- Values resolved to labels; "—" for null, empty and `0000-00-00`.
- A legacy-truncated value gets a marker and a tooltip.
- Long text values collapse to one line with an expander.

Filters, as a `FilterBar` (`components/ui/filter-bar.tsx`): field (select, populated
from the columns actually present on this record), user (select), date from, date to.

Empty state: "Brak zapisanej historii zmian." — real for records that have never been
edited.

Pagination: `Pagination` (`components/ui/pagination.tsx`), default 50 groups. The
busiest record needs checking; most have tens of entries, but the log is deep enough
that an unpaginated page is not safe.

### Where it is linked from

- A "Historia zmian" button in the detail page action bar
  (`features/kontrakty/contract-actions.tsx`), next to Edycja.
- The audit footer on the detail page ("Data modyfikacji" / "Modyfikowano przez")
  becomes a link to the same screen.

## Implementation

### Files

| Path | Action | Note |
|---|---|---|
| `features/kontrakty/history-page.tsx` | create | Server component, the screen |
| `features/kontrakty/record-action-page.tsx` | modify | Add the `historia` branch |
| `features/kontrakty/contract-actions.tsx` | modify | Add the button |
| `lib/contracts/history.ts` | modify | Add label resolution — the inverse of `buildSnapshot` |
| `features/kontrakty/contract-preview.tsx` | modify | Link the audit footer |

### Reuse

- `lib/contracts/history.ts` — `HistoryRow`, `buildSnapshot`, `diffSnapshots`
- `lib/contracts/dictionaries.ts` — `loadFormDictionaries(kind, ...current)`, with the
  record's own values passed so retired entries still resolve
- `lib/format.ts` — `formatDateTime`, `formatDate`, `yesNo`, `userLabel`, `formatMoney`
- `components/ui/filter-bar.tsx`, `components/ui/pagination.tsx`, `components/ui/section.tsx` (spec 05)
- `lib/authz.ts` — `canReadContract` (spec 03). History is as sensitive as the record.

### No writes

This feature adds no server action. The write path already exists and is correct.

## Verification

```sql
-- 1. Column census. Regenerate and diff against the table in this spec.
select "columnName", count(*) from "ContractHistory" group by 1 order by 2 desc;
-- expected: 32 rows, status_id 24549 at the top, deleted 2 at the bottom

-- 2. Metadata assumptions.
select count(*) filter (where "userId" is null)      as no_user,
       count(*) filter (where "contractId" is null)  as orphaned,
       min("createdAt")::date, max("createdAt")::date,
       count(*) filter (where length("oldValue") >= 50) as old_truncated,
       count(*) filter (where length("newValue") >= 50) as new_truncated
from "ContractHistory";
-- expected: 0 | 5212 | 2015-01-13 | <today> | 3012 | 9798

-- 3. Grouping by save must produce sane group sizes.
select cnt, count(*) from (
  select "contractId", "userId", "createdAt", count(*) cnt
  from "ContractHistory" where "contractId" is not null
  group by 1,2,3
) g group by 1 order by 1;
-- sanity: the distribution should peak at small numbers; a group of 30+ means one
-- save changed 30 fields, which is possible but worth eyeballing

-- 4. The deepest record — use it as the pagination test case.
select "contractId", count(*) from "ContractHistory"
where "contractId" is not null group by 1 order by 2 desc limit 5;

-- 5. Every dictionary id in the log must resolve.
select h."columnName", h."newValue" from "ContractHistory" h
where h."columnName" = 'type_id'
  and h."newValue" ~ '^[0-9]+$'
  and not exists (select 1 from "DocumentType" d where d.id = h."newValue"::int)
limit 20;
-- expected: empty, or a short list of ids deleted from the dictionary (types 9/10/11
-- were removed in legacy — those must render as "#<id> (usunięty)" rather than blank)
```

Manual checks:

- [ ] Open the history of the record from query 4 — groups render, pagination works
- [ ] A dictionary change shows labels on both sides, not ids
- [ ] A change to a now-retired document type (`Kontrakt`, `Przetarg`) still shows the
      label
- [ ] A `description` change imported from legacy shows the truncation marker
- [ ] A record never edited shows the empty state, not an error
- [ ] Edit a record in the app, then open its history — the new entry appears with the
      correct user and complete, untruncated values
- [ ] Filter by field and by user; both narrow correctly
- [ ] A user who cannot read the record cannot read its history either
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Did legacy have a history screen at all?** The audit never reached one. If it
   did, its layout is unknown and ours is an invention — acceptable, but worth one
   question to a legacy user so we do not miss an expected feature.
2. **The 5,212 orphaned rows.** Unreachable from any record page. Options: leave them
   (they cost nothing), or surface them in an admin-only global history view. Recommend
   leaving them and revisiting with spec 24.
3. **Should history be exportable?** The legal department may want a change log for a
   single contract as a PDF or Excel attachment to a case file. Cheap once spec 28
   exists; not building it speculatively.
4. **Retention.** 237,405 rows and growing. No retention policy exists and legacy had
   none. Nothing to do now, but spec 32 should note it for backup sizing.

## Implementation notes (2026-09-24)

- **Screen:** `features/kontrakty/history-page.tsx` is the sixth branch of
  `record-action-page.tsx`, so `/umowy|projekty|ryzyko/[id]/historia` needed no new
  route files. It inherits the module guard: a record under the wrong register is a
  404.
- **Grouping:** by (author, second), in SQL (`date_trunc('second', …)`), paginated by
  group, default 50. The rows of a page come from one query over the page's time
  range and are bucketed in memory.
- **Values:** `renderHistoryValue` in `lib/contracts/history.ts`, pure, is the inverse
  of `buildSnapshot`. It reads both shapes found in the table: legacy raw ids
  resolved through the *full* dictionaries (retired entries included; unknown ids
  show `#9 (usunięty)`) and our own label-valued rows. `giveopinions` resolves to a
  person, `project` to a module name, `0000-00-00` to "—", flags to Tak/Nie
  ("nie wskazano" for −1), `salary` is formatted. Text at exactly 50 characters gets
  an ellipsis whose tooltip explains the legacy `varchar(50)`. There is no restore
  action anywhere. Long values fold behind `<details>`.
- **Filters:** field (only columns present on this record), author, date from and to.
  The empty state is "Brak zapisanej historii zmian." (or "Brak zmian spełniających
  kryteria." when filtered).
- **Links:** a "Historia zmian" button in the action bar, visible to every reader
  since it is not an edit, and the audit footer's "Data modyfikacji" /
  "Modyfikowano przez".
- **Tests:** `lib/contracts/history.test.ts` covers resolution, sentinels, the
  truncation marker, and `giveopinions` written as a raw id.
- **Read authorization** follows the record. Today every signed-in user reads every
  record; `canReadContract` belongs to spec 03, which is blocked on Q18.
- **Open questions** were taken at their recommendations: orphaned rows stay
  unsurfaced (no global view), and history is not exportable.

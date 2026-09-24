---
id: 06
title: Rejestr Umowy
group: B-registers
status: done
depends-on: [03, 05]
legacy-tables: [contract, contract_status, contract_type, contract_company, buissnesline, location, domain, contract_nature, contractor, contract_users]
prisma-models: [Contract, ContractStatus, DocumentType, Company, Businessline, Location, Domain, ContractNature, Contractor, ContractUser]
routes: ["/umowy"]
---

# 06 — Rejestr Umowy

## Why

Umowy is the module the whole system is named after — *Centralny Rejestr Umów* — and
the only one the auditor could observe end to end. It is also the best-documented
screen we have: `audyt §1.1`–`§1.7` record its routing, its fifteen filters, its
twelve columns, its page sizes and its dictionaries, all from the live system.

The register works today. This spec exists for three reasons. The audit's
observations have never been checked against what we built, and doing so turns up
divergences nobody logged. **31 project records are currently listed in the contract
register.** And the page predates every shared helper in the codebase, so spec 05
rewrites it — which is the moment to get the behaviour right rather than port the
drift forward.

## Legacy behaviour

### Routing

`audyt §1.1`:

| URL | Function |
|---|---|
| `/contract` | The list plus the search form (jTable, titled "CRU List") |
| `/contract/preview/{id}` | Read-only detail, opened as a 1000×600 popup by `openPreview2` |
| `/contract/acceptform/{id}` | Formularz akceptacji umowy (spec 17) |
| `/contract/attachments/{aid}` | Fetch an attachment (spec 18) |
| `/files/show/{id}/` | Attachments iframe |
| `/remarks/index/{id}` | Notes iframe (spec 14) |
| `/files/sendattachment/{aid}` | ⚠️ mail — **excluded** |

The add and edit endpoints are `[NIEZNANE]`. The audit notes that the row's pencil
icon, labelled "Edit Record" by jTable, actually calls `openPreview2` and opens the
**preview** — so from the auditor's account there was no route to an editable form
at all.

### The fifteen filters

`audyt §1.2`, with the legacy form field names exactly as observed:

| Label | Field | Control |
|---|---|---|
| Identyfikator | `identifier` | text |
| Typ dokumentu | `type` | select |
| Numer umowy | `contract_reference` | text |
| **buissnesline** | `buissnesline_id` | select |
| Status | `status_id` | select |
| Spółka | `company_id` | select |
| Lokalizacja | `location_id` | select |
| Kontrahenci | `contractor` | autocomplete, thousands of rows |
| Właściciel umowy | `owner` | select, "Nazwisko Imię", suffix `[na]` for inactive |
| Rodzaj umowy | `domain_id` | select |
| Charakter umowy | `contract_nature_id` | select |
| Data zakończenia | `date_end` | date |
| NIP | `nip` | text |
| **Podmiot powiązane** | `company_connected` | checkbox |
| **tylko OBSSC** | `obsc` | checkbox |

Submit button: **"szukaj"**.

Note the label case: legacy renders the businessline filter as lowercase
**`buissnesline`**, and the OBSC checkbox as **"tylko OBSSC"** with a doubled S,
while the *column* header is "OBSC" with one. Both spellings are legacy's and both
are preserved (see `README.md`).

### The twelve columns

`audyt §1.3`, in order:

> Identyfikator · Typ dokumentu · Numer umowy · Status · Spółka · Lokalizacja ·
> Przedmiot umowy · Wynagrodzenie · OBSC · Właściciel umowy · **Buissnesline** ·
> Kontrahenci

plus two icon cells: a pencil (opens the preview) and a paperclip
(`/cru/media/img/attachment.png`) indicating that the record has attachments.

Here the header is capitalised **"Buissnesline"** — different from the filter's
lowercase spelling, same misspelling.

### Pagination

`audyt §1.3`: `<< < 1 > >>`, a **"Idź do strony"** box, a **"Liczba rekordów"**
selector offering **10 / 15 / 25 / 50 / 100 / 250 / 500** with a default of **15**,
and the counter **"Wyświetlanie od X do Y z Z rekordów"**.

### Sorting

`[UNKNOWN]`. jTable supports sortable headers and the audit does not say whether
they were enabled, what the default order was, or whether it persisted. Our
implementation sorts newest first (`umowy/page.tsx:184`), which is the sane default
for a register, but it is ours and not observed.

## Data

### Scope

A contract, a project and a risk record are all rows in `contract`, told apart by
the `kind` of their status (spec 01). The Umowy register's current predicate
(`umowy/page.tsx:32-36`) is:

```ts
{ isDeleted: false },
{ OR: [{ status: { kind: "CONTRACT" } }, { statusId: null }] }
```

which yields:

| | Records |
|---|---|
| Status of kind CONTRACT | 10,704 |
| **No status at all** | **31** |
| **Total shown** | **10,735** |

### Column fill rates, within that scope

| Column | Filled | Of 10,735 |
|---|---|---|
| `identifier` | 10,735 | 100% |
| `salary` | 10,735 | 100% — never null, `0.00` is the default |
| `currencyId` | 10,735 | 100% |
| `contractorId` | 10,735 | 100% |
| `documentTypeId` | 10,704 | the 31 status-less rows lack it too |
| `statusId` | 10,704 | |
| `companyId` | 10,704 | |
| `primaryLocationId` | 10,704 | |
| `domainId` | 10,704 | |
| `natureId` | 10,704 | |
| `noticePeriodId` | 10,704 | |
| `description` | 10,698 | 37 records have no subject |
| `dateEnd` | 10,569 | 166 open-ended |
| `deliveryMethodId` | 10,120 | |
| `businesslineId` | **8,731** | **2,004 have none** |
| `contractReference` | **6,579** | **61% — the "Numer umowy" column is mostly empty** |
| `obsc = true` | **282** | |
| `companiesConnected = true` | **410** | |

Two of these change how the screen should look. **"Numer umowy" is empty on 39% of
rows**, so it earns its place as a column only because it is a search key.
And **`obsc` and `companiesConnected` are set on 3% and 4% of records** — they are
filters worth having and columns barely worth the width, which is presumably why
legacy shows OBSC and not "Podmiot powiązane".

### Owners

The "Właściciel umowy" column can hold several people, and usually does:

| Owners on a record | Records |
|---|---|
| **0** | **39** |
| 1 | 1,412 |
| 2 | **7,801** |
| 3 | 1,082 |
| 4 | 257 |
| 5 | 47 |
| 6 | 64 |
| 7+ | 33 |

Two is the norm. The column must render a list, not a name, and 39 records have
nobody at all — relevant to spec 03's Q18 and to Q7 (auto-assigning the creator).

## Legacy quirks

### Quirk: 31 project records are listed in the contract register

- **Current:** the `statusId IS NULL` branch of the scope predicate
  (`umowy/page.tsx:35`) was added so that records with no status would not vanish
  entirely. It works — but **all 31 of them have `isProject = true`.**
- **Evidence:** ids 13522–17486, registered between 2021-09-08 and 2023-09-05, 31 of
  31 flagged as projects.
- **Why it is wrong:** they are projects that lost their status, and they are being
  counted and displayed as contracts. Every count on the screen is 31 too high, and
  a user filtering the contract register finds records that belong to Projekty.
- **We do:** after spec 01 restores `contract.project` as a four-value enum, route
  on `module` rather than on the status's kind, so a record with no status still
  lands in the right register. Until then, exclude `isProject = true` from the
  null-status branch:

  ```ts
  { OR: [{ status: { kind: "CONTRACT" } },
         { AND: [{ statusId: null }, { isProject: false }] }] }
  ```

  which drops the Umowy count from 10,735 to **10,704** and surfaces the 31 under
  Projekty, where spec 07 shows them with an explicit "brak statusu" badge.
- **Sign-off:** not needed — the records are not being changed, only listed in the
  right place.
- **Blocks:** the clean version needs spec 01; the interim fix is one line.

### Quirk: the 25-column chooser claims a legacy provenance it does not have

- **Current:** `lib/umowy-columns.ts:1` states *"Rejestr kolumn listy Umów — 1:1 z
  panelem wyboru kolumn legacy (prawy klik na siatce)"* and defines 25 columns.
- **What the sources say:** the audit lists **twelve** columns plus two icons
  (`§1.3`) and never mentions a right-click panel, a column chooser, or any of the
  other thirteen. Neither does `plan.md` or `status_projektu.md`. Ten of the extra
  thirteen (`companyConnected`, `nature`, `dateStart`, `dateEnd`, `noticePeriod`,
  `currency`, `otherAmountDesc`, `domain`, `formularz`, `remarks`) map one-to-one
  onto **preview** fields from `audyt §1.4`, not list columns — which is a strong
  hint about where the list came from.
- **Why it matters:** the comment asserts fidelity to a legacy screen and nothing
  supports it. Anyone reading that file will defend those defaults as legacy
  behaviour when they are ours.
- **We do:** keep the chooser — it is genuinely useful and users will not thank us
  for removing it — and **fix the comment** to say what it is: our feature, seeded
  from the audit's twelve columns plus the preview's fields. Mark the twelve audited
  ones in the definition so the legacy set stays identifiable. If somebody later
  confirms a real legacy panel, the comment becomes true and the defaults can be
  checked against it.
- **Sign-off:** not needed. Nothing user-visible changes; a false claim in a comment
  is corrected.

### Quirk: the default page size is 25, legacy's is 15

- **Legacy:** `audyt §1.3` — default **15**, options 10/15/25/50/100/250/500.
- **Current:** `DEFAULT_PAGE_SIZE = 25` (`umowy/page.tsx:16`).
- **We do:** keep 25. The divergence is deliberate and harmless — the option list is
  identical, the selector is in the same place, and 25 rows suit a modern screen.
  Recorded here so it is a decision rather than a drift. Every register keeps its own
  default (spec 05).
- **Sign-off:** not needed.

### Quirk: two columns are shown by default that legacy does not have

- **Current defaults include `permition` ("Uprawnienia") and `annex` ("Aneks")**,
  neither of which appears in `audyt §1.3`.
- **Why they are defensible:** "Aneks" tells you at a glance that half the register
  is annexes (spec 11), and "Uprawnienia" shows whether you may edit the row, which
  matters much more once spec 03 lands and the answer stops being "always yes".
- **We do:** keep both, on by default, and record them here as ours.
- **Sign-off:** not needed.

### Quirk: the "Aneks" column counts projects as annexes

- **Current:** `_count: { annexes: true }` (`umowy/page.tsx:178`) counts every child
  of the record, with no module filter.
- **Why it is wrong:** `parent_id` is overloaded. On a contract it means "is an annex
  of"; on a **project** it means "became". Spec 07 establishes the numbers: of the
  10,019 children of contract-kind records, **6,981 are projects and only 3,038 are
  real annexes**. A contract with two annexes and five projects shows 7.
- **We do:** filter the count by module —
  `_count: { annexes: { where: moduleWhere("CONTRACT") } }` — and show the projects
  separately, which is what legacy does with the preview's "Project" field
  (`audyt §1.4`).
- **Sign-off:** not needed. It is a miscount.
- **See:** spec 07 §"The consequence", and spec 11 for the annex relation itself.

### Quirk: the businessline column shows the long name, the identifier uses the short one

- **Data:** `Businessline` carries `name` ("DYSTRYBUCJA", "SSC") and `shortName`
  ("DYS", "SSC"). The list renders `businessline?.name`
  (`umowy/page.tsx:203`), matching `audyt §1.4`, which shows "DYSTRYBUCJA / SSC".
- **Why it is worth stating:** spec 02 documents a latent bug where
  `lib/contracts/identifier.ts:110` uses `name` where it must use `shortName`. The
  register's use of `name` is **correct** and must not be "fixed" while chasing that
  one.
- **We do:** nothing. Documented to prevent a wrong fix.
- **Sign-off:** not needed.

### Quirk: the column header spelling was corrected and should not have been

- **Legacy:** column header **"Buissnesline"**, filter label lowercase
  **"buissnesline"** (`audyt §1.2`, `§1.3`).
- **Current:** `lib/umowy-columns.ts:57` reads `label: "Businessline"` — spelled
  correctly, which is the one thing `README.md` says not to do. The filter form does
  preserve the legacy spelling.
- **We do:** restore **"Buissnesline"** on the column. The legal department has read
  that header every working day for eleven years; a silent correction makes the
  column look like a different one.
- **Sign-off:** not needed — it restores legacy.

### Quirk: "Data zakończenia" filters as an upper bound

- **Current:** `dateEnd: { lte: value }` (`umowy/page.tsx:84`) — "expires on or
  before this date".
- **Legacy:** `[UNKNOWN]`. A single date input could equally mean "on exactly this
  date" or "from this date onwards". The audit records the field, not its semantics.
- **We do:** keep `lte`, because "which contracts end before X" is the question a
  legal register gets asked, and label the input **"Data zakończenia do"** so the
  behaviour is stated rather than guessed. Note the 166 records with no `dateEnd`
  are excluded by any value — correct, but worth knowing.
- **Sign-off:** not needed. Flagged as Q34.

### Quirk: 2,004 contracts have no businessline

- **Data:** `businesslineId` filled on 8,731 of 10,735.
- **Why it matters:** the "Buissnesline" filter silently excludes 19% of the register
  whenever it is used, and the identifier generator (spec 02) needs a businessline to
  build a prefix — which is why those 2,004 have identifiers in the older
  `YYYY/NNNN` shapes.
- **We do:** nothing to the data. The column renders "—" and the filter gains no
  "(brak)" option unless asked for, matching legacy.
- **Sign-off:** not needed.

## UI

### Layout

Follows the register-page recipe in spec 05 §"The register-page recipe", with
`app/(app)/ryzyko/page.tsx` as the reference. `umowy/page.tsx` is explicitly **not**
the model to copy — it is what the recipe replaces.

Header: `<h1>Umowy</h1>`, **"Znaleziono: N"**, and the
**"Dodaj nowy wpis"** link (`buttonClass("primary")`) → `/umowy/nowy`.

### Filters

All fifteen legacy filters, migrated from `features/umowy/search-form.tsx` onto the
shared `FilterBar` (spec 05). Labels verbatim, including `buissnesline` lowercase and
`tylko OBSSC`. Submit reads **"szukaj"** — legacy's word, and shorter than "Filtruj".

Two filters need `FilterBar` extensions, both listed in spec 05: a date input
(`dateEnd`) and checkbox fields (`obsc`, `companyConnected`).

The contractor filter stays an autocomplete — 3,580 counterparties is too many for a
`<select>` — and the owner filter keeps the legacy `[na]` inactive suffix, which
`loadOwnerOptions()` already produces.

### Columns

25 in the chooser, 15 visible by default, `identifier` locked. Order and defaults as
in `lib/umowy-columns.ts`, with two edits: the `businessline` label becomes
**"Buissnesline"**, and the twelve audit-confirmed columns are marked in the
definition.

The chooser persists to `localStorage` under `cru2026:umowy:columns` and opens on
both the "Kolumny" button and right-click. Per spec 05 it becomes a client island
inside a server-rendered table.

### Rows

Whole-row click through `ClickableRow` to `/umowy/{id}`. Attachment count rendered as
the paperclip, as legacy does. Status as a `Badge` via `statusTone()`.
`endUrgency()` colours "Data zakończenia" when it is shown (spec 19).

### Pagination

`components/ui/pagination.tsx`, page sizes 10/15/25/50/100/250/500, default 25.
Legacy's **"Idź do strony"** box is worth keeping — on 10,735 records at 25 a page
that is 430 pages, and a prev/next pair is not navigation.

### Empty state

Two lines: **"Brak umów spełniających kryteria."** / **"Zmień lub wyczyść filtry."**

## Implementation

### Files

| Path | Action | Note |
|---|---|---|
| `app/(app)/umowy/page.tsx` | rewrite | To the spec 05 recipe; `intParam` from `lib/utils`, shared `Pagination`, `FilterBar` |
| `features/umowy/search-form.tsx` | delete | Replaced by `FilterBar` |
| `lib/umowy-columns.ts` | modify | Fix the provenance comment, `Buissnesline` label, mark the audited twelve |
| `components/umowy/contracts-table.tsx` | modify | Server component + client chooser island (spec 05) |
| `lib/contracts/scope.ts` | create | `umowyWhere()`, `projektyWhere()`, `ryzykoWhere()` — one home for the three module predicates |

### The scope helper

The three registers each hand-roll their module predicate today, and the Umowy one
is wrong. One function, used by all three and by the detail-page guard from spec 05:

```ts
/** Which register a record belongs to. Derived from the status's kind, and — after
 *  spec 01 — from `Contract.module`, which survives a record losing its status.
 *  See docs/features/06 for the 31 status-less projects this exists to catch. */
export function moduleWhere(module: ContractModule): Prisma.ContractWhereInput;
```

### Order of work

1. The one-line scope fix — 31 records move to the right register immediately.
2. The `lib/umowy-columns.ts` comment and label.
3. The spec 05 rewrite, which is where the real work is.
4. Spec 03's `contractScopeWhere(actor)` slots into `buildWhere` as one more `AND`.

## Verification

```sql
-- 1. The current scope, and the bug in it.
select count(*) filter (where s.kind = 'CONTRACT')                      kind_contract,
       count(*) filter (where c."statusId" is null)                     status_null,
       count(*) filter (where c."statusId" is null and c."isProject")   null_and_project,
       count(*)                                                         shown_today
from "Contract" c left join "ContractStatus" s on s.id = c."statusId"
where not c."isDeleted" and (s.kind = 'CONTRACT' or c."statusId" is null);
-- expected: 10704 | 31 | 31 | 10735
-- after the fix: the register shows 10704

-- 2. What the 31 are.
select count(*), min(id), max(id), min("registeredAt")::date, max("registeredAt")::date
from "Contract" where not "isDeleted" and "statusId" is null;
-- expected: 31 | 13522 | 17486 | 2021-09-08 | 2023-09-05

-- 3. Column fill rates — drives which columns are on by default.
select count(*) total, count("contractReference") numer_umowy,
       count("businesslineId") bl, count(description) przedmiot, count("dateEnd") date_end,
       count(*) filter (where obsc) obsc, count(*) filter (where "companiesConnected") powiazane
from "Contract" c left join "ContractStatus" s on s.id = c."statusId"
where not c."isDeleted" and s.kind = 'CONTRACT';
-- expected: 10704 | 6579 | 8731 (approx, minus the 31) | ~10698 | ~10569 | 282 | 410

-- 4. Owners per record — the column must render a list.
select n, count(*) from (
  select c.id, count(ua."userId") n
  from "Contract" c
  left join "ContractStatus" s on s.id = c."statusId"
  left join "ContractUser" ua on ua."contractId" = c.id
  where not c."isDeleted" and (s.kind = 'CONTRACT' or c."statusId" is null)
  group by 1) q group by 1 order by 1;
-- expected: 0→39, 1→1412, 2→7801, 3→1082, 4→257, 5→47, 6→64, 7→26, …

-- 5. Every filter dictionary is non-empty and active-only.
select 'documentType' t, count(*) from "DocumentType" where active
union all select 'status',       count(*) from "ContractStatus" where active and kind='CONTRACT'
union all select 'company',      count(*) from "Company" where active
union all select 'location',     count(*) from "Location" where active
union all select 'domain',       count(*) from "Domain" where active and kind='GENERAL'
union all select 'nature',       count(*) from "ContractNature" where active
union all select 'businessline', count(*) from "Businessline" where active;
-- expected: 6 | 3 | 7 | 35 | 32 | 4 | 3   (inactive entries excluded — see spec 01)
```

Manual checks:

- [ ] `/umowy` reports **10 704**, not 10 735, and none of ids 13522–17486 with a null
      status appear
- [ ] Those 31 appear under `/projekty` instead, badged "brak statusu"
- [ ] All fifteen legacy filters are present, with the labels spelled
      `buissnesline`, `tylko OBSSC`, `Podmiot powiązane`
- [ ] The submit button says **"szukaj"**
- [ ] Filtering on `obsc` returns 282; on `Podmiot powiązane`, 410
- [ ] The NIP filter matches on the counterparty's `vatId`
- [ ] The owner filter lists inactive people with the `[na]` suffix
- [ ] The contractor autocomplete searches all 3,580 counterparties
- [ ] "Data zakończenia" is labelled as an upper bound and excludes the 166 records
      with no end date
- [ ] Page-size selector offers 10/15/25/50/100/250/500, defaulting to 25
- [ ] "Idź do strony" jumps correctly at 500 rows per page
- [ ] The counter reads "Pokazano X–Y z Z"
- [ ] Every non-empty filter survives a page change
- [ ] The column header reads **"Buissnesline"**, not "Businessline"
- [ ] 25 columns in the chooser, 15 on by default, `Identyfikator` cannot be hidden
- [ ] Choices persist across a reload and the chooser opens on right-click
- [ ] A record with three owners lists all three
- [ ] A record with no owner renders "—" rather than an empty cell
- [ ] After spec 03, a scoped user sees fewer rows and the count matches the rows
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Q34 — what does the legacy "Data zakończenia" filter actually do?** We read it
   as an upper bound. It could be an exact match or a lower bound, and a legacy user
   can answer it in one try.
2. **Q35 — were the legacy list headers sortable, and what was the default order?**
   jTable supports it; the audit does not say. We sort newest first. If legacy sorted
   by identifier, users will notice immediately.
3. **Q36 — is there a real legacy column chooser?** `lib/umowy-columns.ts` claims one
   behind a right-click and no source records it. If it exists, its column set and
   defaults should replace ours; if not, the comment is corrected and we own the
   feature.
4. **Q37 — should the 31 status-less projects be given a status?** They are the only
   records in the register with none, all from a two-year window. Moving them to
   Projekty makes them visible; deciding what they *are* is a data question for the
   legal department, and relates to Q11 (the 39 orphaned 2021 records).

## Implementation notes (2026-09-24)

- Rewritten to the spec 05 recipe. The scope is `registerWhere("CONTRACT")`
  (`lib/contracts/scope.ts`), keyed on `Contract.module` from spec 01, so the 31
  status-less projects left this register.
- All fifteen legacy filters with legacy spelling (`buissnesline`, `tylko OBSSC`,
  `Podmiot powiązane`, "Data zakończenia do"), submit reads **"szukaj"**. The
  contractor filter is an autocomplete over all counterparties, deleted ones
  included (`/api/contractors?all=1`).
- **Owner names** follow legacy, "Nazwisko Imię" (`userLabel`). `[na]` marks an
  inactive account. Placeholders get no suffix: their activity is unknown, not false,
  and all 451 would otherwise read `[na]`.
- **Columns:** the provenance comment is corrected, the twelve audited columns carry
  `legacy: true`, and the header reads **"Buissnesline"**. "Aneks" counts only
  CONTRACT-module, non-deleted children. "Uprawnienia" now shows edycja / odczyt /
  zamrożony per row (`rowPermission` in `lib/authz.ts`).
- **Pagination** keeps "Pokazano X–Y z Z" and adds **"Idź do strony"**.
- **Deferred:** spec 03's actor scope — spec 03 is blocked on Q18.

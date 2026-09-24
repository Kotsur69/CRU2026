---
id: 07
title: Rejestr Projekty
group: B-registers
status: done
depends-on: [03, 05]
legacy-tables: [contract, contract_status, remarks, opinions]
prisma-models: [Contract, ContractStatus, Remark, Opinion, ContractUser]
routes: ["/projekty"]
---

# 07 — Rejestr Projekty

## Why

A project is the **pre-contract**: the process of getting to a signature. The audit
puts it plainly — *"encja przed-umowna — proces doprowadzenia do podpisania umowy
(opiniowanie → wysłanie do podpisu → obieg FAU → umowa/rezygnacja). Projekt «staje
się» umową po zakończeniu obiegu"* (`audyt §2`, line 110).

9,027 records, 45% of the register. Its list carries three columns that Umowy does
not — "Ostatnia notatka", "Opiniujący", "Wysł. do podp." — and all three report on
the opinion workflow (spec 16), which is why this register is the one place the
workflow is visible at a glance.

Two things make this spec worth writing carefully. **The auditor's account could
open `/project` but saw zero rows** (`audyt §2`), so unlike Umowy there is no
observed detail page, no observed row, no observed sort — the field list in
`§2.5` is explicitly marked `[NIEZNANE]` and assumed. And the investigation for this
spec turned up what `parent_id` means on a project, which corrects a claim carried in
`plan.md` and mis-renders a column on the Umowy list today.

## Legacy behaviour

### Routing

`audyt §2.1`: `/project` is the list (jTable, titled "Project List"). The preview and
edit endpoints are `[NIEZNANE]`. The page defines `openPreview`/`openPreview2`
pointing at `/contract/preview/...` — **shared with Umowy** — so a project's detail
screen is probably the contract preview with extra sections, which is exactly what
spec 05 builds.

### Filters

`audyt §2.2`. Text and checkbox fields: `identifier`, **`identifier2`**,
`contract_reference`, `nip`, and the "Podmiot powiązane" checkbox
(`company_connected`). Selects: `type`, `buissnesline_id`, `status_id`,
`company_id`, `location_id`, `contractor`, `owner`, `domain_id` — the same
dictionaries as Umowy apart from status.

Against Umowy's fifteen, Projekty **drops** "Data zakończenia", "Charakter umowy"
and the "tylko OBSSC" checkbox, and **adds** `identifier2`.

### Columns

`audyt §2.3`, eight of them:

> Identyfikator · Status · Właściciel umowy · Kontrahenci · Przedmiot umowy ·
> **Ostatnia notatka** · **Opiniujący** · **Wysł. do podp.**

The audit calls the last three out explicitly: *"elementy workflow, których nie ma
na liście umów"*.

### The project lifecycle

`audyt §2.4` lists all seven statuses, and the live counts confirm every one:

| id | Status | Records | Share |
|---|---|---|---|
| 4 | Projekt - w toku | 915 | 10% |
| 5 | **Projekt - zakończony** | **7,015** | **78%** |
| 6 | Projekt - anulowany | 409 | 5% |
| 7 | Projekt - wysłane do podpisu | 189 | 2% |
| 8 | Projekt - zrealizowany brak umowy | 31 | 0.3% |
| 12 | Projekt - rozpoczęto obieg FAU | 55 | 0.6% |
| 13 | Projekt - zakończono obieg FAU | 382 | 4% |

Note the ids: 4–8 were allocated together, and **12 and 13 were added later** — the
two FAU statuses are a retrofit onto an existing five-state lifecycle, which fits
spec 16's finding that the 12 → 13 transition is recorded exactly once in 237,405
audited changes.

Four fifths of the register is in one terminal state. So the default view is mostly
history, and the working set — statuses 4, 7, 12, 13 — is **1,541 records**.

## Data

### Scope

| | Records |
|---|---|
| Status of kind PROJECT | 8,996 |
| **Status-less, `isProject = true`** | **31** |
| **Total** | **9,027** |

The 31 are the records spec 06 removes from the Umowy register. They belong here,
badged, not in the contract register.

### Fill rates, over the 8,996 with a project status

| Column | Filled | Share |
|---|---|---|
| `identifier` | 8,996 | 100% |
| `documentTypeId`, `companyId`, `primaryLocationId`, `contractorId`, `domainId`, `natureId` | 8,996 | 100% |
| `description` | 8,934 | 99% |
| `dateBegin` | 8,074 | 90% |
| `dateEnd` | 8,007 | 89% |
| **`parentId`** | **7,124** | **79%** |
| `opinionsRequested` | 7,773 | 86% — and wrong, see spec 16 |
| `contractReference` | 4,286 | 48% |
| **`businesslineId`** | **3,487** | **39%** |
| **`sentOn`** | **2,005** | **22%** |

`businesslineId` is filled on 39% of projects against 81% of contracts, so the
"buissnesline" filter is much weaker here. And `sentOn` — the "Wysł. do podp."
column — is set on barely a fifth.

### What the three workflow columns actually cover

| Column | Source | Records with a value | Share |
|---|---|---|---|
| Ostatnia notatka | newest `Remark` | **8,447** | **94%** |
| Opiniujący | active `Opinion` rows | 3,868 | 43% |
| Wysł. do podp. | `sentOn` | 2,005 | 22% |

"Ostatnia notatka" is populated on almost every project — which explains why legacy
put it on the list. Projects are worked through their notes.

### Identifier shapes

| Shape | Records |
|---|---|
| `…/P0481` — the project suffix | 8,945 |
| `…/A01` — an annex suffix | 28 |
| `YYYY/NNNN` — the old bare form | 15 |
| Other | 8 |

99.4% carry the `P` marker that spec 02 parses. The 28 with an annex suffix are
projects **for** an annex — a draft amendment going through the same approval round.

### `parent_id` on a project points at the resulting contract

This is the finding that reframes the module. Of the 7,124 projects with a parent:

| The parent's module | Projects |
|---|---|
| **CONTRACT** | **7,013** |
| PROJECT | 111 |

Worked examples, taken from the newest rows:

| Project | Status | Parent | Parent status |
|---|---|---|---|
| `AMDSP/DYS/2026/P0296` | Projekt - zakończony | `AMDSP/DYS/2026/0162` | Obowiązująca |
| `AMDSP/DYS/2026/P0294` | Projekt - zakończono obieg FAU | `AMDSP/DYS/2026/0127` | Obowiązująca |
| `HK POM/2026/P0045` | Projekt - zakończony | `HK POM/2026/0017/A02` | Obowiązująca |
| `AMDSP/DYS/2026/0019/A01` | Projekt - wysłane do podpisu | `AMDSP/DYS/2026/0019` | Zakończona |

So `parent_id` is **overloaded**. On a contract it means "I am an annex of that
contract". On a project it means **"I became that contract"** — the temporal
predecessor is stored as the structural child.

This is what the audit saw from the other side: the contract preview carries a field
labelled **"Project"** described as *"relacja do projektu/-ów (może wiele)"*
(`audyt §1.4`). That field is the contract's children, filtered to the ones that are
projects.

The 111 project-parented projects are the same pattern one level down: a project for
an annex, hanging off the project for the original contract.

### The consequence: the "Aneks" column over-reports by 3.3×

`parentId` across the whole register:

| Module | Records | With a parent |
|---|---|---|
| CONTRACT | 10,704 | 3,043 |
| PROJECT | 8,996 | 7,124 |
| RISK | 406 | 0 |
| No status | 31 | 0 |

10,167 records have a parent, which is where `plan.md`'s *"Half the register is
annexes. 10,167 of 20,137 live contracts have a `parentId`"* comes from. **That
reading is wrong.** Only 3,043 of those are annexes; 7,124 are project→contract
links.

Counted from the parent's side, the 10,019 children of contract-kind records break
down as:

| Child is | Count |
|---|---|
| A **project** | **6,981** |
| A **contract** (a real annex) | **3,038** |

And of the 3,038 real annexes, 2,982 carry the `/A01` suffix — so the suffix and the
relation agree, which is the check spec 11 needs.

`app/(app)/umowy/page.tsx:178` selects `_count: { annexes: true }` with no module
filter, so the Umowy list's **"Aneks" column currently counts projects as annexes**.
On a contract with two annexes and five projects it reads 7.

## Legacy quirks

### Quirk: the "Aneks" count includes projects

- **Current:** `_count.annexes` (`umowy/page.tsx:178`) counts every child, and 6,981
  of the 10,019 children of contracts are projects.
- **Why it is wrong:** the number shown is not the number of annexes, and it is
  wrong on most rows that have any children at all.
- **We do:** filter the count by module —
  `_count: { annexes: { where: moduleWhere("CONTRACT") } }` — and surface the
  projects separately, as legacy does, under the preview's **"Project"** field.
- **Sign-off:** not needed. It is a miscount.
- **Affects:** specs 06, 09 and 11. Spec 11 owns the annex relation; this quirk is
  recorded here because this is where the evidence was found.

### Quirk: `parent_id` means two different things

- **Legacy:** one self-relation carrying "is an annex of" and "became" at once.
- **Why it matters:** any traversal must ask what module the other end is in before
  it can say what the link means, and the Prisma relation is named `annexes` /
  `parent`, which reads as one meaning only.
- **We do:** do **not** migrate the data — the relation is what legacy has and
  splitting it risks the very thing spec 01 exists to prevent. Instead, express both
  readings in code:

  ```ts
  /** Children of this record that are annexes of it (same module). */
  annexesOf(contract): Prisma.ContractWhereInput
  /** Children of this record that are the projects it came from. */
  projectsFor(contract): Prisma.ContractWhereInput
  /** For a project: the contract it became. Null while still in flight. */
  resultingContract(project): Contract | null
  ```

  and rename nothing in the schema, adding a doc comment on `parent`/`annexes`
  that states both meanings with a pointer here.
- **Sign-off:** not needed.

### Quirk: 31 projects have no status

- **Data:** ids 13522–17486, registered 2021-09-08 → 2023-09-05, all
  `isProject = true`, no `statusId`, no document type, no company.
- **Why it matters:** they are invisible in any status filter and, until spec 06's
  fix, they appear in the wrong register entirely.
- **We do:** include them here, ordered last, with a `Badge tone="warning"` reading
  **"brak statusu"**. The status filter gains no "(brak)" option — a dedicated badge
  on 31 rows out of 9,027 is enough — but they are reachable by sorting or by
  identifier search.
- **Sign-off:** not needed for listing them. What they *are* is Q37.

### Quirk: `identifier2` — an undocumented second identifier filter

- **Legacy:** `audyt §2.2` records the field and cannot explain it:
  *"drugi identyfikator (`identifier2`) [do wyjaśnienia — może zakres «od–do» albo
  id alternatywny]"*. There is **no `identifier2` column** anywhere in `cru.sql`.
- **`[INFERRED]`, and the data supports it:** a project and the contract it becomes
  have **different identifiers** — `AMDSP/DYS/2026/P0296` becomes
  `AMDSP/DYS/2026/0162`. 7,013 projects are in exactly that position. Somebody
  holding the *contract* number and looking for the project that produced it cannot
  use the `identifier` box, because that searches the project's own number. A second
  box that searches the parent's identifier solves precisely this, and nothing else
  in the schema explains a second identifier field on this register and not on Umowy.
  The range reading ("od–do") is possible but weaker: a range would normally be
  labelled as one, and Umowy — which has far more records — does not have it.
- **We do:** implement it as **"Identyfikator umowy"**, matching
  `parent.identifier`, and say so in the field's help text so the behaviour is
  visible rather than guessed. If Q13 comes back with the range answer, it is a
  small change to one filter.
- **Sign-off:** not needed. Flagged as Q13, now with a concrete hypothesis to
  confirm or deny.

### Quirk: `opinionsRequested` is true on 7,773 projects and means nothing

- Carried from spec 16: `giveopinions` is a user id flattened to a boolean, so 86%
  of projects claim an opinion round and only 43% have one.
- **We do:** the "Opiniujący" column reads the `Opinion` rows, never the flag. The
  column is already built this way (`projekty/page.tsx:148-170`), so no change is
  needed — recorded so nobody "fixes" it to use the flag.
- **Sign-off:** not needed.

### Quirk: the "Opiniujący" column ignores `active`

- **Current:** `projekty/page.tsx:149` includes the record's opinions with no
  `active` filter, so the 348 withdrawn requests (spec 16) are listed as reviewers.
- **We do:** filter `active: true`, and render answered names plain against pending
  names in `text-muted-foreground` — the column's job on a worklist is to show who is
  holding things up.
- **Sign-off:** not needed.

### Quirk: only 39% of projects carry a businessline

- **Data:** 3,487 of 8,996, against 81% on contracts.
- **Why it matters:** filtering Projekty by "buissnesline" silently hides 61% of the
  register, and this is a much bigger hole than the 19% on Umowy.
- **We do:** nothing to the data. Worth a note next to the filter, and worth knowing
  before anyone reports numbers from a businessline-filtered view.
- **Sign-off:** not needed.

## UI

### Layout

The register-page recipe from spec 05. Header `<h1>Projekty</h1>`, **"Znaleziono:
N"**, **"Dodaj nowy wpis"** → `/projekty/nowy`.

Default page size 25, options 10/15/25/50/100/250/500 — the same as every register.

### Filters

The thirteen legacy fields from `audyt §2.2`, on the shared `FilterBar`:

| Label | Param | Control |
|---|---|---|
| Identyfikator | `identifier` | text — matches the project's own number |
| **Identyfikator umowy** | `identifier2` | text — matches `parent.identifier` |
| Numer umowy | `contractNumber` | text |
| Typ dokumentu | `type` | select |
| buissnesline | `businessline` | select |
| Status | `status` | select, the seven project statuses |
| Spółka | `company` | select |
| Lokalizacja | `location` | select |
| Kontrahenci | `contractor` | autocomplete |
| Właściciel umowy | `owner` | select, `[na]` suffix |
| Rodzaj umowy | `domain` | select |
| NIP | `nip` | text |
| Podmiot powiązane | `companyConnected` | checkbox |

No "Data zakończenia", no "Charakter umowy", no "tylko OBSSC" — legacy does not have
them here.

Worth adding beyond legacy, because 78% of the register is finished and nobody works
on it: a **"tylko w toku"** checkbox restricting to statuses 4, 7, 12 and 13 — 1,541
records. Off by default, so the unfiltered view still matches legacy.

### Columns

The eight legacy columns, in legacy order:

| Column | Source | Note |
|---|---|---|
| Identyfikator | `identifier` | Locked; `Badge` "brak statusu" appended on the 31 |
| Status | `status.name` | `Badge` via `projectStatusTone()` |
| Właściciel umowy | `userAccess` → `userLabel` | A list; two is typical |
| Kontrahenci | `contractor` → `contractorLabel` | |
| Przedmiot umowy | `description` | `Truncated` |
| **Ostatnia notatka** | newest `Remark.body` | `Truncated`, with the date on hover |
| **Opiniujący** | active `Opinion` → `userLabel` | Pending names muted |
| **Wysł. do podp.** | `sentOn` | `formatDate`, "—" on 78% of rows |

Add one column beyond legacy, off by default: **"Umowa"** — the resulting contract's
identifier from `parent`, as a link. It exists on 7,013 records and is the single
most useful piece of context on a finished project. Spec 05 defers the chooser
question to this spec; the answer is yes, a chooser is worth it here, seeded with
these nine.

### Ordering

`registeredAt DESC, id DESC` — the same as Umowy. Legacy's order is `[UNKNOWN]`
(Q35). Status-less records sort with everything else by date; the badge is what
makes them findable.

### Empty state

**"Brak projektów spełniających kryteria."** / **"Zmień lub wyczyść filtry."**

## Implementation

### Files

| Path | Action | Note |
|---|---|---|
| `app/(app)/projekty/page.tsx` | rewrite | Spec 05 recipe; `moduleWhere("PROJECT")`; `identifier2` |
| `features/projekty/search-form.tsx` | delete | Replaced by `FilterBar` |
| `components/projekty/projects-table.tsx` | modify | `active` on Opiniujący, "brak statusu" badge, the "Umowa" column |
| `lib/projekty-columns.ts` | create | Nine columns, mirroring `lib/umowy-columns.ts` |
| `lib/contracts/relations.ts` | create | `annexesOf`, `projectsFor`, `resultingContract` |
| `prisma/schema.prisma` | modify | Doc comment on `parent`/`annexes` recording both meanings |

### The "Ostatnia notatka" query

The column is a per-row "newest child", which is the one thing that turns a register
into an N+1. Prisma has no lateral join, so either take the newest note per project
in a single grouped query and join in memory:

```ts
const latest = await prisma.remark.groupBy({
  by: ["contractId"],
  where: { contractId: { in: ids }, active: true },
  _max: { id: true },
});
```

then fetch those `_max.id` bodies in one `findMany` — two queries for the page,
regardless of page size. The existing implementation already does something of this
shape; keep it and do not replace it with an `include` that takes 1.

At 500 rows per page this matters: 8,447 of 8,996 projects have at least one note.

### Reuse

`FilterBar`, `Pagination`, `ClickableRow`, `Badge`, `Truncated`, `ListedNames`
(spec 05), `projectStatusTone()` (`lib/contract-status.ts`), `userLabel`,
`contractorLabel`, `formatDate`, `ASSIGNEE_SELECT`, `loadOwnerOptions`,
`contractScopeWhere` (spec 03).

## Verification

```sql
-- 1. Scope.
select count(*) filter (where s.kind = 'PROJECT')                          kind_project,
       count(*) filter (where c."statusId" is null and c."isProject")      null_project
from "Contract" c left join "ContractStatus" s on s.id = c."statusId"
where not c."isDeleted" and (s.kind = 'PROJECT' or (c."statusId" is null and c."isProject"));
-- expected: 8996 | 31   → the register shows 9027

-- 2. The seven statuses.
select s.id, s.name, count(c.id)
from "ContractStatus" s
left join "Contract" c on c."statusId" = s.id and not c."isDeleted"
where s.kind = 'PROJECT' group by 1, 2 order by 1;
-- expected: 4→915, 5→7015, 6→409, 7→189, 8→31, 12→55, 13→382

-- 3. What `parent_id` points at from a project.
select coalesce(ps.kind::text, '(brak)') parent_kind, count(*)
from "Contract" c
join "ContractStatus" s on s.id = c."statusId"
join "Contract" p on p.id = c."parentId"
left join "ContractStatus" ps on ps.id = p."statusId"
where not c."isDeleted" and s.kind = 'PROJECT'
group by 1 order by 2 desc;
-- expected: CONTRACT 7013 | PROJECT 111

-- 4. The Aneks miscount — children of contracts, by the child's module.
select coalesce(cs.kind::text, '(brak)') child_kind, count(*)
from "Contract" p
join "ContractStatus" ps on ps.id = p."statusId"
join "Contract" c on c."parentId" = p.id and not c."isDeleted"
left join "ContractStatus" cs on cs.id = c."statusId"
where not p."isDeleted" and ps.kind = 'CONTRACT'
group by 1 order by 2 desc;
-- expected: PROJECT 6981 | CONTRACT 3038   → the "Aneks" column must show 3038, not 10019

-- 5. Coverage of the three workflow columns.
select count(*) total,
  count(*) filter (where exists (select 1 from "Remark"  r where r."contractId" = c.id)) notatka,
  count(*) filter (where exists (select 1 from "Opinion" o where o."contractId" = c.id
                                   and o.active))                                        opiniujacy,
  count(c."sentOn")                                                                      wyslane
from "Contract" c join "ContractStatus" s on s.id = c."statusId"
where not c."isDeleted" and s.kind = 'PROJECT';
-- expected: 8996 | 8447 | 3868 | 2005

-- 6. The working set, for the "tylko w toku" filter.
select count(*) from "Contract"
where not "isDeleted" and "statusId" in (4, 7, 12, 13);
-- expected: 1541

-- 7. Identifier shapes.
select case when identifier ~ '/P[0-9]+$'      then 'P-suffix'
            when identifier ~ '/A[0-9]+$'      then 'A-suffix'
            when identifier ~ '^[0-9]{4}/[0-9]+$' then 'YYYY/NNNN'
            else 'inne' end shape, count(*)
from "Contract" c join "ContractStatus" s on s.id = c."statusId"
where not c."isDeleted" and s.kind = 'PROJECT' group by 1 order by 2 desc;
-- expected: 8945 | 28 | 15 | 8
```

Manual checks:

- [ ] `/projekty` reports **9 027**, including the 31 status-less records
- [ ] Each of those 31 shows a "brak statusu" badge and none of them appears in `/umowy`
- [ ] All thirteen legacy filters are present; "Data zakończenia", "Charakter umowy"
      and "tylko OBSSC" are **absent**, as in legacy
- [ ] `Identyfikator` finds `AMDSP/DYS/2026/P0296`;
      **`Identyfikator umowy`** finds the same record by `AMDSP/DYS/2026/0162`
- [ ] The status filter offers exactly the seven project statuses
- [ ] "tylko w toku" narrows to 1 541 and is off by default
- [ ] "Ostatnia notatka" is populated on ~94% of rows and truncates cleanly
- [ ] "Opiniujący" omits withdrawn requests and mutes the pending names
- [ ] "Wysł. do podp." renders "—" on the 78% with no `sentOn`
- [ ] The optional "Umowa" column links to the resulting contract on 7 013 records
- [ ] At 500 rows per page the note column issues **two** queries, not 500 —
      check the query log
- [ ] Opening a project id under `/umowy/[id]` 404s (spec 05)
- [ ] After spec 03 a scoped user sees fewer rows and the count matches
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Q13 — what does `identifier2` filter?** Now with a hypothesis: the **resulting
   contract's identifier**, on the evidence that 7,013 projects have a
   differently-numbered contract as their parent and no other field in the schema
   would need a second identifier box on this register alone. One legacy user can
   confirm or deny in a single search.
2. **Q38 — should a project show its resulting contract prominently?** 7,013 of
   9,027 have one, and it is the answer to "what happened to this project". Legacy
   shows the reverse direction on the contract preview ("Project") and nothing here.
   Proposal: an optional column, off by default, plus a prominent link on the detail
   page.
3. **Q39 — is `plan.md`'s "half the register is annexes" line worth correcting in
   place?** It is wrong: 3,043 annexes, not 10,167. `plan.md` is a strategy document
   this spec set does not replace, so the correction belongs there too rather than
   only here.
4. **Q35 carries over** — legacy's default sort and whether headers were sortable.
   With 78% of this register in one terminal status, the ordering matters more here
   than on Umowy.

## Implementation notes (2026-09-24)

- Spec 05 recipe, scope `registerWhere("PROJECT")`. The 31 status-less records show
  here with a "brak statusu" badge and sort by date with the rest.
- **`identifier2`** ("Identyfikator umowy", with a hint) matches `parent.identifier`,
  the resulting contract (Q13 hypothesis). "tylko w toku" filters statuses 4, 7, 12
  and 13. Default page size is 25.
- **"Ostatnia notatka"** takes two queries per page (`groupBy` max id, then the
  bodies), with the date on hover. The old fallback to `Contract.remarks` is gone:
  that is "Uwagi", a different field.
- **"Opiniujący"** reads active requests only; pending names are muted and answered
  ones plain (`respondedAt`).
- **Chooser** with nine columns (`lib/projekty-columns.ts`). The optional "Umowa"
  column links to the resulting contract and is off by default.
- `lib/contracts/relations.ts` holds `annexesOf`, `projectsFor`, `resultingContract`
  and `partitionRelations`. The schema documents both meanings of `parentId`.
- **Not done:** Q39's correction of `plan.md` — it was asked as a question, not
  requested.

---
id: 05
title: Shared UI consolidation
group: A-foundations
status: done
depends-on: []
legacy-tables: []
prisma-models: []
routes: ["/umowy", "/projekty", "/ryzyko", "/kontrahenci", "/dostepy", "/mailing", "/grupy", "/lokalizacje"]
---

# 05 — Shared UI consolidation

## Why

Ten register and detail screens were built in sequence, and the later ones grew the
shared components the earlier ones predate. The result is one structural fork and
six families of duplication: `app/(app)/projekty/[id]/page.tsx` is a 433-line copy of
the contract preview, three near-identical search forms exist while a shared
`FilterBar` already does the job, and `intParam` is defined three times.

Every register spec that follows (06, 07, 08, 20, 22, 24, 25) either extends these
screens or copies their pattern. Consolidating first means those specs describe one
implementation instead of three, and it removes the class of bug where a fix lands in
Umowy and silently does not land in Projekty.

No user-visible behaviour changes. This is the one spec in the set that is purely
internal.

## Legacy behaviour

Not applicable — this is a property of our codebase, not of CRU.

Two constraints from legacy do carry over and must survive the refactor:

- **Page sizes.** Legacy offers 10 / 15 / 25 / 50 / 100 / 250 / 500 with a default of
  15 (`audyt §2.1`). `components/ui/filter-bar.tsx:14` already carries that list;
  the per-register default differs and is intentional (see spec 06).
- **The counter.** "Wyświetlanie od X do Y z Z rekordów" in legacy;
  `components/ui/pagination.tsx` renders "Pokazano X–Y z Z". Keep ours, but keep it
  in exactly one place.

## Current duplication

### 1. The forked detail page

`app/(app)/projekty/[id]/page.tsx` (433 lines) against
`features/kontrakty/contract-preview.tsx`. `Section` (`:21` vs `:18`), `Field`
(`:40` vs `:37`) and `Fact` (`:50` vs `:47`) are byte-identical; the section layout
is a near-copy with project-specific blocks added ("Workflow projektu", "Obieg FAU").

Three more copies of `Section`/`Field` exist: `app/(app)/kontrahenci/[id]/page.tsx:13,23`,
`app/(app)/dostepy/[id]/page.tsx:69,80`, `app/(app)/grupy/[id]/page.tsx:19`.

### 2. Three bespoke search forms

`features/umowy/search-form.tsx`, `features/projekty/search-form.tsx`,
`features/ryzyko/search-form.tsx` each re-declare `Select`, `TextField`, `PAGE_SIZES`,
the submit handler and the clear button. `components/ui/filter-bar.tsx` already
implements all of it and is what `/kontrahenci`, `/dostepy` and `/mailing` use.

### 3. Table helpers

`Truncated` and `ListedNames` are re-declared in `components/umowy/contracts-table.tsx:68,77`,
`components/projekty/projects-table.tsx:22,27` and `components/ryzyko/risk-table.tsx:27,32`.

### 4. Param parsing

`intParam` in `lib/utils.ts:13`, `app/(app)/umowy/page.tsx:19`,
`app/(app)/projekty/page.tsx:19`. `MAX_PAGE_SIZE`/`MIN_PAGE_SIZE` twice more
(`umowy:14`, `projekty:14`). `PAGE_SIZES` four times.

### 5. Pagination footers

Inlined in `app/(app)/umowy/page.tsx:217-284` and `app/(app)/projekty/page.tsx:187-254`,
duplicating `components/ui/pagination.tsx:13-66`.

### 6. `MODULE_PATH`

`{CONTRACT:"/umowy", PROJECT:"/projekty", RISK:"/ryzyko"}` declared in both
`features/kontrakty/actions.ts:53` and `features/kontrakty/form-page.tsx:30`.

## Inconsistencies to fix while consolidating

These are behaviour bugs, not just duplication.

### Quirk: two of three detail routes do not check the record's module

- **Current:** `app/(app)/projekty/[id]/page.tsx:128` rejects a non-PROJECT record.
  `/umowy/[id]` and `/ryzyko/[id]` render `ContractPreview`, which never checks
  `status.kind` (`contract-preview.tsx:85`). So a project id opened under `/umowy`
  renders happily with the wrong back link and the wrong action buttons.
- **We do:** one guard in the shared preview, driven by the module the route belongs
  to. Out-of-module ids render `notFound()`, matching what spec 03 does for
  out-of-scope ids.
- **Sign-off:** not needed.

### Quirk: risk records get the contract status palette

- **Current:** `contract-preview.tsx:163` always calls `statusTone()`.
  `riskStatusTone()` exists (`lib/contract-status.ts:24`) and is used only by the
  risk *table*, so the same status is coloured differently in the list and on the
  detail page.
- **We do:** select the palette from the module.
- **Sign-off:** not needed.

### Quirk: the catch-all swallows unmatched deep paths

- **Current:** `app/(app)/[...slug]/page.tsx:6` is intended for the one unbuilt
  module (`/supply-chain`, `lib/nav.ts:22`), but it also catches `/umowy/1/2/3`,
  `/lokalizacje/5` and `/raporty/x`, rendering "Moduł w budowie" instead of a 404.
- **We do:** narrow it to known unbuilt module roots and let everything else 404.
- **Sign-off:** not needed.

### Quirk: the contracts table is a client component for one feature

- **Current:** `components/umowy/contracts-table.tsx` is `"use client"` solely for
  the column chooser, which pulls `formatDate`, `formatMoney` and `endUrgency` into
  the client bundle with it.
- **We do:** keep the table a server component and make only the chooser a client
  island. Worth doing here because specs 06–08 all touch this file.
- **Sign-off:** not needed.

## Implementation

### Files

| Path | Action | Note |
|---|---|---|
| `components/ui/filter-bar.tsx` | modify | Accept date and number field kinds so the three register forms can migrate |
| `components/ui/section.tsx` | create | `Section`, `Field`, `Fact`, `FlagChip` — one home for the five copies |
| `components/ui/data-table.tsx` | create | `Truncated`, `ListedNames`, the shell markup and the empty state |
| `features/kontrakty/contract-preview.tsx` | modify | Module-aware: guard, palette, project workflow sections |
| `app/(app)/projekty/[id]/page.tsx` | delete | Replaced by the shared preview |
| `features/umowy/search-form.tsx`, `features/projekty/search-form.tsx`, `features/ryzyko/search-form.tsx` | delete | Replaced by `FilterBar` |
| `app/(app)/umowy/page.tsx`, `app/(app)/projekty/page.tsx` | modify | Import from `lib/utils`; use `Pagination` |
| `components/umowy/contracts-table.tsx` | modify | Server component + client chooser island |
| `lib/contracts/modules.ts` | create | Single `MODULE_PATH`, module↔kind mapping, palette selection |
| `app/(app)/[...slug]/page.tsx` | modify | Narrow the catch-all |

### The register-page recipe

`app/(app)/ryzyko/page.tsx` is the reference implementation — it already uses the
shared helpers. Every register page follows it:

1. `export const dynamic = "force-dynamic";` and `type SP = Record<string, string | undefined>;`
2. `const DEFAULT_PAGE_SIZE = <n>;`
3. `function buildWhere(sp: SP): Prisma.<Model>WhereInput` — accumulate into
   `const and: Prisma.…WhereInput[]`, starting with the hard scope
   (`{isDeleted:false}`, `{status:{kind:…}}`) and, after spec 03, the actor scope.
   Text params use `contains` + `mode:"insensitive"`; foreign keys use
   `intParam(sp.x)`; checkboxes test `sp.x === "1"`. Return `{ AND: and }`.
4. `async function loadDictionaries()` — one `Promise.all` of
   `findMany({where:{active:true}, orderBy:[{sortOrder:"asc"},{name:"asc"}]})`,
   mapped to `{id: String(x.id), name}`, plus `loadOwnerOptions()`.
5. In the page: `pageParam`, `pageSizeParam`, `buildWhere`.
6. One `Promise.all([loadDictionaries(), count({where}), findMany({where, include,
   orderBy, skip, take})])`.
7. Map rows to a serialisable `Row` type — `Decimal → .toString()`,
   `Date → .toISOString()` — so the table can be a client component when it needs to be.
8. JSX: `<h1>` + "Znaleziono: N" + the `Dodaj nowy wpis` link
   (`buttonClass("primary")`), then `<FilterBar/>`, then the table, then
   `<Pagination/>`.
9. Table shell: `overflow-x-auto rounded-lg border shadow-sm` →
   `<table className="w-full text-xs">`, head
   `bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground`,
   rows via `<ClickableRow href>`, cells
   `whitespace-normal break-words px-2 py-1.5 align-top`, and the two-line empty
   state ("Brak … / Zmień lub wyczyść filtry").

Do **not** copy `umowy/page.tsx` — it predates the helpers and is what this spec
removes.

### Ordering with `FilterBar`

The three register forms differ from `FilterBar` in three ways only: they support a
date input (`dateEnd`), they lay out more than five columns, and Umowy has two
checkboxes. All three are small additions to `FilterField`. Nothing justifies three
separate components.

Keep the Polish labels exactly as they are today — including `"Buissnesline"` and
`"tylko OBSSC"` — because they are legacy's, not ours (see `README.md`).

## Verification

This refactor must change nothing a user can see. That is the whole test.

Before starting, capture a baseline for each of the ten screens: row counts with no
filter, row counts with two representative filters, and the rendered column headers.
Re-run after.

- [ ] `/umowy`, `/projekty`, `/ryzyko`, `/kontrahenci`, `/grupy`, `/lokalizacje`,
      `/dostepy`, `/raporty`, `/mailing` all render with identical counts and headers
- [ ] Filters on each register return the same result sets as before
- [ ] Pagination links preserve every non-empty search param, as
      `components/ui/pagination.tsx:18-25` already does
- [ ] Page-size selector still offers 10/15/25/50/100/250/500 and each register keeps
      its own default
- [ ] `/projekty/[id]` renders the same sections as before the fork was deleted,
      including "Workflow projektu" and "Obieg FAU"
- [ ] A project id under `/umowy/[id]` now 404s instead of rendering
- [ ] A risk record's status badge is the same colour on the list and on the detail page
- [ ] `/umowy/1/2/3` 404s instead of showing "Moduł w budowie"; `/supply-chain` still
      shows the placeholder
- [ ] Column chooser still persists to `localStorage` and still opens on right-click
      and on the "Kolumny" button
- [ ] `grep -rn "function intParam" nextjs_space` returns exactly one hit
- [ ] `grep -rn "MODULE_PATH" nextjs_space` returns one definition
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green, route count unchanged
      minus the one deleted page

## Open questions

1. **Does the column chooser belong on the other registers?** Umowy has 25 columns
   with a chooser; Projekty and Ryzyko have fixed sets of 8 and 11. Legacy has no
   chooser at all — it is ours. Extending it is cheap once the table shell is shared,
   but it is a new feature, not consolidation. Recommend deferring to specs 07 and 08.
2. **Keep `Fact` tiles?** The five summary tiles at the top of the contract preview
   are ours, not legacy's. They are useful; confirming they stay means the shared
   `Section` component keeps supporting them.

## Implementation notes (2026-09-24)

- **New shared pieces:** `components/ui/section.tsx` (`Section`, `Field`, `Fact`,
  `FlagChip`), `components/ui/data-table.tsx` (`DataTable`, `Cell`, `Truncated`,
  `ListedNames`, the empty state), `components/ui/column-chooser.tsx` and
  `lib/contracts/modules.ts`. All five `Section`/`Field` copies and the three search
  forms are gone. `intParam` and `MODULE_PATH` each have one definition.
- **`FilterBar`** gained date, number and contractor-autocomplete fields (a small
  client island, `components/ui/contractor-filter.tsx`), a per-field hint, a custom
  submit label and a six-column layout. It is wrapped in `<details open>`, so the
  old forms' "Zwiń/Rozwiń" survives without client JS.
- **Column chooser as an island.** The table is server-rendered with every column
  carrying `data-col`; the island only injects CSS that hides the unchosen ones. The
  `localStorage` key and format are unchanged, so saved choices carry over. The
  Umowy page's first-load JS fell from 5.09 kB to 2.55 kB.
- **Module guard.** `/umowy/[id]`, `/projekty/[id]` and `/ryzyko/[id]` all render
  `ContractPreview` with the route's module; an out-of-module id is a 404. The
  record actions (`/[id]/edycja`, …) apply the same guard. The palette comes from
  the module (`moduleStatusTone`).
- **Catch-all** answers only for unbuilt module roots (`/supply-chain`);
  `/umowy/1/2/3`, `/lokalizacje/5` and `/raporty/x` are 404s.
- **Open questions:** the chooser now also serves Projekty (spec 07's call), and the
  `Fact` tiles stay.
- **Not literally "no visible change".** Specs 06–09 were built in the same pass, so
  their deliberate changes (labels, counts, columns) landed together with this
  refactor. Everything else was compared against a baseline capture of all ten
  screens.

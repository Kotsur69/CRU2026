---
id: 28
title: Eksporty (Excel, CSV, PDF)
group: E-planned
status: todo
depends-on: [05]
legacy-tables: []
prisma-models: []
routes: ["/api/export/[rodzaj]"]
---

# 28 — Eksporty (Excel, CSV, PDF)

> **Where we stand (2026-09-24): not started.** Nothing in this spec is built yet.
>
> - **Waiting on:** Q70 (what the legacy reports contain) governs the report exports. Exporting the registers themselves does not wait on it.
> - **Next step:** can start now with the register exports, on top of spec 05's shared table and filters.

## Why

Spec 24 reaches the conclusion this spec implements. Legacy's reports are
`?limit=&offset=` paginated to **4000/5000 rows** (`audyt §8`) — that is not a
dashboard, it is a bulk extract, and it is what the legal department means when it
asks for "the report".

There is **no export anywhere in the application today**, and no library installed
that could produce one. A user who wants their filtered list in Excel currently
selects the table with a mouse.

## What has to be exportable

Two kinds, and they are different features that happen to share a menu.

### Tabular — the real requirement

Every register, **with the user's current filters applied**. That last clause is
the whole point: an unfiltered dump of 10,704 contracts is less useful than 40 rows
matching what the user just searched for.

| Source | Rows unfiltered | Spec |
|---|---|---|
| `/umowy` | 10,704 | 06 |
| `/projekty` | 9,027 | 07 |
| `/ryzyko` | 406 | 08 |
| `/kontrahenci` | 3,580 | 20 |
| `/opinie` | 645 (3,702 with closed records) | 16 |
| `/wygasajace` | 187 + 1,683 | 19 |
| Each Raporty card | varies | 24 |

Largest realistic export: the full Umowy register, 10,704 rows × 25 columns. That
is comfortably inside what a browser can download synchronously — around 3 MB as
`.xlsx` — so **no job queue, no e-mail delivery, no polling**. A request, a few
seconds, a file.

### Documents

| Document | Today | Spec |
|---|---|---|
| Formularz akceptacji / MDR | Browser print (Ctrl+P) | 17 |
| A contract card | Nothing | 09 |

Spec 17 is explicit that browser print is adequate and that generating a PDF for a
layout **we invented** — the legacy screen was never seen — would be rendering a
guess to paper. That reasoning still holds. **Keep browser print until Q26 produces
a real legacy layout.** The PDF half of this spec is therefore deferred, and the
tabular half is the deliverable.

## Format

| Format | For | Verdict |
|---|---|---|
| **`.xlsx`** | The default | What people actually want. Typed cells, so dates sort and amounts total |
| **`.csv`** | An escape hatch | One line of code once the data shape exists. **UTF-8 with a BOM**, or Excel renders `Świętochłowice` as mojibake |
| `.pdf` | Documents only | Deferred — see above |

### Library

Nothing is installed. `xlsx` (SheetJS) is the obvious candidate and has had
prototype-pollution advisories; `exceljs` is heavier and maintained. **Recommend
`exceljs`** — this writes files from user-influenced data, and the size difference
does not matter in a server bundle.

CSV needs no library.

## The things that will be got wrong

Each of these has already bitten something in this spec set, and an export is where
they become visible outside the application.

| Trap | Rule | Spec |
|---|---|---|
| `2099-12-31` | Export **"na czas nieokreślony"**, not the date. 4,119 records | 10 |
| `1900-01-01` | Export empty, not the date. 49 records | 10 |
| Currency `???` | Export the amount with **no** currency code. 558 records | 10 |
| `Decimal` | A real number cell, never a string. `salary` is `Decimal(14,2)` | 10 |
| `(brak danych)` | A real dictionary value — export it as it is, never as blank | 22, 01 |
| Polish collation | Sort with `Intl.Collator("pl")`; Postgres puts Ł and Ś after Z | 02 |
| `Buissnesline` | The header keeps the legacy spelling | 06 |
| Access scope | Apply `contractScopeWhere(actor)`. An export must not leak what the screen hides | 03 |
| Annex count | `annexesOf()`, not `_count.annexes` — 6,981 of those children are projects | 07, 11 |
| Owners | Several per record; join with "; " as the preview does | 06 |

The scope rule is the one that matters most: **an export is a bulk read**, so it is
the single easiest way to defeat spec 03 by accident. Same `where`, same actor,
every time.

## Design

One route, not one per register:

```
GET /api/export/[rodzaj]?format=xlsx&<the register's own filters>
```

`rodzaj` ∈ `umowy | projekty | ryzyko | kontrahenci | opinie | wygasajace`.
The query string is **exactly** what the register page already parses, so the
export button is a link that appends `format=xlsx` to the current URL. No second
filter model, no drift between what the screen shows and what the file contains.

```ts
/** Streams the current register view as a file. Reuses the page's own
 *  `buildWhere` and the actor's scope — an export must never return a row the
 *  screen would hide. See docs/features/28. */
export async function GET(req: NextRequest, { params }: { params: { rodzaj: string } });
```

Columns come from the register's column definition (`lib/umowy-columns.ts` and the
siblings spec 07 adds), so **the export matches the chooser**: hide a column on
screen and it is absent from the file. That is the behaviour people expect and it
costs nothing, because the definitions already exist.

A hard cap of **50,000 rows** with a clear error rather than a timeout. Nothing
today comes near it.

### Filename

`umowy-2026-09-18.xlsx` — register, date. If filters are active, append
`-filtrowane`, so a file on somebody's desktop says whether it is the whole
register.

### UI

An **"Eksportuj"** button next to "Znaleziono: N" on every register, and on each
Raporty card (spec 24). A dropdown only where both formats make sense; otherwise
`.xlsx` directly.

Show the row count on the button — **"Eksportuj (10 704)"** — so nobody downloads
the whole register by accident when they meant their filtered forty.

## Implementation

| Path | Action | Note |
|---|---|---|
| `package.json` | modify | `exceljs` |
| `app/api/export/[rodzaj]/route.ts` | create | The one route |
| `lib/export/build-sheet.ts` | create | Rows + column defs → workbook, with the trap rules above |
| `lib/export/csv.ts` | create | UTF-8 BOM, `;` separator for Polish Excel |
| `lib/contracts/scope.ts` | use | Spec 06's `moduleWhere`, and each page's `buildWhere` |
| Each register page | modify | The export link |

The register pages must export their `buildWhere` for the route to import. That is
a small refactor and it is the same one spec 05 wants anyway, so do it there.

## Verification

```sql
-- Row counts an export must match exactly, unfiltered and unscoped.
select 'umowy' t, count(*) from "Contract" c join "ContractStatus" s on s.id=c."statusId"
  where not c."isDeleted" and s.kind='CONTRACT'
union all select 'projekty', count(*) from "Contract" c
  left join "ContractStatus" s on s.id=c."statusId"
  where not c."isDeleted" and (s.kind='PROJECT' or (c."statusId" is null and c."isProject"))
union all select 'ryzyko', count(*) from "Contract" c join "ContractStatus" s on s.id=c."statusId"
  where not c."isDeleted" and s.kind='RISK'
union all select 'kontrahenci', count(*) from "Contractor" where not "isDeleted";
-- expected: 10704 | 9027 | 406 | 3494

-- The records whose export must not show a raw date.
select count(*) filter (where "dateEnd" = date '2099-12-31') indefinite,
       count(*) filter (where "dateBegin" = date '1900-01-01') unknown_start,
       count(*) filter (where "currencyId" = 1) no_currency
from "Contract" where not "isDeleted";
-- expected: 4119 | 49 | 558
```

Manual checks:

- [ ] Exporting `/umowy` unfiltered produces **10 704** data rows plus a header
- [ ] Filtering to 40 rows and exporting produces **40**, and the filename ends
      `-filtrowane`
- [ ] Hiding a column in the chooser removes it from the file
- [ ] `Świętochłowice`, `Łódź` and `Buissnesline` open correctly in Excel from
      both `.xlsx` and `.csv`
- [ ] A record with `dateEnd = 2099-12-31` exports **"na czas nieokreślony"**
- [ ] A record with `dateBegin = 1900-01-01` exports an empty cell
- [ ] An amount in currency `???` exports the number with no code
- [ ] Amounts are numeric cells — Excel's SUM works without retyping
- [ ] Sorting the Lokalizacja column in Excel puts Ł before M
- [ ] The "Aneks" column shows 3 038 in total, not 10 019
- [ ] **A scoped user's export contains exactly the rows their screen shows** —
      test against a user with a DOMAIN grant
- [ ] Requesting `format=csv` on a register with 10 704 rows completes in seconds
- [ ] A request for a register the actor cannot read returns 404, not an empty file
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Q70 carries over, and it governs this spec.** We do not know what the legacy
   reports contain. If they carry a fixed column order, computed totals, or a
   layout the legal department pastes into a template, this export has to match it.
   **One exported file from legacy would settle the design.**
2. **Q91 — `xlsx` or `exceljs`?** Recommend `exceljs` for the maintenance and
   advisory record, accepting the larger bundle. It is the first new runtime
   dependency in the project, so it is worth a deliberate choice.
3. **Q92 — should exports be logged?** A bulk read of a legal register is exactly
   what an access audit wants to know about. `AccessAudit` (spec 23) could take a
   row per export: who, which register, how many rows. Cheap, and it answers a
   question that otherwise cannot be answered at all.
4. **Q26 carries over** — the contract-card and acceptance-form PDFs stay on
   browser print until somebody supplies the legacy layout.

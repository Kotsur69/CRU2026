---
id: 00
title: Template
group: meta
status: n/a
depends-on: []
legacy-tables: []
prisma-models: []
routes: []
---

# NN — Feature name

> Copy this file when starting a new spec. Delete this blockquote and every
> instruction in italics. Keep the section order — reviewers rely on it.
> Target length: under 500 lines (repo rule). Split into `NNa` / `NNb` if a
> feature genuinely needs more.

## Why

*Two to five sentences. What the feature is for, who uses it, and what is broken
or missing without it. No implementation detail here.*

## Legacy behaviour

*What the old CRU did. Every claim carries a citation:*

- *`cru.sql:447511` for a dump line*
- *`audyt_legacy_strony.md §1.4` for the UI audit*
- *`psql cru2026` for a query result — include the query in "Verification"*
- *`features/kontrakty/actions.ts:136` for current code*

*Label anything you could not source:*

- `[INFERRED]` — a reasoned guess from the data, stated as a guess.
- `[UNKNOWN — ask Mati]` — needs a human answer. Also add it to "Open questions".

*Eight of the ten legacy modules were never observed running (the auditor's account
was denied). If this spec covers one of them, say so here in bold.*

## Data

*Every table, column, type, row count and distribution that matters.*

### Tables

| Legacy table | Prisma model | Rows | Notes |
|---|---|---|---|

### Columns

| Legacy column | Type | Prisma field | Fill | Notes |
|---|---|---|---|---|

*Dump small dictionaries in full — id, name, active flag, usage count. Those are
the exact dropdown contents the new app must reproduce, and a reader must not have
to go back to the database for them.*

*State fill rates as `N of M` with the real numbers, never "most" or "some".*

## Legacy quirks

*One block per divergence from legacy. Omit the section only if there are none.*

### Quirk: <short name>

- **Legacy:** what the old system does, with a citation.
- **Why it is wrong:** the concrete consequence.
- **We do:** the new behaviour.
- **Sign-off:** `not needed` (bug fix, no visible change) or
  `REQUIRED — behaviour change` (Mati must approve before build).

## UI

*Routes, screens, and everything on them.*

### Routes

| Route | File | Kind |
|---|---|---|

### Screen: <name>

- **Field order** — exactly as it must render, with Polish labels in quotes.
  Preserve legacy spelling verbatim, including mistakes (`"Buissnesline"`,
  `"Informatyka/Telenformatyka"`, `"tylko OBSSC"`).
- **Filters** — name, label, type, dictionary, default.
- **Columns** — order, label, formatting, default visibility.
- **Actions** — every button, its label, where it goes, when it is disabled.
- **Empty state** — the exact copy.
- **Validation** — rule and the message the user sees.

## Implementation

### Files

| Path | Action | Note |
|---|---|---|

*`create` / `modify` / `delete`. Name the file, not the line count.*

### Reuse

*Name the existing helper and its path. Do not reinvent these:*

- `components/ui/filter-bar.tsx` — `FilterBar({action, fields, values, defaultPageSize})`
- `components/ui/pagination.tsx` — `Pagination({basePath, searchParams, page, pageSize, total})`
- `components/ui/button.tsx` — `buttonClass(variant, size)`, `Button`
- `components/ui/badge.tsx` — `Badge({tone})`, tones `neutral|success|warning|danger|info|brand`
- `components/ui/clickable-row.tsx` — `ClickableRow({href})`
- `components/ui/form.tsx` — `FormSection`, `FormRow`, `FieldError`, `YesNoRadio`, `CONTROL_CLASS`
- `lib/utils.ts` — `cn`, `intParam`, `pageParam`, `pageSizeParam`
- `lib/format.ts` — `formatMoney`, `formatDate`, `formatDateTime`, `yesNo`, `userLabel`, `contractorLabel`
- `lib/authz.ts` — `currentActor`, `requireActor`, `canEditContract`, `assertCanEditContract`
- `lib/contracts/dictionaries.ts` — `loadFormDictionaries(kind, ...current)`, `optionId`, `BLANK_OPTION_NAME`
- `lib/contract-access.ts` — `ASSIGNEE_SELECT`, `loadOwnerOptions`
- `lib/contract-status.ts` — `statusTone`, `projectStatusTone`, `riskStatusTone`, `endUrgency`

*The register-page recipe lives in spec 05; `app/(app)/ryzyko/page.tsx` is the
reference implementation. Do not copy `umowy/page.tsx` — it predates the shared
helpers and re-declares them locally.*

### Server actions

| Action | Signature | Authorization | Validation | Writes |
|---|---|---|---|---|

*Every write goes through `requireActor()` plus a record-level check. Route
middleware only proves someone is signed in — it is not authorization.*

### Data migration

*If the feature needs a schema change: the migration, whether `db:import` must be
re-run, and how existing rows are backfilled. `db:migrate` writes a migration,
`db:push` does not — say which one this needs.*

## Verification

*Concrete, runnable checks. Not "test the feature".*

```sql
-- Run against cru2026. State the expected number.
```

```
psql invocation notes: use the Bash tool, export PGCLIENTENCODING=UTF8,
wrap UNION queries in a subquery before ORDER BY.
```

- [ ] `npx tsc --noEmit` clean
- [ ] `corepack yarn build` green
- [ ] *feature-specific manual checks, each with its expected result*
- [ ] Row counts unchanged where the feature is read-only

## Open questions

*Numbered list. Each one names who can answer it and what is blocked until they do.
Everything here is mirrored into the open-questions section of `README.md`.*

1. …

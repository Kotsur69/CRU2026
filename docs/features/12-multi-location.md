---
id: 12
title: Wiele lokalizacji na rekordzie
group: B-registers
status: todo
depends-on: [03, 10]
legacy-tables: [contract, contract_has_location, contract_location]
prisma-models: [Contract, Location, ContractLocationLink]
routes: ["/umowy", "/umowy/[id]", "/umowy/nowy"]
---

# 12 — Wiele lokalizacji na rekordzie

> **Where we stand (2026-09-24): not started.** Nothing in this spec is built yet.
>
> - **Already in place:** the registers filter by location on the primary location *or* any linked one (spec 06).
> - **Waiting on:** **Q54**, whether `contract_has_location` holds additional locations or the complete set. It decides the form, the label and whether the primary field survives. Also Q55 and Q56.
> - **Next step:** get Q54 answered. One legacy user can answer it.

## Why

A contract has one **Lokalizacja** on the form and, separately, a set of locations
in a join table — 21,636 rows. The register already searches both
(`umowy/page.tsx:57-62`) and the preview already lists both
(`contract-preview.tsx:189`, `:220`). What nothing does is **write** the join table:
the form persists `primaryLocationId` only, so the moment anyone edits a record the
two representations drift further apart.

They have already drifted. **7,944 contracts have exactly one linked location and
it is not their primary one.** Whether that is a bug or the design is the question
this spec answers, and the answer changes both the form and the read-authorization
query in spec 03, which resolves location grants through this very table.

## Legacy behaviour

### Two tables, similar names

`cru.sql:81871` — the **dictionary**:

```sql
CREATE TABLE IF NOT EXISTS `contract_location` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `location` varchar(45) COLLATE utf8_polish_ci DEFAULT NULL,
  `description` varchar(45) COLLATE utf8_polish_ci DEFAULT NULL,
  PRIMARY KEY (`id`), UNIQUE KEY `id_UNIQUE` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=36;
```

35 rows, id 1 being `'(brak danych)'` — the real-`id`-placeholder pattern from
spec 01.

`cru.sql:60189` — the **join**:

```sql
CREATE TABLE IF NOT EXISTS `contract_has_location` (
  `contract_id` int(11) DEFAULT NULL,
  `location_id` int(10) DEFAULT NULL,
  KEY `FK_contract_has_location_contract` (`contract_id`),
  KEY `FK_contract_has_location_contract_location` (`location_id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1;
```

Note what it lacks: **no primary key, no unique constraint, no foreign keys, both
columns nullable, MyISAM, and `latin1`** in an otherwise `utf8_polish_ci` schema.
It is the least constrained table in the database. Nothing prevented a duplicate
pair, an orphan, or a null.

The dump's own header says **21 666 rows**, and its first entries are exactly what
the missing constraints allow:

```sql
INSERT INTO `contract_has_location` (`contract_id`, `location_id`) VALUES
	(2383, NULL), (2384, NULL), (2385, NULL),
	(11965, NULL), (11966, NULL), (11967, NULL),
```

We imported 21,636 — the 30 rows with a null `location_id` were dropped.

### The column on `contract`

`cru.sql:39421`, with a comment the dump preserves:

```sql
`location_id` int(10) unsigned DEFAULT NULL COMMENT 'Lokalizacja (miejsce zastosowania)',
```

*Miejsce zastosowania* — "place of application". So the single column is the
contract's principal location.

### Where the join table is used

The `access` metamodel (spec 03) names it. Row 3 of `access` (`cru.sql:53`):

```sql
(3, 'location', 'contract_location', 'location', 'location_id', 'contract_has_location'),
```

The columns are `(id, model, table, column, contract_column, has_many)`. So a
location grant resolves through **both** `contract.location_id` **and**
`contract_has_location` — which is exactly what spec 03 specifies:

```ts
{ OR: [ { primaryLocationId: { in: ids } },
        { locations: { some: { locationId: { in: ids } } } } ] }
```

That is the only use of the table we can point to in the dump. No view, no
procedure, and the audit never saw the form.

## Data

### How many locations a record has

| Links on a record | Records |
|---|---|
| **0** | **40** |
| **1** | **19,768** |
| 2 | 137 |
| 3 | 59 |
| 4 | 52 |
| 5 | 20 |
| 6 | 15 |
| 7 | 3 |
| 8 | 3 |
| 10 | 2 |

**98% of records have exactly one link.** Only 291 have two or more, and the
maximum is ten. So "multi-location" is a real but rare feature — it applies to 1.4%
of the register.

### The link is usually *not* the primary location

Among the 20,106 records that have a `primaryLocationId`:

| | Records |
|---|---|
| The primary location appears among the links | **11,867** |
| It does not | **8,239** |
| No links at all | 9 |

Narrowing to the 19,768 records with exactly one link:

| | Records |
|---|---|
| That one link **equals** the primary | **11,824** |
| That one link **differs** from the primary | **7,944** |

Examples, each a record with one primary and one different link:

| Record | Lokalizacja (`location_id`) | Linked |
|---|---|---|
| `2012/0088` | Olkusz | Rawa Mazowiecka |
| `2012/0391` | Bytom | Katowice |
| `2012/0430` | Bytom | Warszawa |
| `2012/0448` | Katowice | Bytom |
| `2012/0498` | Bytom | Centrala |

And of the 291 records with two or more links, only **43** include the primary among
them.

### What this means

Two readings fit, and they imply different UIs.

**Reading A — the link table holds *additional* locations.** The primary is the
place of application; the links are other sites the contract also covers. Under
this reading the 7,944 are correct and the 11,824 that duplicate the primary are
the anomaly — redundant rows written by a form that added the primary to the set.

**Reading B — the link table is the full set and the two drifted.** Under this
reading 7,944 records are simply inconsistent.

**Reading A is the better fit**, on three grounds. The column's own comment
distinguishes a single *miejsce zastosowania* from a set. The `access` row joins on
both, which is only necessary if they hold different things — if the link table were
the complete set, the `contract_column` would be redundant. And 7,944 records is
too many to be an accident in a system where the same pattern appears in 2012 and
in 2024.

But it is an inference, not an observation, and it is the one thing in this spec
that a legacy user could settle in ten seconds (Q54).

## Legacy quirks

### Quirk: the form writes `primaryLocationId` and never touches the link table

- **Current:** `lib/contracts/form-schema.ts:96` has `primaryLocationId` and no
  field for the set. `features/kontrakty/actions.ts` writes the scalar.
- **Why it matters:** every save silently leaves the link table at whatever the
  import produced. A user who changes a contract's location sees the change on the
  form and in the primary column, while the register's location **filter** — which
  matches either (`umowy/page.tsx:57-62`) — keeps returning it under the old one.
  After spec 03, the same staleness decides who can *see* the record.
- **We do:** add `locationIds: idList` to the form schema and write the set inside
  the same transaction as the record, `deleteMany` then `createMany`. Whatever
  Q54 decides, the set must stop being write-only.
- **Sign-off:** not needed. A field that is read and never written is a defect.
- **Priority:** highest in this spec — it is the one that actively worsens with use.

### Quirk: the join table has no constraints at all

- **Legacy:** MyISAM, no primary key, no unique index, nullable columns, no foreign
  keys, `latin1`. 30 rows with a null `location_id` reached the dump.
- **Current:** `ContractLocationLink` in Prisma has the composite key and the
  relations, so the data we hold is already clean — the 30 nulls were dropped on
  import.
- **We do:** nothing to the schema; it is already better than legacy. Record in
  spec 34's reconciliation that **21,666 dump rows → 21,636 imported** is expected
  and not a loss, so nobody chases the 30.
- **Sign-off:** not needed.

### Quirk: 40 records have no location link and 9 have a primary but no link

- **Data:** 40 with zero links; of the 20,106 with a primary, 9 have no link at all.
- **We do:** nothing. Under Reading A an empty set is meaningful — the contract
  applies at one place only. The form's multi-select starts empty on those records.
- **Sign-off:** not needed.

### Quirk: the two representations are named almost identically

- `Location` (the dictionary, legacy `contract_location`), `primaryLocation`
  (the scalar, legacy `contract.location_id`), `locations` (the set, legacy
  `contract_has_location`). Three names, one letter apart in places.
- **We do:** in the UI, **"Lokalizacja"** for the primary — legacy's label
  (`audyt §1.4`, field 12) — and **"Lokalizacje dodatkowe"** for the set, which
  states Reading A in the label. Not "Lokalizacje", which invites the reader to
  think it supersedes the singular.
- **Sign-off:** not needed. Depends on Q54: if Reading B wins, the label becomes
  "Lokalizacje" and the primary field goes away.

### Quirk: spec 03's location grants inherit all of this

- **Legacy:** `access` row 3 resolves a grant through both columns.
- **Why it matters here:** with the set stale on every edited record, a location
  grant lets someone see a contract that has moved away from their location, and
  hides one that has moved to it. The read-authorization spec is only as good as
  this table.
- **We do:** spec 03 keeps the `OR` — it is what legacy does. This spec makes the
  data it reads correct going forward.
- **Sign-off:** not needed.

## UI

### On the form

Under **"Lokalizacja"** (the existing single select), add
**"Lokalizacje dodatkowe"** — a multi-select over the 35 active locations,
excluding whichever is chosen as primary so the same place cannot be both.

Rare enough (1.4% of records use it) that it should be collapsed by default:
a **"+ dodaj kolejne lokalizacje"** disclosure that expands when the set is
non-empty. Do not put a ten-slot multi-select in front of the 98% who need one
location.

Validation: at most 35 (the whole dictionary), each id must exist and be active,
duplicates collapsed. Reuse `idList` from `form-schema.ts:74-85`.

### On the preview

The existing two fields (spec 09):

| Label | Source |
|---|---|
| **Lokalizacja** | `primaryLocation.name` — audit field 12, in the tiles |
| **Lokalizacje dodatkowe** | the set, comma-separated; hidden when empty |

Today `contract-preview.tsx:220` labels the set "Lokalizacje", which reads as a
replacement for the singular. Rename.

### On the register

No change. The filter already matches either (`umowy/page.tsx:57-62`), which is
both what `access` row 3 does and what a user means by "contracts in Katowice".
The **column** keeps showing the primary only — 291 records would need a list and
19,846 would not.

## Implementation

### Files

| Path | Action | Note |
|---|---|---|
| `lib/contracts/form-schema.ts` | modify | Add `locationIds: idList`; exclude the primary |
| `features/kontrakty/contract-form.tsx` | modify | The collapsed multi-select |
| `features/kontrakty/actions.ts` | modify | Write the set in the same transaction |
| `features/kontrakty/contract-preview.tsx` | modify | Rename to "Lokalizacje dodatkowe"; hide when empty |
| `lib/contracts/record.ts` | modify | Load `locations` on read |

### Writing the set

Inside the existing `$transaction`, after the record is written:

```ts
await tx.contractLocationLink.deleteMany({ where: { contractId } });
if (locationIds.length > 0) {
  await tx.contractLocationLink.createMany({
    data: locationIds.map((locationId) => ({ contractId, locationId })),
  });
}
```

Delete-then-insert rather than a diff: the set has at most ten members, the whole
thing is two statements, and a diff would be more code than the feature.

**The history writer must see it.** `buildSnapshot` (`lib/contracts/history.ts`)
records changed fields, and legacy never audited this table — `contracthistory` has
no `location` rows beyond the scalar. Adding the set to the snapshot is a
divergence, and the right one: a change to who can see a record (spec 03) that
leaves no trace is exactly the gap spec 19 documents for the auto-close job. Record
it as `columnName = 'locations'` with comma-joined names.

## Verification

```sql
-- 1. Distribution — 98% of records have exactly one link.
select n, count(*) records from (
  select c.id, count(l."locationId") n
  from "Contract" c
  left join "ContractLocationLink" l on l."contractId" = c.id
  where not c."isDeleted" group by 1) q
group by 1 order by 1;
-- expected: 0→40, 1→19768, 2→137, 3→59, 4→52, 5→20, 6→15, 7→3, 8→3, 10→2

-- 2. The primary is usually not in the set.
select count(*) total,
  count(*) filter (where exists (select 1 from "ContractLocationLink" l
                    where l."contractId" = c.id and l."locationId" = c."primaryLocationId")) primary_in_set,
  count(*) filter (where not exists (select 1 from "ContractLocationLink" l
                    where l."contractId" = c.id))                                            no_links
from "Contract" c where not c."isDeleted" and c."primaryLocationId" is not null;
-- expected: 20106 | 11867 | 9

-- 3. Single-link records: does that link match the primary?
select case when l."locationId" = c."primaryLocationId" then 'zgodne' else 'różne' end m, count(*)
from "Contract" c
join "ContractLocationLink" l on l."contractId" = c.id
where not c."isDeleted" and c."primaryLocationId" is not null
  and (select count(*) from "ContractLocationLink" x where x."contractId" = c.id) = 1
group by 1;
-- expected: zgodne 11824 | różne 7944

-- 4. Total links, against the dump's 21 666.
select count(*) from "ContractLocationLink";
-- expected: 21636   (30 dump rows had a null location_id and were dropped)

-- 5. No orphans, no duplicates — the constraints legacy lacked.
select (select count(*) from "ContractLocationLink" l
          left join "Contract" c on c.id = l."contractId" where c.id is null)  orphan_contract,
       (select count(*) from "ContractLocationLink" l
          left join "Location" x on x.id = l."locationId" where x.id is null)  orphan_location,
       (select count(*) from (select "contractId", "locationId"
          from "ContractLocationLink" group by 1,2 having count(*) > 1) d)     duplicates;
-- expected: 0 | 0 | 0

-- 6. Records using the feature for real.
select count(*) from (
  select "contractId" from "ContractLocationLink" group by 1 having count(*) > 1) q;
-- expected: 291
```

Manual checks:

- [ ] Open a record, change **Lokalizacja**, save, reopen — the register's location
      filter now finds it under the new location and **not** under the old one
- [ ] Open a record with two linked locations — "Lokalizacje dodatkowe" is expanded
      and both are selected
- [ ] On a record with none, the multi-select is collapsed behind
      "+ dodaj kolejne lokalizacje"
- [ ] Adding a location, saving, and removing it again leaves no rows behind —
      check `ContractLocationLink` directly
- [ ] The primary location cannot also be chosen as an additional one
- [ ] The preview's second field is labelled **"Lokalizacje dodatkowe"** and is
      absent when the set is empty
- [ ] Filtering the register by a location matches records where it is either the
      primary **or** in the set — verify against one of the 7,944 mismatched records
- [ ] A change to the set produces a `ContractHistory` row (`columnName = 'locations'`)
- [ ] After spec 03, a user with a Katowice grant sees a record whose *set* contains
      Katowice even though its primary is Bytom — one of the 7,944
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Q54 — is the join table *additional* locations, or the complete set?**
   7,944 records have a single link that is not their primary, and 11,824 have one
   that is. Reading A (additional) fits the column comment *"miejsce zastosowania"*,
   fits the `access` metamodel joining both, and fits fourteen years of the pattern.
   Reading B makes 7,944 records inconsistent. **This decides the label, the form
   and whether the primary field survives at all** — and one legacy user opening one
   contract answers it. Highest-value question in group B.
2. **Q55 — should the 11,824 redundant links be removed?** Under Reading A they are
   noise: the primary duplicated into the set. Removing them makes the data say what
   it means, and it is a bulk change to 11,824 records for no user-visible benefit.
   Recommend leaving them and having the reader tolerate both.
3. **Q56 — should the register's location column show the set?** 291 records have
   more than one. Legacy shows one (`audyt §1.3`). Recommend keeping one and
   surfacing the rest on the detail page only.

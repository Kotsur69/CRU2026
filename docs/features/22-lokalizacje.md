---
id: 22
title: Lokalizacje (Lokalizacja dostępy)
group: D-supporting
status: done
depends-on: [03]
legacy-tables: [contract_location, users_locations, contract_has_location]
prisma-models: [Location, UserLocation, Contract, ContractLocationLink]
routes: ["/lokalizacje", "/lokalizacje/[id]"]
---

# 22 — Lokalizacje (Lokalizacja dostępy)

## Why

35 locations, referenced by 20,106 records as a primary location and by 21,636 rows
of the join table (spec 12). The legacy menu calls this module **"Lokalizacja
dostępy"** — *location access* — and the second word is the point: 30 `UserLocation`
rows restrict who sees what, and spec 03 resolves them through this dictionary.

It is currently the thinnest module in the application: a single page with no
filters, no pagination, no detail route, and no authorization
(`app/(app)/lokalizacje/page.tsx`).

## Legacy behaviour

`audyt §3.–8.`: **`access deny`** at `/cru/index.php/locations`. Never observed.
The menu label is recorded in `audyt §0` as **"Lokalizacja dostępy"**, listed among
the ten top-level items, and `§8` groups it with Grupy and Dostępy as
*"moduły uprawnień/administracji"*.

### The dictionary

`cru.sql:81871` — `contract_location`, 35 rows, `AUTO_INCREMENT=36`, so nothing was
ever deleted. Columns are `id`, `location` and a `description` that duplicates the
name on every row we hold.

`audyt §1.6` enumerates the dropdown as seen in the Umowy filter — **34 names**,
which is exactly our 35 minus `(brak danych)`. The audit's list and the dictionary
agree completely, which is a useful confirmation that nothing was lost on import.

## Data

### All 35, with usage

| id | Name | As primary location | User grants |
|---|---|---|---|
| 1 | **(brak danych)** | **8,161** | 0 |
| 9 | Katowice | 2,070 | 1 |
| 27 | Warszawa | 1,622 | 1 |
| 5 | Centrala Katowice | 1,523 | 0 |
| 24 | Świętochłowice | 1,094 | 1 |
| 29 | Bytom | 833 | 2 |
| 22 | Starachowice | 696 | 0 |
| 19 | Rawa Mazowiecka | 670 | 0 |
| 12 | Kraków | 582 | 3 |
| 30 | Kuków Folwark | 311 | 1 |
| 4 | Centrala | 286 | 0 |
| 8 | Gdańsk | 279 | 2 |
| 23 | Suwałki | 269 | 0 |
| 11 | Konin | 258 | 1 |
| 28 | Wrocław | 186 | 1 |
| 31 | Dąbrowa Górnicza II | 179 | 3 |
| 3 | Białystok | 159 | 2 |
| 17 | Opole | 146 | 1 |
| 6 | Częstochowa | 137 | 1 |
| 7 | Dąbrowa Górnicza I | 135 | 2 |
| 13 | Lublin | 113 | 1 |
| 10 | Kielce | 103 | 1 |
| 20 | Rzeszów | 82 | 1 |
| 16 | Olsztyn | 59 | 1 |
| 21 | Słupsk | 55 | 1 |
| 18 | Piła | 19 | 0 |
| 26 | Wałbrzych | 17 | 0 |
| 32 | Skawina | 16 | 0 |
| 34 | Mielec | 12 | 0 |
| 25 | Szczecin | 11 | 1 |
| 2 | BCS | 7 | 0 |
| 35 | Bydgoszcz | 7 | 2 |
| 14 | Łazy | 4 | 0 |
| 15 | Olkusz | 4 | 0 |
| 33 | **Łódź** | **1** | 0 |

All 35 are active. Every one is used at least once.

**`(brak danych)` is the most common location in the register — 8,161 records,
41%.** It is a real dictionary row with a real id (the `id`-is-not-null pattern from
spec 01), and it means the location was never recorded. So any report by location
is really a report on 59% of the register.

The tail is long: nine locations have fewer than 20 records and Łódź has one.

### Access grants

`UserLocation` holds **30** rows. Spread across 22 locations, concentrated on
Kraków and Dąbrowa Górnicza II (3 each), then Bytom, Gdańsk, Białystok, Dąbrowa
Górnicza I and Bydgoszcz (2 each). Thirteen locations have no grant at all.

Spec 03 establishes that **only one user** holds a `LOCATION` grant in
`UserAccessScope` (dimension LOCATION, 3 grants, 1 user), while `UserLocation` is a
separate, older mechanism with 30 rows. Two tables, both about location access, and
spec 03 must say which one wins (Q63).

## Legacy quirks

### Quirk: no authorization at all

- **Current:** `/lokalizacje` renders for any signed-in session, listing every
  location together with the users granted access to it — an access-control map
  handed to everybody.
- **We do:** `requireAdmin`, as spec 03 specifies for all three administration
  screens.
- **Sign-off:** not needed.

### Quirk: the thinnest module in the application

- **Current:** one page, no filter, no pagination, no detail route.
- **Why it can stay thin:** 35 rows. Pagination would be silly. But a **detail
  route** is missing and worth having — "who can see Katowice, and how many records
  is that" is the module's whole purpose, and today it cannot be answered.
- **We do:** add `/lokalizacje/[id]`, keep the list unpaginated, add a name filter
  and an "unused" indicator.
- **Sign-off:** not needed.

### Quirk: two mechanisms for location access

- **Data:** `UserLocation` (30 rows, the older `users_locations` table) and
  `UserAccessScope` with `dimension = LOCATION` (3 rows, 1 user, part of the
  `access` metamodel).
- **Why it matters:** if they are ANDed, the one user with both is restricted twice;
  if ORed, a `UserLocation` grant bypasses the metamodel. Spec 03's combination rule
  currently covers `UserAccessScope` only.
- **We do:** this spec displays both, clearly separated. Spec 03 decides the
  semantics (Q63).
- **Sign-off:** not needed here; spec 03 owns it.

### Quirk: 41% of records have no real location

- **Data:** 8,161 records point at `(brak danych)`.
- **We do:** show it in the list like any other row, with its count, and **never**
  filter it out silently. The detail page for id 1 says explicitly
  *"Pozycja słownikowa oznaczająca brak danych — 8 161 rekordów."* so nobody reads
  it as a place.
- **Sign-off:** not needed.

### Quirk: `description` duplicates `name` on every row

- **Legacy:** `contract_location(location, description)` — the dump's first rows
  show `('(brak danych)', '(brak danych)')`, `('BCS', 'BCS')`.
- **We do:** do not display `description`. Keep the column; it costs nothing and
  removing it loses a legacy field for no gain.
- **Sign-off:** not needed.

## UI

### /lokalizacje

`requireAdmin`. One table, 35 rows, no pagination.

Columns: Nazwa · Rekordy (primary) · Rekordy (dodatkowe, from spec 12's join) ·
Użytkownicy z dostępem · Aktywna.

One filter: a name text box. Sort by record count descending by default —
`(brak danych)`, Katowice, Warszawa is a more useful order than alphabetical, and
Polish collation (`Intl.Collator("pl")`) applies when the user sorts by name.

### /lokalizacje/[id]

| Section | Content |
|---|---|
| Dane | Nazwa, Aktywna, and for id 1 the "brak danych" note |
| Wykorzystanie | Records as primary; records via the join table; the two rarely agree (spec 12) |
| **Dostęp — użytkownicy** | `UserLocation` grants, with a link to each user |
| **Dostęp — zakresy** | `UserAccessScope` rows with `dimension = LOCATION`, labelled as the newer mechanism |

Admin actions: Przyznaj dostęp · Odbierz dostęp · Zmień nazwę / aktywność.
Creating and deleting locations is out of scope — 35 rows in fourteen years and
nothing was ever deleted.

## Implementation

| Path | Action | Note |
|---|---|---|
| `app/(app)/lokalizacje/page.tsx` | modify | `requireAdmin`; counts; name filter; sort |
| `app/(app)/lokalizacje/[id]/page.tsx` | create | Usage and both grant lists |
| `features/lokalizacje/actions.ts` | create | `grantLocation`, `revokeLocation`, `updateLocation` |

Counts come from one grouped query per source, not per row:

```ts
prisma.contract.groupBy({ by: ["primaryLocationId"], where: { isDeleted: false }, _count: true })
prisma.contractLocationLink.groupBy({ by: ["locationId"], _count: true })
prisma.userLocation.groupBy({ by: ["locationId"], _count: true })
```

Three queries for the whole page.

## Verification

```sql
-- 1. All 35, with usage — the table above.
select l.id, l.name, l.active,
  (select count(*) from "Contract" c
     where c."primaryLocationId" = l.id and not c."isDeleted")        as as_primary,
  (select count(*) from "ContractLocationLink" k where k."locationId" = l.id) as linked,
  (select count(*) from "UserLocation" u where u."locationId" = l.id)         as grants
from "Location" l order by as_primary desc;
-- expected: 35 rows, all active; id 1 "(brak danych)" 8161; Katowice 2070;
-- Warszawa 1622; Łódź 1

-- 2. The audit's dropdown matches the dictionary exactly.
select count(*) from "Location";
-- expected: 35 — the audit's 34 names (§1.6) plus "(brak danych)"

-- 3. Nothing is unused, nothing is inactive.
select count(*) filter (where not active) inactive,
       count(*) filter (where not exists (
         select 1 from "Contract" c where c."primaryLocationId" = l.id)) unused_as_primary
from "Location" l;
-- expected: 0 | 0

-- 4. The two access mechanisms.
select (select count(*) from "UserLocation")                                     user_locations,
       (select count(distinct "userId") from "UserLocation")                     users,
       (select count(*) from "UserAccessScope" where dimension = 'LOCATION')     scope_grants,
       (select count(distinct "userId") from "UserAccessScope"
          where dimension = 'LOCATION')                                          scope_users;
-- expected: 30 | (see result) | 3 | 1

-- 5. No grant points at a missing location or user.
select (select count(*) from "UserLocation" u
          left join "Location" l on l.id = u."locationId" where l.id is null) orphan_loc,
       (select count(*) from "UserLocation" u
          left join "User" x on x.id = u."userId" where x.id is null)         orphan_user;
-- expected: 0 | 0
```

Manual checks:

- [ ] A non-admin gets 404 on `/lokalizacje` and `/lokalizacje/[id]`
- [ ] All 35 rows, sorted by record count, `(brak danych)` first with 8 161
- [ ] The detail page for id 1 carries the "brak danych" explanation
- [ ] Sorting by name puts Ł, Ś and Ż in Polish order, not after Z
- [ ] Katowice's detail page shows 2 070 primary records and its grant holders
- [ ] The two grant lists are visibly separate and labelled
- [ ] Granting and revoking a location changes what that user sees in the registers
      once spec 03 lands
- [ ] Łódź, with one record, renders normally
- [ ] The page issues three grouped queries, not 35 — check the query log
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Q63 — `UserLocation` or `UserAccessScope(LOCATION)`?** Two tables, 30 rows and
   3 rows, both about who sees which location. AND, OR, or is one of them dead?
   Spec 03's combination rule currently covers only the second. **Blocks spec 03's
   final shape.**
2. **Q64 — should `(brak danych)` be replaced with null over time?** 8,161 records
   point at it. Migrating them to null would make "has a location" answerable with
   `IS NOT NULL`, and it would change 41% of the register for a cosmetic gain.
   Recommend no — read it as "unknown" and leave it.
3. **Q65 — are the nine locations with fewer than 20 records still open sites?**
   Łódź has one record, Łazy and Olkusz four each. If a site has closed, its
   dictionary entry should be deactivated so it leaves the form's dropdown while
   staying on its historical records.

## Implementation notes (2026-09-24)

- **Gate.** `requireAdmin()` in `lib/authz.ts`: a 404 for anyone but an administrator,
  on both routes and in all three actions. The nav entry stays visible to everyone —
  a per-actor nav is spec 03's.
- **List.** Five columns, no pagination, `FilterBar` with "Nazwa" and "Kolejność"
  (most records first by default, "Nazwa (A–Ż)" with `Intl.Collator("pl")`). The
  dictionary plus the three `groupBy` queries: four statements whatever the row count,
  checked with Prisma query events. The name filter runs in memory over the 35 rows.
  `FilterBar.defaultPageSize` is now optional; without it there is no "Na stronie".
  "nieużywana" means neither primary nor linked. `description` is no longer shown.
- **Counts follow the spec's queries.** Primary excludes soft-deleted records;
  "Rekordy (dodatkowe)" counts every `ContractLocationLink` row, links of deleted
  records included. The legend under the table says so.
- **Detail.** Dane (with the "brak danych" note and its live count), Wykorzystanie
  (primary, linked, both at once, and per-register counts linking to
  `/umowy|projekty|ryzyko?location=ID`, which use the same primary-or-linked
  condition), the two access lists, and "Zmień nazwę / aktywność". Zakresy are
  read-only and point to Q63.
- **Actions** (`features/lokalizacje/actions.ts`). `grantLocation` is idempotent,
  `revokeLocation` asks for confirmation, and `updateLocation` trims the name, caps it
  at 45 characters (legacy `varchar(45)`) and rejects a case-insensitive duplicate.
  `description` follows a rename only where it duplicated the name. No audit trail yet:
  spec 23's `AccessAudit` should also log the grant and the revoke.
- **Decision: "(brak danych)" cannot be renamed or deactivated.** The new-record form
  finds it by name among active locations and makes it the default, so either change
  would silently alter every new record. The page explains this instead of showing
  the form.
- **Decision: the contract form keeps an inactive location.** `loadFormDictionaries`
  keeps the record's own `primaryLocationId`, as it already did for type, status,
  company and domain. Without it, deactivating a location (Q65) makes the edit form
  preselect "(brak danych)" and the next save writes it. Nothing else about how
  locations are edited or stored changed (spec 12 is blocked on Q54).
- **Open questions.** Q64 followed: no migration to null. Q65 left to humans: nothing
  was deactivated. Q63 not decided: both lists are shown separately.
- **Not verified on real data.** The 35-row figures and verification SQL 1–5 were run
  against the synthetic fixture (six locations), where the page matches the SQL. The
  "changes what that user sees" check waits on spec 03.
- **Tests.** `features/lokalizacje/usage.test.ts`: merging, the name filter, Polish
  order and the declined record counts ("8 161 rekordów").

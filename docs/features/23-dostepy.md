---
id: 23
title: Dostępy
group: D-supporting
status: todo
depends-on: [03, 04]
legacy-tables: [users, useraccess, access, admins, users_locations, users_groups]
prisma-models: [User, UserAccessScope, UserLocation, UserGroup, ContractUser, AccessAudit]
routes: ["/dostepy", "/dostepy/[id]"]
---

# 23 — Dostępy

## Why

This is the administration console for the authorization model spec 03 implements:
452 users, 11 administrators, 90 scope grants across seven dimensions, 30 location
grants, 428 group memberships and 39,665 per-record grants.

Two things make it urgent rather than routine. It **has no authorization of its
own** — any signed-in user can read the complete access map of the organisation at
`/dostepy` today. And once spec 03 starts enforcing those grants, this screen is
the only place anyone can see or change why a colleague cannot open a contract.

## Legacy behaviour

`audyt §3.–8.`: **`Access deny!`** at `/cru/index.php/access`. Never observed.
Grouped in `§8` with Grupy and Lokalizacje as the permissions and administration
modules.

### The metamodel

Spec 03 documents it in full. In short: the `access` table declares ten
**dimensions** along which visibility can be restricted, each naming a dictionary
table and the contract column it filters, and `useraccess(user_id, key, access_id)`
grants one user one value along one dimension.

That is an unusually good design for 2012 — a data-driven ACL rather than hard-coded
roles — and it is why this module exists.

## Data

### Users

| | Value |
|---|---|
| Rows | **452** |
| Administrators | **11** |
| `active = true` | **1** |
| Placeholders (`login LIKE 'legacy-%'`) | **451** |
| With an e-mail address | **0** |

The eleven administrators:

```
15, 93, 512, 539, 50463, 50464, 50495, 50530, 51045, 51316   ← all placeholders, inactive
1000000  ← login "admin", the only real, active account
```

So **ten of the eleven administrators cannot sign in**, and the eleventh is our own
service account. Until the `am_admin` export arrives (Q1), this module administers
a directory of 451 people whose names, logins and addresses we do not have.

### Scope grants

`UserAccessScope`, 90 rows:

| Dimension | Grants | Distinct users |
|---|---|---|
| **DOMAIN** (Rodzaj umowy) | **54** | **20** |
| **COMPANY** (Spółka) | 21 | 18 |
| BUSINESSLINE | 9 | 8 |
| LOCATION | 3 | 1 |
| NATURE (Charakter umowy) | 1 | 1 |
| NOTICE_PERIOD | 1 | 1 |
| **PROJECT_MODULE** | 1 | 1 |

Three of the ten declared dimensions have **zero** grants (Q12), and three of the
seven in use have exactly one.

Two dimensions behave unlike the rest. **NOTICE_PERIOD** is spec 03's documented
legacy bug — the `access` row intended for "document type" filters
`notice_period_id` instead (Q6), and it is dormant because one user holds it.
**PROJECT_MODULE** is not a filter at all but a module entitlement: it grants
access to Projekty, and exactly one user has it.

### Other grants

| | Rows |
|---|---|
| `UserLocation` | 30 |
| `UserGroup` | 428 |
| **`ContractUser`** | **39,665** — 17,042 editors, 22,623 read-only |

### The coverage problem

Spec 03's central finding, restated because this is the screen that would fix it:
**428 of 452 users hold no scope grant at all.** Only 24 users are scoped. That is
what forces the "no grant in a dimension = unrestricted in that dimension" reading —
any other interpretation locks 95% of the directory out of the whole register.

## Legacy quirks

### Quirk: no authorization — the access map is public to every session

- **Current:** `app/(app)/dostepy/page.tsx` and `[id]/page.tsx` require a session and
  nothing more. The list shows every user with their grant counts; the detail page
  resolves each grant to a dictionary name (`dostepy/[id]/page.tsx:25-70`).
- **Why it matters:** this is the map of who can see what, including which
  administrators exist. Handing it to every account is the single worst
  authorization gap in the application, worse than the file route in spec 18,
  because it needs no ingenuity to exploit — you just open the page.
- **We do:** `requireAdmin` on both routes. **Do this before anything else in this
  spec**; it is a two-line change and does not wait on the directory export.
- **Sign-off:** not needed.

### Quirk: ten of eleven administrators are placeholders who cannot sign in

- **Data:** `active = true` on exactly one row — id 1000000, login `admin`.
- **Why it matters:** the administrator list is also the notification recipient list
  in legacy (spec 15's trigger fans out to all admins), so the two features are
  coupled through a set that currently contains ten unusable accounts.
- **We do:** show the administrator flag and the active flag as **separate**
  columns, and badge an admin who is inactive as **"nie może się zalogować"**.
  Do not deactivate or promote anybody automatically. The directory export (Q1)
  resolves it.
- **Sign-off:** not needed.

### Quirk: promotion to admin does not take effect until re-login

- **Current:** `role` is baked into the JWT at sign-in (`lib/auth.ts:36,47`).
  Granting someone `isAdmin` changes the database and not their session.
- **Why it matters:** an administrator grants a colleague admin, the colleague
  reloads and still sees nothing, and both conclude the feature is broken.
- **We do:** say so in the UI — after a change to the admin flag, show
  *"Zmiana zacznie działać po ponownym zalogowaniu użytkownika."* The alternative
  (reading the role from the database on every request) costs a query per request
  for a change that happens a handful of times a year.
- **Sign-off:** not needed.

### Quirk: 16 administrators were revoked with no record

- **Legacy:** the `admins` table is a plain membership list with no history — spec
  03 records 16 revocations inferred from the ids present in `contracthistory` but
  absent from `admins`.
- **We do:** write an audit row for every grant and revocation **we** make —
  a new `AccessAudit` table, because none exists and the change log
  (`ContractHistory`) is scoped to contracts. Nothing retroactive.
- **Sign-off:** not needed.

### Quirk: three dimensions have no grants and one is a known bug

- **Data:** three of the ten `access` dimensions have zero rows; NOTICE_PERIOD's
  single grant is the mis-wired "document type" filter (spec 03's Q6).
- **We do:** show all seven dimensions that have grants; hide the three empty ones
  behind **"pokaż nieużywane wymiary"**. Render NOTICE_PERIOD with a warning badge
  naming the bug, so an administrator does not grant it by accident and silently
  filter a colleague's register by notice period.
- **Sign-off:** not needed. Whether to build the three empty dimensions is Q12.

### Quirk: two mechanisms for location access

- Carried from spec 22: `UserLocation` (30 rows) and `UserAccessScope(LOCATION)`
  (3 rows, 1 user).
- **We do:** the user detail page shows both, separately labelled. Spec 03 decides
  the semantics (Q63).
- **Sign-off:** not needed.

## UI

### /dostepy

`requireAdmin`. The register-page recipe (spec 05) — 452 rows, default page size 50.

Filters: **Nazwisko / login** (text), **"tylko administratorzy"**,
**"tylko aktywni"**, **"tylko z ograniczeniami"** (the 24 scoped users),
**Grupa** (select over the 15).

Columns, extending what `dostepy/page.tsx:68` already loads:

| Column | Source |
|---|---|
| Użytkownik | `userLabel`, with the login beneath |
| Aktywny | `active` — **1 of 452** today |
| Administrator | `isAdmin`, badged "nie może się zalogować" when inactive |
| Zakresy | `UserAccessScope` count, "—" when unrestricted |
| Lokalizacje | `UserLocation` count |
| Grupy | `UserGroup` count |
| Rekordy | `ContractUser` count |
| Opinie | existing |

The "Zakresy" column is the one that matters after spec 03: an empty cell means
*unrestricted*, which is the opposite of what an empty cell usually implies. Render
it as **"bez ograniczeń"** rather than "0" or "—".

### /dostepy/[id]

The existing page already resolves grant values to dictionary names
(`resolveScopeValues`, `dostepy/[id]/page.tsx:25-70`) — good, and reused.

| Section | Content |
|---|---|
| Dane | Login, imię, nazwisko, e-mail, aktywny, administrator, `loginCount` (spec 04) |
| **Zakresy dostępu** | Per dimension: the granted values, or **"bez ograniczeń"** |
| Lokalizacje | `UserLocation`, plus `UserAccessScope(LOCATION)` separately |
| Grupy | Memberships, plus former ones (spec 21) |
| Rekordy | `ContractUser` grants, split editor / read-only, paginated — one user has 17,035 |
| **Co widzi ten użytkownik** | The record count `contractScopeWhere(user)` yields |

That last section is the reason to build the module. An administrator's real
question is never "which dimensions are granted" but "why can Anna not open this
contract", and a live count plus a link to the scoped register answers it directly.

Admin actions: Przyznaj zakres · Odbierz zakres · Przyznaj/odbierz lokalizację ·
Dodaj/usuń grupę · Ustaw administratora · Aktywuj/dezaktywuj.

## Implementation

| Path | Action | Note |
|---|---|---|
| `app/(app)/dostepy/page.tsx` | modify | **`requireAdmin`**; filters; "bez ograniczeń" |
| `app/(app)/dostepy/[id]/page.tsx` | modify | **`requireAdmin`**; the "what they see" section; actions |
| `features/dostepy/actions.ts` | create | `grantScope`, `revokeScope`, `setAdmin`, `setActive`, plus the location and group actions |
| `prisma/schema.prisma` | modify | `AccessAudit` — who changed which grant for whom, and when |
| `lib/authz.ts` | modify | `requireAdmin()` if it does not already exist |

### `AccessAudit`

```prisma
/// Our own record of access changes. Legacy kept none — 16 administrators were
/// revoked with no trace (spec 03). Nothing retroactive; this starts empty.
model AccessAudit {
  id          Int      @id @default(autoincrement())
  subjectId   Int      // whose access changed
  actorId     Int      // who changed it
  kind        String   // "scope" | "location" | "group" | "admin" | "active"
  detail      String   // dimension + value, group name, or the flag
  granted     Boolean
  createdAt   DateTime @default(now())

  @@index([subjectId, createdAt])
}
```

### Order of work

1. **`requireAdmin` on both routes.** Two lines, no dependencies, closes the gap.
2. The "bez ograniczeń" rendering — it prevents the most likely misreading of the
   screen once spec 03 lands.
3. `AccessAudit` and the write actions.
4. The "what this user sees" count, which needs `contractScopeWhere` from spec 03.

## Verification

```sql
-- 1. The directory, and how little of it is usable.
select count(*) total, count(*) filter (where "isAdmin") admins,
       count(*) filter (where active) active,
       count(*) filter (where login like 'legacy-%') placeholders,
       count(email) with_email
from "User";
-- expected: 452 | 11 | 1 | 451 | 0

-- 2. The eleven administrators.
select id, login, "isAdmin", active from "User" where "isAdmin" order by id;
-- expected: 10 inactive placeholders + id 1000000 "admin", active

-- 3. Scope grants by dimension.
select dimension, count(*) grants, count(distinct "userId") users
from "UserAccessScope" group by 1 order by 2 desc;
-- expected: DOMAIN 54/20 | COMPANY 21/18 | BUSINESSLINE 9/8 | LOCATION 3/1
--           | NATURE 1/1 | NOTICE_PERIOD 1/1 | PROJECT_MODULE 1/1

-- 4. Coverage — why "no grant" must mean "unrestricted".
select (select count(*) from "User")                                unrestricted_total,
       (select count(distinct "userId") from "UserAccessScope")     scoped;
-- expected: 452 | 24    → 428 users hold no grant at all

-- 5. Every other grant table.
select (select count(*) from "UserLocation")  locations,
       (select count(*) from "UserGroup")     memberships,
       (select count(*) from "ContractUser")  record_grants,
       (select count(*) from "ContractUser" where not "readOnly") editors;
-- expected: 30 | 428 | 39665 | 17042

-- 6. No grant points at a missing user.
select count(*) from "UserAccessScope" s
left join "User" u on u.id = s."userId" where u.id is null;
-- expected: 0
```

Manual checks:

- [ ] **A non-admin gets 404 on `/dostepy` and `/dostepy/[id]`** — the first thing
      to verify, and the reason this spec exists
- [ ] The list shows 452 users, 50 per page
- [ ] A user with no scope grants shows **"bez ograniczeń"**, not "0" or "—"
- [ ] "tylko z ograniczeniami" returns 24 users
- [ ] The ten inactive administrators are badged "nie może się zalogować"
- [ ] A NOTICE_PERIOD grant carries the warning naming the legacy bug
- [ ] The three dimensions with no grants appear only under "pokaż nieużywane wymiary"
- [ ] A user's page resolves every grant to a dictionary **name**, not an id
- [ ] The user with 17,035 record grants paginates rather than rendering them all
- [ ] "Co widzi ten użytkownik" matches the row count that user actually sees in
      `/umowy` once spec 03 is live
- [ ] Granting and revoking writes an `AccessAudit` row naming both parties
- [ ] Setting the admin flag shows the "po ponownym zalogowaniu" note
- [ ] Both location mechanisms are shown, separately labelled
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Q66 — who administers access after cutover?** Ten of the eleven legacy
   administrators are placeholders. Somebody real has to hold the flag on day one,
   and it should not be the `admin` service account. Needs a name, and it depends
   on Q1.
2. **Q12 carries over** — dimensions 6 (document type), 7 (trade) and 8 (related
   entity) have zero grants. Build the UI for them at all?
3. **Q6 carries over** — the NOTICE_PERIOD/document-type mis-wiring. Fix it, or
   reproduce it?
4. **Q63 carries over** — `UserLocation` versus `UserAccessScope(LOCATION)`.
5. **Q1 carries over and blocks most of this** — without the `am_admin` export
   every row on this screen reads `legacy-50463`, and an administrator cannot tell
   whose access they are changing.

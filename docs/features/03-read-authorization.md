---
id: 03
title: Read authorization
group: A-foundations
status: todo
depends-on: [01]
legacy-tables: [access, useraccess, users_locations, contract_users, admins, contract_has_location]
prisma-models: [UserAccessScope, UserLocation, ContractUser, AccessDefinition, User, Contract]
routes: ["/umowy", "/projekty", "/ryzyko", "/dostepy", "/grupy", "/lokalizacje", "/api/files/[...key]"]
---

# 03 — Read authorization

> **Where we stand (2026-09-24): not started.** Nothing in this spec is built yet.
>
> - **Already in place:** `canReadContract` in `nextjs_space/lib/authz.ts` is the single read hook, and the file download route (`/api/files/[...key]`, spec 18) already calls it. Today it lets any signed-in user read live records; soft-deleted records are admin-only.
> - **Waiting on:** **Q18** (is `contract_users` a visibility list or only an ownership list?) decides the whole design. Also Q6, Q12, Q54 and Q63.
> - **Next step:** once Q18 is answered, implement the scope inside `canReadContract` and in the register queries (`lib/contracts/scope.ts`).

## Why

The application has no read authorization at all. `lib/authz.ts` gates writes; every
register, every detail page and every stored file is served to any authenticated
session. Legacy restricted visibility along ten dimensions and by location, and the
grants are sitting in our database unused.

This is the single largest functional gap between the two systems, and it is a
security gap rather than a cosmetic one: `/dostepy` currently shows every user's
account, group membership and access scopes to anyone who logs in, and
`GET /api/files/[...key]` serves any of the 39,272 stored documents to any session.

## Legacy behaviour

**This module was never observed running.** The auditor's account was denied access
to Dostępy, Grupy and Lokalizacje (`audyt §10`). Everything below is derived from the
dump, and the combination rules are marked `[INFERRED]` where the data does not
settle them.

### The access metamodel

Legacy stores its visibility rules as data. `access` (10 rows, `cru.sql`, table
imported by spec 01 as `AccessDefinition`) defines the dimensions; `useraccess`
(90 rows) assigns them per user.

| id | `AccessDimension` | Filters `contract.` | Dictionary | Grants | Users |
|---|---|---|---|---|---|
| 1 | `COMPANY` | `company_id` | `contract_company` | 21 | 18 |
| 2 | `DOMAIN` | `domain_id` | `contract_domain` | 54 | 20 |
| 3 | `LOCATION` | `location_id` **+ `contract_has_location`** | `contract_location` | 3 | 1 |
| 4 | `NATURE` | `contract_nature_id` | `contract_nature` | 1 | 1 |
| 5 | `NOTICE_PERIOD` | `notice_period_id` | `contract_notice_period` | 1 | 1 |
| 6 | `DOCUMENT_TYPE` | **`notice_period_id`** ← bug | `contract_type` | 0 | 0 |
| 7 | `TRADE` | `trade_id` | `trade` | 0 | 0 |
| 8 | `CONNECTED_ENTITY` | `companies_connected` | `companies_connected` | 0 | 0 |
| 9 | `PROJECT_MODULE` | `project` | `project` | 1 | 1 |
| 10 | `BUSINESSLINE` | `buissnesline_id` | `buissnesline` | 9 | 8 |

The legacy app iterates `access`, and for each dimension where the user holds
`useraccess` rows it appends `WHERE contract.<name> IN (<granted keys>)` to the
contract list query.

Two things the frozen `enum AccessDimension` (`prisma/schema.prisma:42`) does not
carry, and which spec 01 restores as `AccessDefinition`:

- **`column`** — which dictionary field the admin's grant picker renders
  (`company_short` for companies, `period_name` for notice periods, and so on).
- **`has_many`** — set on **location only**, to `contract_has_location`. A
  location-restricted user must match through the many-to-many table, not just
  `contract.location_id`. With 21,636 link rows against 20,584 primary-location
  values, filtering on the primary FK alone would hide contracts the user is
  entitled to see.

### Who actually holds grants

| | Count |
|---|---|
| Users in the directory | 452 |
| Users with at least one `UserAccessScope` row | 24 |
| Users with at least one `UserLocation` row | 26 |
| Users flagged `isAdmin` | 11 |

**428 of 452 users hold no access-scope grant at all.** This forces the reading of
the rule: *a dimension with no grants is unrestricted*, not "denied". The opposite
reading would leave almost the entire company unable to see anything, which cannot be
what a system with 20,626 contracts and 452 accounts was doing. `[INFERRED]` — but
the alternative is excluded by the data.

### How grants combine

`[INFERRED]`, from the shape of the grants:

- **Within a dimension: OR.** User 641 holds 16 `DOMAIN` grants (ids 2, 5, 8, 9, 11,
  13, 15, 17, 23, 24, 25, 31, 37, plus 3, 12, 30 via other rows). Sixteen separate
  AND-ed equality filters on one column would match nothing.
- **Across dimensions: AND.** User 50962 holds `COMPANY 2`, `DOMAIN 2`, `LOCATION 9/5/3`,
  `NATURE 5`, `NOTICE_PERIOD 4`, `BUSINESSLINE 3`. The natural reading is
  "AMDSP contracts, in domain 2, at one of three locations, …" — a narrowing, which
  is what "zawężenie dostępu" means.

So: `visible ⟺ ∀ dimensions d : (user has no grant in d) ∨ (contract.d ∈ grants(d))`.

### `users_locations` is a second, separate restriction

30 rows, 26 users (`users_locations` → `UserLocation`). Distinct from
`useraccess` dimension 3, which only one user holds. `[INFERRED]` that it narrows the
same way, applied against the same location columns. Worth confirming, because two
overlapping location mechanisms is unusual and one of them may be vestigial.

### `contract_users` is row-level, and mostly a blanket grant

39,665 rows. Distribution is extremely skewed:

| User | `readOnly` | Contracts |
|---|---|---|
| 51126 | `false` | **17,035** |
| 50260 | `true` | 1,195 |
| 50209 | `true` | 863 |
| 51056 | `true` | 799 |
| 50400 | `true` | 552 |
| … | | |

User 51126 holds an editor grant on 17,035 of 20,626 contracts — that is not an
ownership list, it is an administrative blanket. `lib/contract-access.ts:4-14`
already records the consequence for the *owner column*: `readOnly` grades editing
rights inside the assignee list, it does not define membership, so both the "Właściciel
umowy" display and the owner filter must read the whole list.

The open question is whether `contract_users` also acts as a **visibility** list in
legacy — i.e. whether a user sees only contracts they are assigned to. Evidence
against: 39,665 assignments across 20,626 contracts is roughly two per contract, far
too few to give 452 users a working register. Evidence for: the blanket grant on
51126 looks exactly like a workaround for such a rule. `[UNKNOWN — ask Mati]`, and
it changes the design materially. See Q18.

### Admin bypass

`admins` (10 rows in the dump, 11 `isAdmin` in our data after the seed account)
bypasses the ACL entirely. `canEditContract` (`lib/authz.ts:43`) already implements
that for writes.

## Legacy quirks

### Quirk: access dimension 6 filters by the wrong column

- **Legacy:** `access` row 6 is `model = 'type'`, `table = 'contract_type'`,
  `column = 'contract_type'` — but `name = 'notice_period_id'`, where every other row
  names the column its own dictionary keys. Row 5 (`period`) also names
  `notice_period_id`, correctly.
- **Why it is wrong:** a user granted "document type" access would be filtered by
  notice period instead. The grant picker would show them `Umowa`, `Aneks`, … and the
  system would filter on `NoticePeriod` ids of the same numeric value.
- **Why it has not fired:** no `useraccess` row has `access_id = 6`. The bug is
  dormant.
- **We do:** fix it — `DOCUMENT_TYPE` filters `documentTypeId`.
- **Sign-off:** **REQUIRED** (Q6). It is a behaviour change on paper, even though no
  user is affected today. Fixing it silently would mean the first person granted
  document-type access gets behaviour that does not match any historical precedent.

### Quirk: two of the ten dimensions have no dictionary table

- **Legacy:** dimensions 8 (`companies_connected`) and 9 (`project`) point at
  two-row tables whose only purpose is to label `0` / `1`.
- **Why it matters:** `app/(app)/dostepy/[id]/page.tsx:25-29` already documents that
  those two cannot be resolved and shows raw ids. Also `id = 0` is a real row in both,
  so `lib/utils.ts:13` `intParam` — which accepts positive integers only — would
  reject a legitimate grant value.
- **We do:** hardcode the two label pairs as a constant rather than creating tables
  (spec 01), and handle `valueId = 0` explicitly wherever scope values are parsed.
- **Sign-off:** not needed.

### Quirk: `PROJECT_MODULE` is a module entitlement, not a record filter

- **Legacy:** dimension 9 filters `contract.project`, which after spec 01 is a
  four-valued module discriminator, not a boolean. One user (50917) holds
  `access_id = 9, key = 1` — the grant that made the Projekty module visible at all.
  This is what produced "Access deny!" for the auditor.
- **Note:** `audyt §2` says five users had this grant; the dump shows one
  (`useraccess` row 112). The audit's figure predates the dump. Trust the dump.
- **We do:** treat `PROJECT_MODULE` as a nav-level and register-level entitlement
  rather than a per-row filter, since it selects a module rather than narrowing within
  one.
- **Sign-off:** not needed, but it interacts with Q12.

## Implementation

### Files

| Path | Action | Note |
|---|---|---|
| `lib/authz.ts` | modify | Add `contractScopeWhere`, `canReadContract`, `requireAdmin` |
| `lib/access-scope.ts` | create | The scope query builder, driven by `AccessDefinition` |
| `app/(app)/umowy/page.tsx` | modify | AND the scope into `buildWhere` |
| `app/(app)/projekty/page.tsx` | modify | same |
| `app/(app)/ryzyko/page.tsx` | modify | same |
| `app/(app)/umowy/[id]/page.tsx`, `projekty/[id]`, `ryzyko/[id]` | modify | 404 when out of scope |
| `app/api/files/[...key]/route.ts` | modify | Resolve the key to an `Attachment`, then check its contract |
| `app/(app)/dostepy/page.tsx`, `dostepy/[id]`, `grupy/*`, `lokalizacje` | modify | `requireAdmin` gate |
| `features/kontrakty/form-page.tsx` | modify | Also honour `Contract.isEditable` |
| `features/kontrakty/actions.ts` | modify | `assertCanEditContract` also rejects frozen records |

### The scope builder

One function, used by every register and every detail lookup:

```ts
/**
 * Prisma filter narrowing the contract set to what this actor may see.
 * Returns {} for administrators and for users with no grants in any dimension.
 */
export async function contractScopeWhere(actor: Actor): Promise<Prisma.ContractWhereInput>;
```

Rules, in order:

1. `actor.isAdmin` → `{}`.
2. Load the actor's `UserAccessScope` rows, grouped by dimension.
3. For each dimension **that has at least one grant**, emit one `IN` condition against
   the column named by `AccessDefinition.contractColumn`. Dimensions with no grants
   emit nothing.
4. `LOCATION` emits an `OR` over the primary FK **and** the link table, because
   `AccessDefinition.joinTable` is set:
   ```ts
   { OR: [ { primaryLocationId: { in: ids } },
           { locations: { some: { locationId: { in: ids } } } } ] }
   ```
5. `UserLocation` rows, if any, apply the same OR shape as a separate AND-ed clause.
6. `PROJECT_MODULE` is handled by the nav and the register scope, not here.
7. Combine with `AND`.

Reuse `lib/contract-access.ts` for assignee lookups and `ASSIGNEE_SELECT`; do not add
a second user-select shape.

### Detail pages

A record outside the actor's scope must render `notFound()`, not "access denied" —
telling someone a contract exists is itself a disclosure. The three `[id]` pages
currently differ: `projekty/[id]/page.tsx:128` guards on `status.kind`, the other two
do not guard at all (spec 09 unifies that; this spec adds the scope check to the
shared path).

### File downloads

`app/api/files/[...key]/route.ts:11` checks the session and nothing else. The key is
content-addressed (`attachments/<md5>.<ext>`), so it is not guessable, but keys appear
as plain URLs in every preview — a user who can see one contract can hand its key to
someone who cannot. Fix: look the key up in `Attachment.storageKey`, then apply
`canReadContract` to its contract. Unbound attachments (`contractId = null`, the
draft-upload case) fall back to the existing `formSession` match, as the POST/DELETE
handlers already do (`app/api/attachments/route.ts:125`).

### `Contract.isEditable`

Legacy `edittable`, default 1, **`0` on 6,829 of 20,624 records** — a third of the
archive is frozen. It is imported (`scripts/legacy/import.ts:643`) and consulted by
nothing. It is a real permission gate: add it to `canEditContract` so a frozen record
is read-only for everyone except an administrator, and grey the Edycja button.

### Admin gating

`/dostepy`, `/dostepy/[id]`, `/grupy`, `/grupy/[id]`, `/lokalizacje` expose the user
directory, group membership and per-user ACLs with no gate. Add `requireAdmin` and
hide the nav entries for non-admins — `lib/nav.ts` already has the mechanism
(`ready: false` renders a dimmed non-link), but this needs a per-actor variant rather
than a static flag.

## Verification

```sql
-- 1. Grant census. Must match the dimension table in this spec.
select dimension, count(*) grants, count(distinct "userId") users
from "UserAccessScope" group by 1 order by 2 desc;
-- expected: DOMAIN 54/20, COMPANY 21/18, BUSINESSLINE 9/8, LOCATION 3/1,
--           NATURE 1/1, NOTICE_PERIOD 1/1, PROJECT_MODULE 1/1

-- 2. Coverage: most users are unrestricted, which is why "no grant = unrestricted".
select (select count(distinct "userId") from "UserAccessScope") as scoped,
       (select count(distinct "userId") from "UserLocation")    as located,
       (select count(*) from "User")                            as total,
       (select count(*) from "User" where "isAdmin")             as admins;
-- expected: 24 | 26 | 452 | 11

-- 3. Location grants must widen through the link table, not narrow.
--    Compare the two filters for user 50962 (locations 3, 5, 9).
select count(*) from "Contract" where "primaryLocationId" in (3,5,9);
select count(*) from "Contract" c where c."primaryLocationId" in (3,5,9)
   or exists (select 1 from "ContractLocationLink" l
              where l."contractId" = c.id and l."locationId" in (3,5,9));
-- the second must be >= the first; the difference is what the naive filter would hide

-- 4. Frozen records.
select "isEditable", count(*) from "Contract" group by 1;
-- expected: false 6829, true 13797 (total 20626)
```

Manual checks:

- [ ] Sign in as an unrestricted non-admin — register counts match the unfiltered
      totals
- [ ] Sign in as user 50962 (once the directory export lands) — Umowy shows only
      AMDSP / domain 2 / locations 3, 5, 9, and a contract linked to location 5 only
      through `ContractLocationLink` is visible
- [ ] Open a detail page for a record outside scope by URL — 404, not 403, and no
      identifier leaks into the response
- [ ] Copy a file URL from a visible contract, request it as a user who cannot see
      that contract — 404
- [ ] `/dostepy`, `/grupy`, `/lokalizacje` as a non-admin — not reachable, not in nav
- [ ] Open Edycja on a record with `isEditable = false` — blocked, with a clear reason
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Q6 — access dimension 6.** Fix `DOCUMENT_TYPE` to filter `documentTypeId`, or
   reproduce legacy's `notice_period_id`? Nobody holds the grant, so fixing costs
   nothing today. Recommend fixing.
2. **Q12 — dimensions 6, 7, 8 have zero grants.** Build the full ten, or only the
   seven in use? Building all ten is a handful of extra rows in one lookup table;
   recommend all ten so the admin UI in spec 23 is complete.
3. **Q18 — is `contract_users` a visibility list?** If yes, a user sees only assigned
   contracts and the scope dimensions narrow further. If no, it is purely an
   ownership and edit-rights list and visibility comes from the dimensions alone.
   The 17,035-row blanket grant on user 51126 suggests the former with a workaround.
   **This changes the design and must be answered before build.**
4. **`users_locations` vs access dimension 3.** Two overlapping location mechanisms,
   26 users on one and 1 on the other. Are both live, or is one vestigial?
5. **What happens to `[UNKNOWN]` users during parallel run?** Until the `am_admin`
   export arrives (Q1) every account is a placeholder, so none of this can be tested
   against real grants. The scope builder can be unit-tested with synthetic users in
   the meantime.

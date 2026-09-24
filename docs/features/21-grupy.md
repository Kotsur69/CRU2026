---
id: 21
title: Grupy
group: D-supporting
status: in-progress
depends-on: [03, 04]
legacy-tables: [group, users_groups, users_groups_history, opiniontypes]
prisma-models: [Group, UserGroup, UserGroupHistory, OpinionType, Businessline, User]
routes: ["/grupy", "/grupy/[id]"]
---

# 21 — Grupy

> **Where we stand (2026-09-24): in progress (interrupted).** The group screens and membership editing are built; the links to `/opinie` are not.
>
> - **Done:**
>   - admin-only `/grupy` list and `/grupy/[id]` detail (404 for others);
>   - "Dodaj członka", "usuń" and "Edytuj";
>   - membership history rows with date, author and action (migration `20260924121000_group_history_audit`);
>   - "Byli członkowie";
>   - "Grupy" hidden from the menu for non-admins.
> - **Not done:** links from opinion types to `/opinie?type=N`. They are plain text for now.
> - **Waiting on:**
>   - spec 16's `/opinie`, which is held for Q20;
>   - member names stay `legacy-<id>` until Q1;
>   - Q60 and Q61 recorded; Q62 followed (no group create or delete).
> - **Next step:** re-run the build, smoke test and browser flows on the merged branch, which was only typechecked and unit-tested after the final rebase. Then add the `/opinie` links when that screen exists. Details are in "Implementation notes" at the end.

## Why

Fifteen functional groups with 428 memberships. Eight of them are the answer to
"who should be asked for this kind of opinion" (spec 16), two carry a manager and a
businessline that exist nowhere else in the schema, and one — "Tylko do odczytu" —
looks like a role.

The module is built read-only (`app/(app)/grupy/page.tsx`) and, like the other two
administration screens, **exposes everyone's memberships to any signed-in user**.

## Legacy behaviour

`audyt §3.–8.`: **`access deny`** at `/cru/index.php/groups`. Never observed. The
audit's indirect note is one line: *"Grupy / Lokalizacja dostępy / Dostępy — moduły
uprawnień/administracji … To odpowiednik modelu ról legacy."*

### The table

`cru.sql` — `group` (a reserved word, hence the backticks everywhere):

```sql
CREATE TABLE IF NOT EXISTS `group` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(50) COLLATE utf8_polish_ci DEFAULT NULL,
  `active` int(1) DEFAULT '1',
  `owner_id` int(11) DEFAULT NULL,
  `buissnesline_id` int(2) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=17;
```

`AUTO_INCREMENT=17` with 15 surviving rows — **id 6 was deleted** and id 16 is the
highest in use.

## Data

### All fifteen groups

| id | Name | Active | Owner | Buissnesline | Members | Opinion type |
|---|---|---|---|---|---|---|
| 1 | Dział prawny | ✓ | — | — | 5 | **DPA** (5) |
| 2 | Właściciele umów | ✓ | — | — | **343** | **Właściciel umowy** (1) |
| 3 | Opiniujący | ✓ | — | — | 10 | — |
| 4 | Umowy powiązane | ✗ | — | — | 1 | — |
| 5 | Tylko do odczytu | ✓ | — | — | 1 | — |
| 7 | ograniczony dostęp rodzaj umowy | ✗ | — | — | 9 | — |
| 8 | Dział ryzyka | ✓ | — | — | 11 | **CreditRisk** (4) |
| 9 | Przełożeni | ✓ | — | — | 31 | **Przełożony** (2) |
| 10 | Dyrektor Klastra | ✓ | — | — | **2** | **Dyrektor Klastra** (3) |
| 11 | Supplychain | ✓ | — | — | 3 | — |
| 12 | **Supplychain grupa D. Pruszkowski** | ✓ | **495** | **2** | 5 | — |
| 13 | **Supplychain grupa D. Bekiersz** | ✓ | **50272** | **3** | 4 | — |
| 14 | CEO Dystrybucja | ✓ | — | — | 1 | **CEO Dystrybucja** (9) |
| 15 | Dyrektor Zespołu Projektów | ✓ | — | — | 1 | **Dyr. Zespołu Projektów** (8) |
| 16 | Dyrektor Sieci Sprzedaży | ✓ | — | — | 1 | **Dyr. Sieci Sprzedaży** (7) |

Two are inactive: **4 "Umowy powiązane"** and **7 "ograniczony dostęp rodzaj
umowy"** — the latter is named after an access restriction, and 9 people are still
in it.

### Three kinds of group in one table

The table mixes three unrelated concepts, which is why nothing about it reads
cleanly:

1. **Opinion routing** — 8 groups referenced by `opiniontypes.group_id` (spec 16).
   Note the sizes: "Właściciele umów" has 343 members, "Dyrektor Klastra" has 2.
   And spec 16 establishes the link is a **hint, not a constraint** — 2,545 of 2,615
   Dyrektor Klastra requests went to non-members.
2. **Access roles** — "Tylko do odczytu" (1 member), "ograniczony dostęp rodzaj
   umowy" (9, inactive). Neither is enforced anywhere in the current code, and
   neither appears in the `access` metamodel of spec 03. They are roles that predate
   or sit beside that model.
3. **Manager-scoped teams** — groups 12 and 13, the only two with an `owner_id`
   **and** a `buissnesline_id`:

   | Group | Owner | Businessline | Members |
   |---|---|---|---|
   | 12 Supplychain grupa D. Pruszkowski | 495 | 2 | 5 |
   | 13 Supplychain grupa D. Bekiersz | 50272 | 3 | 4 |

   A named manager, a business line, a small team. **That pairing is encoded
   nowhere else in the schema** — no other group has either column set, and nothing
   in the code reads them. Together with group 11 "Supplychain" they are the only
   trace of the Supply chain module in the database (spec 26).

### Membership

| | Value |
|---|---|
| `users_groups` rows | **428** |
| `users_groups_history` rows | **391** |
| Users in at least one group | see verification |

`UserGroupHistory` is append-only and **has no timestamp** — legacy stored only
`(user_id, group_id)`, so 391 past memberships are recorded with no indication of
when they started, ended, or who changed them.

## Legacy quirks

### Quirk: the module exposes everyone's memberships to any signed-in user

- **Current:** `/grupy` and `/grupy/[id]` require a session and nothing else.
- **We do:** `requireAdmin` on both, as spec 03 specifies for all three
  administration screens.
- **Sign-off:** not needed.

### Quirk: `UserGroupHistory` has no timestamps and never will

- **Legacy:** `users_groups_history(user_id, group_id)` — that is the whole table.
- **Why it matters:** 391 rows record that somebody was once in a group and answer
  no question about when or why. An access audit cannot use them.
- **We do:** display them as "byli członkowie" with no date, explicitly labelled
  *"legacy — brak dat"*. Add `changedAt`, `changedById` and `action` columns for rows
  **we** write, leaving them null on the 391. Never infer a date.
- **Sign-off:** not needed.

### Quirk: two groups carry a manager and a businessline that nothing reads

- **Data:** groups 12 and 13 only.
- **Why it matters:** an owner plus a business line is a scoping rule — "this
  manager approves for this line" — and it is the only such rule in the schema. If
  Supply chain (spec 26) is ever built, these two rows are the requirement.
- **We do:** display both fields on the detail page, and change nothing. Flag them
  in spec 26 as the one piece of hard evidence about that module.
- **Sign-off:** not needed.

### Quirk: two groups are inactive and one of them still has nine members

- **Data:** group 4 "Umowy powiązane" (1 member), group 7 "ograniczony dostęp rodzaj
  umowy" (9 members), both `active = 0`.
- **We do:** keep them, hide them from any picker, show them on `/grupy` behind a
  **"pokaż nieaktywne"** checkbox. Removing memberships from an inactive group would
  destroy the only record of who once held that restriction.
- **Sign-off:** not needed.

### Quirk: "Tylko do odczytu" is a role wearing a group's clothes

- **Data:** group 5, active, **1 member**.
- **Why it matters:** a group named "read only" is an authorization rule, and spec
  03's model is built on the `access` table and `ContractUser`, neither of which
  knows about it. One user is affected.
- **We do:** nothing in this spec. Record it as a question for spec 03 (Q60) — if it
  is enforced in legacy, spec 03's model is incomplete.
- **Sign-off:** not needed.

## UI

### /grupy

`FilterBar` + table, as today, plus `requireAdmin`. 15 rows, so no pagination.

Columns: Nazwa · Aktywna · **Właściciel** · **Buissnesline** · Członkowie (count) ·
Rodzaje opinii. Filter: name text, "pokaż nieaktywne".

The existing page already renders the opinion types per group
(`grupy/page.tsx:64-66`), which is the right idea — it is the one column that
explains what a group is for.

### /grupy/[id]

| Section | Content |
|---|---|
| Dane | Nazwa, Aktywna, Właściciel (`userLabel`), Buissnesline |
| Rodzaje opinii | The types routed here, linking to `/opinie?type=N` (spec 16) |
| Członkowie | The members, with a link to each user (spec 23) |
| **Byli członkowie** | `UserGroupHistory`, labelled "legacy — brak dat" |

Admin actions: Dodaj członka · Usuń członka · Edytuj (name, active, owner,
businessline). Creating and deleting groups: **not** in scope — fifteen groups in
fourteen years, and a deleted group orphans an opinion type.

### Membership editing

Add and remove write a `UserGroupHistory` row with our new `changedAt`,
`changedById` and `action` columns, so the gap the 391 legacy rows leave stops
growing.

## Implementation

| Path | Action | Note |
|---|---|---|
| `app/(app)/grupy/page.tsx` | modify | `requireAdmin`; owner and businessline columns; inactive filter |
| `app/(app)/grupy/[id]/page.tsx` | modify | `requireAdmin`; former members; membership actions |
| `features/grupy/actions.ts` | create | `addMember`, `removeMember`, `updateGroup` |
| `prisma/schema.prisma` | modify | `UserGroupHistory.changedAt/changedById/action`, all nullable |

## Verification

```sql
-- 1. All fifteen, with everything that distinguishes them.
select g.id, g.name, g.active, g."ownerId", g."businesslineId",
       (select count(*) from "UserGroup" ug where ug."groupId" = g.id)   members,
       (select count(*) from "OpinionType" o where o."groupId" = g.id)   opinion_types
from "Group" g order by g.id;
-- expected: 15 rows, ids 1-5 and 7-16 (id 6 deleted in legacy);
-- group 2 has 343 members; groups 12 and 13 are the only ones with owner+businessline;
-- groups 4 and 7 are inactive

-- 2. Membership and history.
select (select count(*) from "UserGroup")        memberships,
       (select count(*) from "UserGroupHistory") history,
       (select count(distinct "userId") from "UserGroup") users_in_a_group;
-- expected: 428 | 391 | (see result)

-- 3. The eight opinion-routing groups.
select ot.id, ot.name, ot."groupId", g.name
from "OpinionType" ot left join "Group" g on g.id = ot."groupId" order by ot.id;
-- expected: 8 of 9 types name a group; type 6 "INNE" has none

-- 4. No membership points at a missing group or user.
select (select count(*) from "UserGroup" ug
          left join "Group" g on g.id = ug."groupId" where g.id is null) orphan_group,
       (select count(*) from "UserGroup" ug
          left join "User" u on u.id = ug."userId"  where u.id is null)  orphan_user;
-- expected: 0 | 0
```

Manual checks:

- [ ] A non-admin gets 404 on `/grupy` and `/grupy/[id]`
- [ ] All 15 groups are listed; groups 4 and 7 only with "pokaż nieaktywne"
- [ ] Groups 12 and 13 show their owner and businessline; the other 13 show "—"
- [ ] "Właściciele umów" lists 343 members without timing out
- [ ] Each opinion-routing group links to its type's worklist
- [ ] Former members appear with the label "legacy — brak dat" and no date
- [ ] Adding a member writes a history row **with** a date and an author
- [ ] Removing one does the same and does not delete the membership history
- [ ] Group 7's nine members are still listed even though the group is inactive
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Q60 — is "Tylko do odczytu" (group 5) an enforced role?** One member. If legacy
   enforces it, spec 03's authorization model is missing a rule. Same question for
   group 7, "ograniczony dostęp rodzaj umowy", which is inactive but has nine
   members and a name that describes a restriction spec 03 does implement
   (dimension DOMAIN).
2. **Q61 — what are groups 12 and 13 for?** A named manager plus a businessline, on
   the only two groups that have either. They are the sole schema-level evidence for
   the Supply chain module (spec 26).
3. **Q62 — should group creation and deletion be possible at all?** Fifteen groups
   in fourteen years, each one wired into an opinion type or an access rule.
   Recommend membership editing only.
4. **Q1 carries over** — with 451 of 452 users as placeholders (spec 04), every
   member list currently reads `legacy-50463`.

## Implementation notes (2026-09-24)

**Status: in progress.** Everything in this spec is built except the links from
opinion types to the worklist, whose target screen does not exist yet. The final
code (rebased onto `aabbad6`, with the review fixes) passed `tsc` and `vitest` only;
the build, smoke test and browser checks ran on the version before the rebase.

Done:

- **`/grupy`:** `requireAdmin`, so non-admins get a 404. `FilterBar` with "Nazwa" and
  **"pokaż nieaktywne"**: inactive groups are hidden by default and the counter says
  how many are hidden. Columns Nazwa · Aktywna · Właściciel · **Buissnesline** ·
  Członkowie · Rodzaje opinii. No pagination, so no "Na stronie".
- **`/grupy/[id]`:** `requireAdmin` runs before the id is parsed, so the page reveals
  nothing about which ids exist. Sections:
  - Dane, with "Edytuj" (name ≤ 50, active, owner, buissnesline).
  - Rodzaje opinii.
  - Członkowie: links to `/dostepy/[id]`, "Dodaj członka", "usuń" with a confirm.
  - **Byli członkowie**: people removed here, with date and author, then the
    imported rows under **"legacy — brak dat"**. These are listed alphabetically,
    never by id, because the id order says nothing about time.
  - Historia zmian składu: every add and remove, with date and author.
- **Writes** (`features/grupy/actions.ts`): `addMember`, `removeMember` and
  `updateGroup`. Each one calls `requireAdmin` itself.
  - A membership change and its history row are written in one transaction, with
    the group row locked (`FOR UPDATE`).
  - Insert and delete are conditional, so a repeated click writes nothing.
  - Nothing ever deletes history.
- **Schema:** `UserGroupHistory.changedAt`, `changedById` and `action` (enum
  `GroupMembershipAction`, ADDED/REMOVED). All three are nullable with **no
  default**, so the 391 imported rows keep null and never get a date. Migration
  `20260924121000_group_history_audit`.
- **Nav:** `NavItem.adminOnly` and `navItemsFor(isAdmin)`. "Grupy" is hidden from
  non-admins in the top bar and the side nav.
- **Decisions:**
  - Q62: as recommended, membership editing only. No group creation or deletion.
  - An **inactive group has a frozen membership**, in the UI and on the server. To
    change it, activate the group first. This is how the quirk "removing
    memberships would destroy the only record" was read.
  - Group edits keep no history: legacy has none, and no table exists for them.
  - Groups 12 and 13 were already flagged in spec 26 ("The one substantive clue").
- **Verified on the fixture plus synthetic rows:**
  - A 343-member group renders in about 0.1 s.
  - An inactive group 7 with 9 members, and undated legacy rows, display correctly.
  - Playwright: add, remove (confirm dismissed and accepted), edit with validation,
    and focus handling.
  - Membership forms posted by a non-admin, with JS or without, write nothing.

Not done:

- Opinion types are shown as plain text. The `/opinie?type=N` links are not built:
  that screen does not exist, and a comment in `grupy/[id]/page.tsx` marks where
  the links go.
- "Lokalizacja dostępy" is still in the nav for non-admins, although spec 22 now
  answers them with 404.
- Build, smoke test and Playwright were not re-run on the final commit.
- The verification SQL was not run against real data, because there is no dump. On
  the fixture, check 4 (orphans) returns 0 | 0.

Blocked:

- **Worklist links:** blocked on spec 16's `/opinie`, which waits for **Q20**.
- **Real names in member lists:** blocked on **Q1** (spec 04). Every placeholder reads
  `legacy-<id>`.
- **Q60**, whether "Tylko do odczytu" and group 7 are enforced roles: recorded here,
  nothing is enforced. It belongs to spec 03, which is itself blocked on Q18.
- **Q61**, what groups 12 and 13 are for: both are displayed and nothing reads them.

Next steps:

1. Re-run `npx next build`, the smoke test and the browser flows on the merged branch.
2. When `/opinie` ships, link each opinion type to `/opinie?type=N`.
3. Set `adminOnly: true` on "Lokalizacja dostępy" now, and on "Dostępy" once spec 23
   gates it.
4. Spec 23:
   - Gate `/dostepy`. It still shows every user's groups to anyone, and its links
     to `/grupy` now return 404 to non-admins.
   - Admin rights come from the JWT and are fixed at login.
   - `UserGroupHistory.user` cascades on delete.
5. Spec 24: the Raporty "Supply chain" card links to `/grupy` for everyone and
   matches groups by name, so a rename made here changes that card. Match by id, as
   spec 26 asks.
6. `db:import`: `UserGroupHistory` has no natural key, so a re-run appends the 391
   rows again. Skip the load when rows with `action IS NULL` already exist.

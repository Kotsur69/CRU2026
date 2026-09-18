---
id: 26
title: Supply chain — dokument rozpoznawczy
group: D-supporting
status: todo
depends-on: []
legacy-tables: []
prisma-models: [Group, UserGroup, Businessline]
routes: ["/supply-chain"]
---

# 26 — Supply chain — dokument rozpoznawczy

## Why

Supply chain is the tenth item in the legacy menu and the only module with **no
table in the database**. We have a menu entry, a locked door, a report endpoint and
three user groups. That is all.

This document exists so that the gap is recorded rather than rediscovered. It is
**not** an implementation spec — there is nothing to implement — and it should not
be written as one until the questions at the end are answered. What it does is set
out exactly what we know, exactly what we do not, and what the minimum evidence
would be to start.

## The complete evidence

Four items. There are no others anywhere in the artefacts.

### 1. The menu

`audyt §0` lists the ten top-level items:

> Umowy, Projekty, Dział ryzyka, **Supply chain**, Kontrahenci, Grupy,
> Lokalizacja dostępy, Dostępy, Raporty (dropdown), Mailing

Nine of the ten have a register and data behind them. Supply chain is the exception.

### 2. The locked door

`audyt §3.–8.`, tested directly:

| Module | URL | Result |
|---|---|---|
| Supply chain | `/cru/index.php/supplychain` | ⛔ **Access deny!** |

Note what that tells us: the route **exists and is role-gated**. A route that did
not exist would 404. So there is a controller behind it.

### 3. The report

`/raport/supplychain` is one of the six report endpoints (`audyt §8`). The audit
draws the obvious conclusion:

> *"Istnienie raportów `/raport/ryzyka` i `/raport/supplychain` sugeruje, że to
> pełnoprawne rejestry z własnymi danymi."*

Dział ryzyka turned out to be exactly that — 406 records, its own identifier
grammar, its own domains (spec 08). By the same reasoning Supply chain should be a
register too. And yet:

### 4. No table

The dump contains **35 tables** and 4 views. Not one of them mentions supply chain:

```
acceptance_form  access  admins  attachment  buissnesline  companies_connected
contract  contract_company  contract_domain  contract_has_location
contract_location  contract_nature  contract_notice_period  contract_status
contract_type  contract_users  contracthistory  contractor  currency
delivery_method  group  mailing_groups  mailing_lists  message  opinions
opiniontypes  project  remarks  shoutbox  shoutboxusers  trade  useraccess
users_groups  users_groups_history  users_locations
```

`grep -i supplychain cru.sql` finds no `CREATE TABLE`. There is no column on
`contract` that could hold it either — spec 09 accounts for all 45 of them.

### The one substantive clue: three groups

Spec 21 documents them. They are the only rows in the entire database that name the
module:

| id | Name | Active | Owner | Businessline | Members |
|---|---|---|---|---|---|
| 11 | **Supplychain** | ✓ | — | — | 3 |
| 12 | **Supplychain grupa D. Pruszkowski** | ✓ | **495** | **2** | 5 |
| 13 | **Supplychain grupa D. Bekiersz** | ✓ | **50272** | **3** | 4 |

Twelve people in total.

And here is what makes them interesting: **groups 12 and 13 are the only two groups
of fifteen that carry an `owner_id`, and the only two that carry a
`buissnesline_id`.** Every other group has both columns null. Two named managers,
two different business lines, two small teams.

`[INFERRED]`, and it is the strongest inference available: those two columns exist
on the `group` table **for this module**. Whatever Supply chain is, it involves a
manager approving something for their business line, with a small team under them.
That is a workflow shape, not a register shape — closer to the FAU round (spec 16)
than to Umowy.

### What our code does today

| Path | Behaviour |
|---|---|
| `lib/nav.ts:22` | `{ label: "Supply chain", href: "/supply-chain", ready: false }` |
| `app/(app)/[...slug]/page.tsx` | Renders "Moduł w budowie" |
| `app/(app)/raporty/page.tsx:124` | A card matching groups by `contains "upplychain"` |

The nav comment already states the position correctly: *"Wszystkie poza Supply chain
mają pokrycie w danych z `cru.sql`"*.

## What we do not know

Everything that matters:

- **What it is.** A purchasing register? A supplier-approval workflow? A list of
  framework agreements? The name is generic and the groups suggest approval.
- **Whether it has data at all.** A module with a controller, a report and no table
  might store nothing, might use `contract` with a discriminator we have not found,
  or might live in a **different database** on the same server.
- **Whether it is in scope.** Nobody has asked for it. It appears in the menu and
  nowhere in any requirement.

The third possibility deserves emphasis. CRU is `system_id = 7` inside a shared
`am_admin` installation (spec 04), and the notes module renders with the title
*"System Zarządzania Ofertami"* (spec 14, Q14). This deployment demonstrably shares
infrastructure with at least one other application. **A Supply chain module whose
tables live outside the `cru` schema would look exactly like this** — a menu entry,
a working route, a report, and nothing in our dump.

That is the hypothesis worth testing first, because it is cheap: one question to the
Bytom admins about which databases exist on that server.

## What we do

**Nothing, beyond what is already there.** Specifically:

1. Keep the menu entry and the "Moduł w budowie" placeholder. Removing it would
   hide the gap, and the gap is information.
2. Fix the report card's group match to use ids 11, 12 and 13 rather than a
   substring (spec 24), so the one piece of real data is not tied to a group name.
3. Do not invent a schema. Do not build a register "to be ready". A guessed data
   model for a module nobody has described is the most expensive kind of wrong.
4. Ask the four questions below before anything else is decided.

### If it turns out to be in scope

The order would be: get a screenshot or an export → establish whether it has its own
tables or rides on `contract` → write a real spec → build. Steps one and two are
somebody else's to perform; nothing in this repository can advance them.

## Verification

There is nothing to verify functionally. These queries confirm the evidence is
still what this document says it is — worth re-running if a new dump arrives:

```sql
-- 1. The three groups, by id. These are the whole dataset.
select g.id, g.name, g.active, g."ownerId", g."businesslineId",
       b.name as businessline,
       (select count(*) from "UserGroup" ug where ug."groupId" = g.id) members
from "Group" g
left join "Businessline" b on b.id = g."businesslineId"
where g.id in (11, 12, 13) order by g.id;
-- expected: 11 Supplychain, no owner, no BL, 3 members
--           12 …Pruszkowski, owner 495, BL 2, 5 members
--           13 …Bekiersz,    owner 50272, BL 3, 4 members

-- 2. Groups 12 and 13 are the only ones with either column set.
select count(*) filter (where "ownerId" is not null)        with_owner,
       count(*) filter (where "businesslineId" is not null) with_businessline,
       count(*)                                             total
from "Group";
-- expected: 2 | 2 | 15

-- 3. Nothing else in the database mentions it.
select count(*) from "Group" where name ilike '%supply%';
-- expected: 3, and no other table has such a column
```

Shell:

```bash
grep -ci "supplychain" cru.sql                                    # mentions
grep -i "supplychain" cru.sql | grep -ci "create table"           # expect 0
grep -c "CREATE TABLE IF NOT EXISTS" cru.sql                      # expect 35
```

Manual checks:

- [ ] `/supply-chain` renders "Moduł w budowie" and does not 404
- [ ] The menu entry is present and visibly marked as unbuilt
- [ ] The Raporty card matches groups by id, not by name (spec 24)
- [ ] No Prisma model, no migration and no route was invented for this module

## Open questions

All four are for a human; none can be answered from the artefacts.

1. **Q16 — what is Supply chain?** A register, a workflow, a list? The three groups
   suggest manager-plus-business-line approval. Nobody on our side has ever seen it.
2. **Q73 — does the legacy server host more than the `cru` database?** CRU is
   `system_id = 7` in a shared `am_admin` installation and the notes iframe is
   titled "System Zarządzania Ofertami". If Supply chain's tables live in another
   schema, that explains every observation at once. **Cheapest question to ask and
   the most likely to resolve the module.**
3. **Q74 — is it in scope for CRU2026 at all?** It has never appeared in a
   requirement. If the answer is no, this document becomes the record of why the
   menu has nine items instead of ten, and that is a complete outcome.
4. **Q61 carries over** — what groups 12 and 13 are for. Answering it probably
   answers Q16.

---
id: 24
title: Raporty
group: D-supporting
status: todo
depends-on: [28]
legacy-tables: [contract, contractor, opinions]
prisma-models: [Contract, Contractor, Opinion, Group]
routes: ["/raporty", "/raporty/[rodzaj]"]
---

# 24 — Raporty

> **Where we stand (2026-09-24): not started.** Nothing in this spec is built yet.
>
> - **Depends on:** spec 28 (exports).
> - **Waiting on:** **Q70** (what the legacy reports contain), Q71 and Q72.
> - **Known issue:** the "Supply chain" card matches groups by name, so renaming a group changes it. Match by id instead.
> - **Next step:** spec 28 first.

## Why

Legacy exposes six ready-made reports behind a dropdown, and the audit could not
open any of them. What we built instead is a **dashboard** — six cards of computed
figures linking into the registers (`app/(app)/raporty/page.tsx`) — which is a
reasonable thing to build when you cannot see the original, and is almost certainly
not what legacy does.

The clue is in the URL the audit recorded: `/raport/projekty?limit=&offset=`,
*"paginowany do 4000/5000 → tysiące projektów"* (`audyt §8`). A report paginated to
four or five thousand rows is not a dashboard. It is a **bulk data extract** —
the thing people open in Excel.

So this spec's real subject is the gap between a summary screen and an export, and
its conclusion is that the export is what users want and that it belongs to spec 28.

## Legacy behaviour

`audyt §3.–8.`: **`access deny`** on `/raport/umowy`, tested directly. None of the
six was ever opened.

The six endpoints, from the menu dropdown (`audyt §8`):

| Endpoint | Subject | Note from the audit |
|---|---|---|
| `/raport/umowy` | Umowy | tested, denied |
| `/raport/projekty?limit=&offset=` | Projekty | **paginated to 4000/5000** |
| `/raport/ryzyka` | Dział ryzyka | |
| `/raport/kontrahenci` | Kontrahenci | |
| `/raport/supplychain` | Supply chain | the module with no table (spec 26) |
| `/raport/opinions` | **"zaległe opinie"** | named in `audyt §2.4` and `§11.5` |

Two of the six are named in the audit with a purpose. `/raport/opinions` is
**"zaległe opinie"** — outstanding opinions, which spec 16 builds as `/opinie`.
And `/raport/supplychain` is the strongest evidence that Supply chain is a real
register with its own data (`audyt §8`), since nobody writes a report for a module
that does not exist.

`limit` and `offset` as query parameters, with no other filters recorded, suggests
a plain paginated dump rather than a parameterised report. No date range is
mentioned anywhere.

## Data

There is no report data. Every figure a report could show is derived from tables
the other specs already document. What matters here is which cross-sections are
worth precomputing, and the honest answer comes from the counts:

| Report | Rows it would produce | Source spec |
|---|---|---|
| Umowy | 10,704 | 06 |
| Projekty | 9,027 | 07 |
| Ryzyka | 406 | 08 |
| Kontrahenci | 3,580 | 20 |
| Opinions ("zaległe") | **645** open on open records, 3,702 total | 16 |
| Supply chain | **unknown — no table** | 26 |

Five of the six are simply "the register, unpaginated". Only `zaległe opinie` is a
genuinely different cross-section, and spec 16 already builds it as a screen.

## Legacy quirks

### Quirk: the Supply chain card matches groups by a hardcoded substring

- **Current:** `app/(app)/raporty/page.tsx:124` reads
  `where: { name: { contains: "upplychain" } }` — a substring chosen to match both
  "Supplychain" and "supplychain" by dropping the first letter.
- **Why it is wrong:** it is a string match against a dictionary that an admin can
  rename, in a file that gives no indication the match is load-bearing. Renaming
  group 11 to "Supply Chain" silently empties the card.
- **We do:** match by **id** — groups 11, 12 and 13 (spec 21) — in a named constant
  in `lib/supply-chain.ts`, with a comment pointing at spec 26. Three ids, stable,
  and the reason they are the right three is documented.
- **Sign-off:** not needed.

### Quirk: we built a dashboard where legacy has extracts

- **Legacy:** `?limit=&offset=` paginated to thousands of rows.
- **Current:** six cards of aggregate figures, each linking to a register.
- **Why the difference matters:** a legal department asked for "the report" wants a
  file they can filter in Excel and send to somebody. A dashboard cannot be sent.
- **We do:** keep the dashboard — it is genuinely useful as an entry point and
  costs nothing now that it exists — and add an **"Eksportuj"** action to every card
  and every register. That is spec 28, which needs a dependency none of which is
  installed. **This spec's main deliverable is therefore the requirement, not the
  code.**
- **Sign-off:** not needed, but see Q70 — if the legacy reports have columns our
  registers do not, the export needs them.

### Quirk: `/raport/opinions` duplicates `/opinie`

- **Legacy:** a report named "zaległe opinie".
- **Ours:** spec 16 builds `/opinie` as a filterable worklist, which is strictly
  better than a static extract for the same data.
- **We do:** the Raporty dashboard links to `/opinie` rather than reimplementing it,
  and the export action on that screen covers the extract case. Do not build a
  seventh screen.
- **Sign-off:** not needed.

### Quirk: no date range anywhere

- **Legacy:** only `limit` and `offset` are recorded. No `from`/`to`.
- **Why it matters:** "all contracts signed in 2025" is the first thing anybody
  asks a contract register for, and neither legacy (as far as we can see) nor our
  dashboard supports it.
- **We do:** add a **rok / zakres dat** control to the dashboard that scopes every
  card at once, filtering on `registeredAt`. It is an addition, and an obvious one.
- **Sign-off:** not needed.

## UI

### /raporty

Keep the card layout. Add, above the cards, a single **date-range control**
(Rok · Od · Do) that scopes all of them, defaulting to all time so the first view
matches today's.

Each card gains two actions: **"Pokaż"** (the existing link into the register, with
the date range carried in the query string) and **"Eksportuj"** (spec 28).

The six cards map to the six legacy endpoints one-to-one, so the vocabulary
matches what users already know:

| Card | Figures | Links to |
|---|---|---|
| Umowy | count, by status, expiring ≤30/≤90 days | `/umowy` |
| Projekty | count, by status, the 1,541 in flight | `/projekty` |
| Dział ryzyka | count, **total exposure**, in court | `/ryzyko` |
| Kontrahenci | count, **duplicate NIPs (177)**, unused (208) | `/kontrahenci` |
| **Zaległe opinie** | **645** open on open records, by type | **`/opinie`** |
| Supply chain | groups 11/12/13 and their members | `/grupy` |

Two cards should show a number the register does not: the risk module's **total
exposure** (270,323,086 PLN, spec 08) and Kontrahenci's **duplicate NIP count**
(177, spec 20). Those are the figures a report exists to surface.

### Authorization

Every card is scoped by `contractScopeWhere(actor)` (spec 03), so two users can see
different totals. That is correct and needs to be visible — a one-line note
**"Liczby uwzględniają Twoje uprawnienia."** under the heading, so nobody reconciles
two screenshots and reports a bug.

## Implementation

| Path | Action | Note |
|---|---|---|
| `app/(app)/raporty/page.tsx` | modify | Date range; scope by actor; export actions; risk total; duplicate NIPs |
| `lib/supply-chain.ts` | create | `SUPPLY_CHAIN_GROUP_IDS = [11, 12, 13]`, replacing the substring match |
| `lib/reports.ts` | create | One function per card, taking the range and the actor's scope |

Each card is one `count` or `aggregate`; the page is a single `Promise.all`. No
report tables, no caching — the largest figure is over 20,137 rows and Postgres
counts that in milliseconds.

## Verification

```sql
-- 1. The six headline figures, unscoped.
select (select count(*) from "Contract" c join "ContractStatus" s on s.id=c."statusId"
          where not c."isDeleted" and s.kind='CONTRACT')                      umowy,
       (select count(*) from "Contract" c left join "ContractStatus" s on s.id=c."statusId"
          where not c."isDeleted" and (s.kind='PROJECT'
            or (c."statusId" is null and c."isProject")))                     projekty,
       (select count(*) from "Contract" c join "ContractStatus" s on s.id=c."statusId"
          where not c."isDeleted" and s.kind='RISK')                          ryzyka,
       (select count(*) from "Contractor" where not "isDeleted")              kontrahenci;
-- expected: 10704 | 9027 | 406 | 3494

-- 2. The two figures only a report shows.
select (select round(sum(salary)) from "Contract" c join "ContractStatus" s on s.id=c."statusId"
          where not c."isDeleted" and s.kind='RISK')                          ryzyko_pln,
       (select count(*) from (select "vatId" from "Contractor"
          where "vatId" is not null group by 1 having count(*)>1) d)          duplikaty_nip;
-- expected: 270323086 | 177

-- 3. Zaległe opinie — the one report that is not just a register.
select count(*) from "Opinion" o join "Contract" c on c.id=o."contractId"
where o.active and o."signedAt" is null and not c."isDeleted"
  and c."statusId" in (1,2,4,7,12,13);
-- expected: 645   (3702 including closed records)

-- 4. The supply-chain groups, by id rather than by name.
select id, name, (select count(*) from "UserGroup" ug where ug."groupId"=g.id) members
from "Group" g where id in (11,12,13) order by id;
-- expected: 11 Supplychain 3 | 12 …Pruszkowski 5 | 13 …Bekiersz 4
```

Manual checks:

- [ ] All six cards render and their figures match the queries above
- [ ] The date range scopes every card at once and defaults to all time
- [ ] The Dział ryzyka card shows 270 323 086 PLN
- [ ] The Kontrahenci card shows 177 duplicate NIPs and links to the filter
- [ ] "Zaległe opinie" reads 645 and links to `/opinie`, not to a new screen
- [ ] Renaming group 11 to "Supply Chain" does **not** empty the card —
      `grep -rn "upplychain" nextjs_space` returns no substring match
- [ ] A scoped user (spec 03) sees smaller figures, and the note explaining why
- [ ] Every card has an export action, even if spec 28 has not landed and it is
      disabled with "wkrótce"
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Q70 — what do the legacy reports actually contain?** Six endpoints, none
   opened, and `?limit=&offset=` paginated to thousands of rows. If they carry
   columns our registers do not — computed totals, joined dictionary names, a
   particular column order the legal department pastes into a template — the export
   in spec 28 has to match. One screenshot of `/raport/umowy`, or better one
   exported file, settles the whole spec.
2. **Q71 — is an export the real requirement?** Our reading is yes: the pagination
   limits say bulk extract, and a dashboard cannot be e-mailed. If so, spec 28 is
   the higher priority and this screen is just its front door.
3. **Q72 — should report figures respect the viewer's access scope?** We say yes,
   and we label it. The alternative — unscoped totals for everyone — is simpler and
   leaks how much exists outside your scope.
4. **Q16 carries over** — `/raport/supplychain` implies a register with data
   (spec 26).

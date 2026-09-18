---
id: 34
title: Cutover
group: F-delivery
status: todo
depends-on: [all]
legacy-tables: [all]
prisma-models: [all]
routes: []
---

# 34 — Cutover

## Why

One day the legal department stops using the system at `10.222.125.213` and starts
using this one. Everything else in this spec set is preparation for that morning.

The risk is concentrated and asymmetric. 20,137 records, 39,281 files and fourteen
years of history move once. If something is missing and nobody notices for a month,
the legacy system may be gone and the gap is permanent. So this spec is mostly
**counting** — a reconciliation that either matches exactly or stops the cutover.

It also records a process gap that has been open since the beginning, because
cutover is where it comes due.

## The process gap

`master_prompt_faza0_audyt_replika.md:36-42`, step **0b**:

> ### 0b - Zakres kopii (wymaga akceptacji przed kodowaniem)
> 1. Na bazie audytu z 0a przygotuj `historia_wersji/zakres_kopii_faza0.md`: jasny
>    podział na: co wchodzi w zakres repliki 1:1 … co jest legacy-only i świadomie
>    pomijamy (i dlaczego) … co nakłada się z późniejszymi fazami planu …
> 2. **Zatrzymaj się tutaj i poczekaj na jawną akceptację użytkownika (Mati)**
>    zakresu, zanim napiszesz jakikolwiek kod produkcyjny.

**Neither happened.** `historia_wersji/` contains `audyt_legacy_strony.md` and no
`zakres_kopii_faza0.md`; the gate was never put to Mati; production code was
written.

It is worth being precise about the consequence, because it is not "the code is
wrong" — the code is largely good. The consequence is that **nobody ever signed off
on what is in scope**, so there is no agreed answer to "is this finished?" And
cutover is exactly the moment that question gets asked.

This spec set is, in substance, the 0b document — far more detailed than step 0b
asked for. What it still lacks is the second half: the explicit acceptance.
Sign-off on the consolidated question list in `README.md` closes the gap.

## Reconciliation

Every number below comes from a spec that verified it. The cutover check is: run
the query against the production database on cutover day and compare. **A
mismatch stops the cutover**, it is not a note for later.

### Row counts

| Table | Expected | Spec |
|---|---|---|
| `Contract` (not deleted) | **20,137** | 01 |
| — CONTRACT | 10,704 | 06 |
| — PROJECT | 8,996 + 31 without a status | 07 |
| — RISK | 406 | 08 |
| `Contractor` | 3,580 (86 deleted) | 20 |
| `Attachment` | 39,272 | 18 |
| Files on disk | **39,281** | 18, 32 |
| `ContractHistory` | 237,405 | 13 |
| `Remark` | 50,737 | 14 |
| `Opinion` | 16,531 | 16 |
| `Shoutbox` / recipients | 1,184 / 14,683 | 15 |
| `ContractUser` | 39,665 | 10 |
| `ContractLocationLink` | 21,636 *(21,666 in the dump, 30 null)* | 12 |
| `User` | 452 | 04 |
| `UserAccessScope` / `UserLocation` / `UserGroup` | 90 / 30 / 428 | 23 |
| `MailingContact` | 275 | 25 |
| `AcceptanceForm` | **1** legacy + 1 test row | 17 |

### Sums that must agree

| Measure | Expected | Spec |
|---|---|---|
| Risk exposure | **270,323,086 PLN** | 08 |
| Attachments on disk | **49 GB** | 32 |
| Records with `dateEnd = 2099-12-31` | 4,119 | 10 |
| Contracts in force | 2,223 | 19 |

### Integrity classes

From spec 18, and the same four numbers spec 32's restore rehearsal checks:

| Class | Expected |
|---|---|
| Attachment rows with no file | **8** |
| Files reachable only by stem | **7** → **0** after the repair script |
| Zero-byte files with a row | **23** |
| Files with no row | **17** |

### Known, accepted discrepancies

These must **not** be chased on cutover day. Each is documented and expected:

| Discrepancy | Why | Spec |
|---|---|---|
| 21,666 → 21,636 location links | 30 dump rows had a null `location_id` | 12 |
| 39,272 rows vs 39,281 files | 8 missing + 17 orphan + 7 mangled | 18 |
| `Attachment.addedAt` is the import date on every row | Legacy has no such column | 18 |
| 2,561 contractors have no `registeredAt` | Legacy recorded only 1,019 | 20 |
| `UserGroupHistory` has no dates | Legacy stored two columns | 21 |
| 4,596 closures with no history row | The auto-close procedure wrote none | 19 |
| Records **21234 / 21235** and `AcceptanceForm` id 3 | Our own test data — exclude by id, not by date | 17 |

## Blocking prerequisites

Cutover cannot happen until each of these is resolved. This is the short list; the
full question set lives in `README.md`.

| # | Prerequisite | Spec |
|---|---|---|
| **Q1** | The `am_admin` export — at minimum `id` and `login`. Without it 451 of 452 users are `legacy-N` placeholders and only the service account can sign in. **Spec 25 narrows the ask**: names and addresses for 275 people are already in `mailing_lists` | 04, 25 |
| **Q4** | Where production runs | 31, 32 |
| **Spec 01** | The re-import — `giveopinions`, `project`, the skipped dictionaries. Re-importing after cutover means re-importing live data | 01 |
| **Spec 03** | Read authorization. Going live without it exposes every record to every user | 03 |
| **Spec 18** | The file route's authorization check | 18 |
| **Spec 23** | `requireAdmin` on `/dostepy`, `/grupy`, `/lokalizacje` — three two-line changes | 21, 22, 23 |
| **Q48** | Whether `2099-12-31` reads as "na czas nieokreślony" — 4,119 records | 10 |
| **Q31** | Whether to close the 173-contract auto-close backlog | 19 |
| Spec 32 | One successful restore rehearsal | 32 |

The three authorization items are grouped deliberately: **going live with the
current state means any signed-in user can read every contract, every file and the
complete access map.** That is the one category of gap that cannot be fixed after
the fact, because by then it has happened.

## The plan

### Parallel run

Two to four weeks with both systems live and legacy authoritative. Users work in
legacy as usual and are asked to also open the new one for anything they would
normally look up. The point is not double entry — it is exposure.

What to watch:
- records that are hard to find
- numbers that disagree with legacy
- anything a scoped user cannot see that they expect to (spec 03's first contact
  with reality)
- anything anybody notices is **missing** — that is the whole value of the exercise

Re-run the reconciliation weekly; legacy keeps changing, so the counts move.

### Freeze and switch

1. **Announce** the freeze — a date and an hour, a week ahead.
2. **Freeze legacy.** Read-only if that is possible; if not, agreed by convention
   and checked afterwards against `modified_on`.
3. **Final export** — a fresh `cru.sql` and a fresh file sync. Note the timestamp:
   the dump we hold is from **2026-08-10**, and everything after it is missing.
4. **Re-import** into an empty production database, then **run the reconciliation
   in full**. Any unexplained mismatch stops here.
5. **Repair** — spec 18's seven mangled paths.
6. **Backlog** — spec 19's 173 contracts, if Q31 said yes, as a separate reviewed
   run with the dry-run list attached.
7. **Verify files** — 8 / 0 / 23 / 17.
8. **Switch** — DNS or the internal link. Legacy goes read-only, **not off**.
9. **Smoke test** — sign in as three real users with different scopes; open a
   record in each module; download an attachment; create one contract; add one note.

### After

| When | What |
|---|---|
| Day 1 | Somebody on hand all day. Watch the error log. Expect access complaints — spec 03 is enforcing rules nobody has felt for fourteen years |
| Week 1 | Daily backup check. Daily "did the job run" check (spec 19) |
| Month 1 | Re-run the reconciliation against the frozen legacy copy. Still identical? |
| Month 3 | Decide whether legacy can be decommissioned |

**Keep legacy read-only for at least three months.** It is the only rollback, it
costs nothing to leave running, and the question it answers — "what did this
record look like before?" — will be asked.

### Rollback

Up to step 8, rollback is "do not switch". After step 8 it is "point back at
legacy", and everything entered in the new system since the switch has to be
re-entered by hand. That window should be hours, not days: if the smoke test fails,
go back immediately rather than working through it.

Migrations do not roll back (spec 31), so a schema change on cutover day is a
one-way door. Do not combine cutover with a migration that is not already proven in
the parallel run.

## Verification

The single reconciliation query. Run before cutover, after the final import, and
monthly afterwards:

```sql
select 'Contract'              t, count(*) n from "Contract" where not "isDeleted"
union all select 'Contractor',    count(*) from "Contractor"
union all select 'Attachment',    count(*) from "Attachment"
union all select 'ContractHistory', count(*) from "ContractHistory"
union all select 'Remark',        count(*) from "Remark"
union all select 'Opinion',       count(*) from "Opinion"
union all select 'Shoutbox',      count(*) from "Shoutbox"
union all select 'ShoutboxRecipient', count(*) from "ShoutboxRecipient"
union all select 'ContractUser',  count(*) from "ContractUser"
union all select 'ContractLocationLink', count(*) from "ContractLocationLink"
union all select 'User',          count(*) from "User"
union all select 'MailingContact', count(*) from "MailingContact"
order by 1;
-- 20137 | 3580 | 39272 | 237405 | 50737 | 16531 | 1184 | 14683
-- | 39665 | 21636 | 452 | 275

-- Per module, and the sum that must not move.
select coalesce(s.kind::text, '(brak)') kind, count(*),
       round(sum(c.salary)) filter (where s.kind = 'RISK') risk_pln
from "Contract" c left join "ContractStatus" s on s.id = c."statusId"
where not c."isDeleted" group by 1 order by 2 desc;
-- CONTRACT 10704 | PROJECT 8996 | RISK 406 (270 323 086 PLN) | (brak) 31

-- Our test data, excluded by id and never by date.
select id, identifier from "Contract" where id in (21234, 21235);
select id, "contractId" from "AcceptanceForm" where "contractId" = 21234;
```

```bash
# Files.
find storage-local/attachments -maxdepth 1 -type f | wc -l   # 39281
du -sh storage-local/attachments                             # 49G
yarn db:verify-files                                          # 8 / 0 / 23 / 17
```

Cutover checklist:

- [ ] All nine blocking prerequisites are closed, in writing
- [ ] `README.md`'s question list has been reviewed and the sign-off items answered
- [ ] The parallel run has been live for at least two weeks with real users
- [ ] A restore rehearsal has succeeded (spec 32)
- [ ] The final export timestamp is recorded and is **after** the freeze
- [ ] The reconciliation matches exactly, or every difference is on the accepted list
- [ ] Spec 18's repair script has run; class 2 is 0
- [ ] Spec 19's backlog is either run with a reviewed list, or explicitly deferred
- [ ] Three real users with different scopes can sign in and see what they expect
- [ ] One contract created end to end, with an identifier, an attachment and a
      history entry
- [ ] Legacy is read-only and stays up
- [ ] Backups are running and the newest is under 24 hours old
- [ ] Spec 19's job is scheduled and its alarm is wired
- [ ] Somebody is named as on call for day one

## Open questions

1. **Q84 — is step 0b's acceptance still required, and is this spec set it?** The
   master prompt made it a gate before any production code. The code exists. The
   cleanest close is to treat `docs/features/` as the 0b deliverable and get an
   explicit acceptance of its scope and its question list. **Recommend doing this
   before any more implementation**, because it is the only remaining artefact of
   the original process.
2. **Q85 — when?** Nothing here can be scheduled without a date, and the date
   depends on Q1 and Q4, neither of which is ours to answer.
3. **Q86 — who signs off?** The legal department for the data, Mati for the scope,
   and somebody for operations (Q76).
4. **Q87 — how long does legacy stay up?** Recommend three months read-only. It is
   the only rollback, and it is the only way to answer "what did this look like
   before?"
5. **Q88 — the dump is from 2026-08-10.** Everything entered in legacy since then
   is missing from our copy — 14 contracts have already expired in that window
   (spec 19). A fresh export is required at cutover, and the delta should be
   measured beforehand so the size of the gap is known rather than assumed.

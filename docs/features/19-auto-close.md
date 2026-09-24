---
id: 19
title: Automatyczne zamykanie umów i wygasanie
group: C-missing-subsystems
status: todo
depends-on: [01]
legacy-tables: [contract, contracthistory]
prisma-models: [Contract, ContractStatus, ContractHistory]
routes: ["/umowy", "/wygasajace"]
---

# 19 — Automatyczne zamykanie umów i wygasanie

> **Where we stand (2026-09-24): not started.** Nothing in this spec is built yet.
>
> - **Waiting on:**
>   - **Q31**: closing the 173-record backlog is a bulk change to legal records and will not be done without sign-off;
>   - **Q4 / Q32**: where the nightly job runs, including the "has not run in 48 h" alarm;
>   - Q48.
> - **Can start now:** the closing rule as tested code and a dry-run report. No scheduling and no bulk update.
> - **Next step:** that dry-run report.

## Why

**8,379 of the 20,137 live records sit in "Zakończona", and 4,596 of them got there
with no audit trail whatsoever.** Nobody closed them. A MySQL scheduled event did,
every morning at 09:56:48, from 2017 until the day the dump was taken.

That event does not exist in our system. Nothing replaces it. Fourteen contracts
have already expired since the export on 2026-08-10 and are still marked
"Obowiązująca", and that number grows by roughly one a week.

This is the single most consequential piece of behaviour hiding in `cru.sql`: the
most common status transition in the register is performed by a database job that no
one has read, that writes no history, and that has a bug which has permanently
stranded 173 contracts in the wrong status.

## Legacy behaviour

Three objects, all confirmed in the dump, all with the same predicate.

### The procedure — `cru.sql:430540`

```sql
CREATE PROCEDURE `SetEndContract`()
BEGIN
	update contract
	set status_id=3
	where
	(((`contract`.`date_end` + interval 1 day) = curdate())
	  and (`contract`.`status_id` = 2)
	  and (`contract`.`deleted` = 0));
END
```

Status 2 is **"Obowiązująca"**, status 3 is **"Zakończona"**. So: the day after a
contract's `date_end`, if it is still marked as in force and not deleted, it is
closed.

### The event — `cru.sql:362838`

```sql
CREATE EVENT `EventSetEndContract`
  ON SCHEDULE EVERY 1 DAY STARTS '2017-09-22 09:56:48'
  ON COMPLETION NOT PRESERVE ENABLE
DO BEGIN
	call SetEndContract;
END
```

Daily, starting **2017-09-22**, and `ENABLE` at the moment of export — so it was
still armed when the dump was taken. The system itself started in 2012, so for the
first five and a half years nothing closed anything automatically.

### The view — `cru.sql:447506`

```sql
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `contractTodayEnd` AS
select `contract`.`date_end`, `contract`.`identifier`, `contract`.`id`
from `contract`
where (((`contract`.`date_end` + interval 1 day) = curdate())
  and (`contract`.`status_id` = 2)
  and (`contract`.`deleted` = 0))
order by `contract`.`date_end`
```

**Byte-for-byte the same predicate as the procedure**, selecting instead of
updating. It is the worklist: "what is the job about to close today". Note it is
`SQL SECURITY DEFINER` where `contractview` is `INVOKER` — the expiry list bypassed
whatever row-level restrictions the calling user had.

### What the audit saw

Nothing. There is no expiry screen in `audyt_legacy_strony.md`, no "wygasające"
menu item, no reminder. `contractTodayEnd` is a view with no observed consumer —
possibly a report, possibly a monitoring query someone ran by hand, possibly
nothing. `[UNKNOWN]`.

The one user-visible trace is the Umowy list's date column, and our own
`endUrgency()` helper (`lib/contract-status.ts:56-70`) already colours it.

## Data

### Did the job actually run?

Yes. The evidence is in what is *missing* from the audit log.

| Measure | Count |
|---|---|
| Live records in "Zakończona" | **8,379** |
| …of those, with **no** `status_id` history row at all | **1,206** |
| …of those, with history but **never** a recorded close | **4,596** |
| Recorded `Obowiązująca → Zakończona` transitions | 2,439 rows / 2,164 contracts |
| Distinct users who performed those | **15** |

So roughly **4,596 contracts reached "Zakończona" with nothing in the change log
saying so**, against 2,164 closed by one of fifteen humans. Spec 13 establishes that
every `ContractHistory` row carries a `userId` — there is no "system" author — which
means the procedure simply never wrote history. A bare `UPDATE contract` bypasses
whatever CakePHP hook produced the audit rows.

That is the fingerprint: a status change on thousands of records, attributable to
nobody, with no timestamp of its own.

### The bug: equality, not inequality

`(date_end + interval 1 day) = curdate()` matches **one single day**. If the event
misses its slot — server down, MySQL restarted, `event_scheduler` off, a day the
procedure erred — every contract that expired that day stays "Obowiązująca" forever.
The job never looks back.

The data shows exactly that. Contracts still marked "Obowiązująca" with a `date_end`
in the past:

| Era | Count | Range |
|---|---|---|
| Expired **before** the event started (2017-09-22) | **32** | 2015-04-30 → 2017-08-31 |
| Expired **while the event was running** — genuinely missed | **141** | 2017-12-01 → 2026-07-19 |
| Expired **after the dump** (2026-08-10) — no job in our system | **14** | 2026-08-21 → 2026-09-16 |
| **Total overdue** | **187** | |

The 32 are structural: the job did not exist yet and never went back for them.
The 141 are the leak — about 16 a year over nine years, which is what a
once-a-day equality check on a hand-run server produces.
The 14 are ours, and they are accumulating now.

Ages of the overdue set:

| Bucket | Count |
|---|---|
| More than 5 years past | 119 |
| 1–5 years past | 47 |
| Up to a year past | 7 |
| Up to 30 days past | 14 |

The oldest three expired on **2015-04-30** — contracts 1525, 1531 and 1544
(`2013/0317`, `2013/0323`, `2013/0336`). They have been reported as in force for
eleven years.

### The live picture

"Obowiązująca", not deleted:

| | Count |
|---|---|
| Total | **2,223** |
| `dateEnd` in the future | 1,991 |
| `dateEnd` in the past | 187 |
| `dateEnd` null — open-ended | 45 |
| **`dateEnd` = `2099-12-31` — also open-ended** | **1,638** |

**Correction, from spec 10.** Legacy writes `2099-12-31` for "na czas
nieokreślony" — 4,119 records across the register, 1,638 of them still
"Obowiązująca". So the open-ended set in force is **1,683**, not 45, and 1,638 of
the "1,991 with a future end date" above are not really dated at all. Every
predicate in this spec must use `isIndefinite()` (spec 10) rather than testing for
null, or those 1,638 contracts sit in the expiry list for the next 73 years and
then all close at once.

Expiry horizon for the 1,991 that are genuinely current:

| Horizon | Contracts |
|---|---|
| ≤ 30 days | **13** |
| 31–90 days | 28 |
| 91–365 days | 136 |
| Over a year | 1,814 |

So a daily job has around one record to close a week, and a 90-day reminder window
would cover 41 contracts today. Both are small, which is the point: this is a
low-volume, high-consequence job.

### The other direction

**676 records in "Zakończona" have a `dateEnd` in the future.** Somebody closed them
early — terminated, cancelled, superseded. The job never does this, so all 676 are
human decisions and must not be "corrected" by anything we build. Closing early is
legitimate.

79 records in "Zakończona" have no `dateEnd` at all.

## Legacy quirks

### Quirk: the job writes no history

- **Legacy:** `SetEndContract` is a bare `UPDATE`. 4,596 closures have no audit row.
- **Why it matters:** in a legal register, "when did this contract stop being in
  force, and on whose authority" is exactly the question the audit log exists to
  answer, and for 55% of closed contracts it cannot.
- **We do:** our job writes a `ContractHistory` row for every record it touches —
  `columnName = 'status_id'`, `oldValue = 'Obowiązująca'`,
  `newValue = 'Zakończona'`. Spec 13 covers how a system-authored row is rendered;
  it needs a synthetic actor, because `ContractHistory.userId` is how every existing
  row is attributed. Use a dedicated **`system` user** rather than null, so the
  existing "every row has an author" invariant survives and spec 13's label
  resolution keeps working unchanged.
- **Sign-off:** not needed. It only adds information.
- **Retroactive:** do **not** backfill the 4,596. Inventing dated audit rows for
  events we cannot date is worse than the gap. Spec 13 records the gap instead.

### Quirk: the predicate is an equality, so a missed day is missed forever

- **Legacy:** `(date_end + interval 1 day) = curdate()`.
- **Data:** 141 contracts leaked through during the event's nine years of operation.
- **We do:** `dateEnd < current_date` — catch up on everything overdue, not just
  yesterday's. A job that cannot be missed is worth more than bug-compatibility here,
  and the consequence of the legacy behaviour is a register that misreports which
  contracts are in force.
- **Sign-off:** **yes**, and specifically for the backlog. On first run the new
  predicate closes **173 contracts at once** (the 32 pre-event plus the 141 missed),
  some of them expired eleven years ago. That is a visible, bulk change to legal
  records and it must be an explicit, reviewed, one-off operation — not something
  that happens quietly the first night the job is enabled. See Q31.

### Quirk: the first run would close 173 records silently

- **Consequence of the fix above**, called out separately because it is the
  operational risk, not the design question.
- **We do:** ship the job with a **dry-run mode that is the default**. It reports
  what it would close and writes nothing. The backlog is cleared by a separate,
  deliberate run after somebody has read the list — 173 rows, reviewable in one
  sitting. From then on the nightly job has one or two records to handle and the
  distinction stops mattering.
- **Sign-off:** covered by Q31.

### Quirk: the view is `SQL SECURITY DEFINER`

- **Legacy:** `contractTodayEnd` runs with the definer's rights; `contractview` runs
  with the invoker's.
- **Why it matters:** it is a small, concrete instance of the pattern spec 03
  documents — legacy had an access model and then bypassed it where convenient.
- **We do:** the `/wygasajace` screen applies `contractScopeWhere(actor)` like every
  other list. The **job** itself runs unscoped, because it is not a user.
- **Sign-off:** not needed.

### Quirk: 1,683 contracts in force have no real end date, and only 45 look that way

- **Data:** `statusId = 2` with `dateEnd IS NULL` — 45; with `dateEnd =
  2099-12-31`, legacy's "na czas nieokreślony" sentinel (spec 10) — **1,638**.
- **Why it matters:** the 45 nulls the job cannot touch by construction, and that is
  correct — an open-ended contract is a real thing. The 1,638 are the danger: a
  predicate written as `dateEnd < current_date` treats them as dated, so they sit in
  the expiry horizon for 73 years and then all close together in January 2100. Worse,
  `endUrgency()` currently reports "za 26 800 dni" on each of them.
- **We do:** nothing automatic, and **every predicate in this spec uses
  `isIndefinite(dateEnd)`** (spec 10) rather than a null test — the job's selection,
  the four `/wygasajace` groups and the horizon filter. List them under
  **"Bez daty końca (1 683)"** so they are visible rather than invisible.
- **Sign-off:** not needed.

### Quirk: only "Obowiązująca" is ever auto-closed

- **Legacy:** `status_id = 2` and nothing else. A project with a past `date_end`, a
  risk record, a status-less record — none of them are touched.
- **Why it matters:** it constrains the fix. The auto-close rule is a **contract**
  rule; the project lifecycle (spec 16) and the risk lifecycle have their own
  terminal states and no expiry semantics.
- **We do:** reproduce the restriction exactly. Only `statusId = 2` → `3`.
- **Sign-off:** not needed.

## UI

### Screen: /wygasajace — "Wygasające umowy"

There is no legacy screen for this; `contractTodayEnd` had no observed consumer. We
build one because the job's own worklist is the natural place to see what is about
to happen, and because 187 stranded records need somewhere to surface.

The register-page recipe from spec 05. Scoped by `contractScopeWhere(actor)`
(spec 03), `statusId = 2`, not deleted. Four groups, each collapsible, each with a
count:

| Group | Predicate | Today |
|---|---|---|
| **Po terminie** | `dateEnd < current_date` | 187 |
| **Wygasa w ciągu 30 dni** | `dateEnd` within 30 days | 13 |
| **Wygasa w ciągu 90 dni** | 31–90 days | 28 |
| **Bez daty końca** | `isIndefinite(dateEnd)` — null **or** `2099-12-31` | **1,683** |

Columns: Identyfikator · Kontrahent · Przedmiot · Obowiązuje do · (ile dni) ·
Właściciel. The day count reuses `endUrgency()` (`lib/contract-status.ts:56`), which
already produces the right tone and Polish label — "po terminie", "kończy się dziś",
"za N dni".

Default group ordering: overdue first, then soonest. Default sort inside a group:
`dateEnd ASC`.

Filters: Buissnesline, Spółka, Właściciel, and a horizon selector (30 / 90 / 365 /
wszystkie).

Empty state per group: **"Brak umów w tym przedziale."**

### On the record

No change needed. `endUrgency()` already runs on the Umowy list and the detail page.
One addition: when a record was closed by the job, the Historia zmian entry (spec 13)
shows the author as **"system (automatyczne zamknięcie)"** rather than a person's
name.

### Nav

Add "Wygasające" to `lib/nav.ts`, next to Umowy. Optionally with the overdue count as
a badge — 187 is a number somebody should see.

## Implementation

### Files

| Path | Action | Note |
|---|---|---|
| `scripts/jobs/close-expired-contracts.ts` | create | The job. Dry-run by default |
| `lib/contracts/expiry.ts` | create | `expiredWhere()`, `expiringWhere(days)`, `EXPIRY_HORIZONS` |
| `app/(app)/wygasajace/page.tsx` | create | The four-group list |
| `lib/nav.ts` | modify | Add the entry |
| `prisma/seed.ts` | modify | Ensure the `system` user exists |
| `package.json` | modify | `"job:close-expired"` script |

### The job

```ts
/** Port of legacy `SetEndContract` (cru.sql:430540), run daily by
 *  `EventSetEndContract` (cru.sql:362838) until 2026-08-10.
 *
 *  Deliberate divergence: legacy matched `date_end + 1 day = curdate()` exactly,
 *  so a missed day stranded those contracts forever — 141 of them did.
 *  We use `dateEnd < current_date` and catch up. See docs/features/19. */
export async function closeExpiredContracts(
  opts: { dryRun: boolean; limit?: number },
): Promise<{ closed: number; ids: number[] }>;
```

Behaviour:

1. Select `statusId = 2 AND isDeleted = false AND dateEnd < current_date`.
2. In dry-run — the default — print id, identifier, `dateEnd`, days overdue, and
   return. Write nothing.
3. Otherwise, per record and in one `$transaction`: set `statusId = 3`, and write the
   `ContractHistory` row attributed to the `system` user.
4. Log the total. Exit non-zero on any failure, so a scheduler notices.

`limit` exists for the backlog run, so 173 records can be cleared in reviewed
batches if anyone prefers that.

### Scheduling

**Not** a MySQL event, and not `setInterval` inside Next.js — a Next process is not
a scheduler and will be restarted, scaled or idled without warning.

Where it runs depends on Q4 (where production lives), so this spec specifies the
job and leaves the trigger to spec 31:

| Host | Mechanism |
|---|---|
| Windows server | Task Scheduler → `node scripts/jobs/close-expired-contracts.js --run` |
| Linux / Docker | cron or a systemd timer, daily |
| Either | A one-line healthcheck that alerts if the job has not run in 48 hours |

Run it in the morning, like legacy did — 09:56:48 was presumably arbitrary, and
anything before the working day starts is fine.

The idempotency is free: a second run the same day selects nothing, because the
records are already at status 3.

### The `system` user

`ContractHistory.userId` is non-null on all 237,405 existing rows and spec 13 builds
its rendering on that. Rather than break the invariant, seed one user —
login `system`, `isActive = false` so it can never sign in — and attribute job
writes to it. The UI special-cases that id and renders
"system (automatyczne zamknięcie)".

## Verification

```sql
-- 1. The overdue backlog, split by era. This is what the first real run will close.
select case when "dateEnd" < date '2017-09-21' then 'przed eventem'
            when "dateEnd" <= date '2026-08-10' then 'przeoczone przez event'
            else 'po dacie dumpa' end era,
       count(*), min("dateEnd"), max("dateEnd")
from "Contract" where not "isDeleted" and "statusId" = 2 and "dateEnd" < current_date
group by 1 order by 2 desc;
-- expected: 141 (2017-12-01 → 2026-07-19) | 32 (2015-04-30 → 2017-08-31) | 14
-- total 187

-- 2. The job's fingerprint: closures with no audit trail.
select count(*) filter (
         where not exists (select 1 from "ContractHistory" h
                           where h."contractId" = c.id and h."columnName" = 'status_id')
       ) as no_status_history,
       count(*) filter (
         where not exists (select 1 from "ContractHistory" h
                           where h."contractId" = c.id and h."columnName" = 'status_id'
                             and h."newValue" = 'Zakończona')
       ) as never_recorded_close,
       count(*) as total_closed
from "Contract" c where not c."isDeleted" and c."statusId" = 3;
-- expected: 1206 | 4596 | 8379

-- 3. Human closures, for contrast.
select count(*) rows, count(distinct "contractId") contracts, count(distinct "userId") users
from "ContractHistory"
where "columnName" = 'status_id' and "oldValue" = 'Obowiązująca' and "newValue" = 'Zakończona';
-- expected: 2439 | 2164 | 15

-- 4. Records the job must never touch. Open-ended means null OR the 2099 sentinel.
select (select count(*) from "Contract"
          where not "isDeleted" and "statusId" = 2 and "dateEnd" is null)             null_end,
       (select count(*) from "Contract"
          where not "isDeleted" and "statusId" = 2 and "dateEnd" = date '2099-12-31') sentinel_end,
       (select count(*) from "Contract"
          where not "isDeleted" and "statusId" = 3 and "dateEnd" >= current_date)     closed_early;
-- expected: 45 | 1638 | 676     → 1683 open-ended in force

-- 5. The expiry horizon — the /wygasajace groups.
select case when "dateEnd" <= current_date + 30  then '<=30'
            when "dateEnd" <= current_date + 90  then '31-90'
            when "dateEnd" <= current_date + 365 then '91-365'
            else '>rok' end horizon, count(*)
from "Contract" where not "isDeleted" and "statusId" = 2 and "dateEnd" >= current_date
group by 1 order by 1;
-- expected: 13 | 28 | 136 | 1814

-- 6. After the backlog run, this must be 0 and stay 0.
select count(*) from "Contract"
where not "isDeleted" and "statusId" = 2 and "dateEnd" < current_date;
-- expected after: 0
```

Manual checks:

- [ ] `job:close-expired` with no flags prints 187 candidates and **writes nothing** —
      confirm with query 6 that the count is unchanged
- [ ] `--run` on a copy of the database closes exactly 187 and writes 187 history rows
- [ ] Each of those history rows reads `status_id · Obowiązująca → Zakończona`, authored
      by `system`, and renders as "system (automatyczne zamknięcie)" in Historia zmian
- [ ] Running the job twice in a day closes nothing the second time
- [ ] The 45 null-dated contracts are untouched
- [ ] The **1 638** contracts dated `2099-12-31` are untouched, appear under
      "Bez daty końca", and show no `endUrgency` badge
- [ ] The 676 closed-early contracts are untouched
- [ ] A **project** with a past `dateEnd` is untouched — only `statusId = 2` qualifies
- [ ] A soft-deleted contract with a past `dateEnd` is untouched
- [ ] `/wygasajace` shows 187 / 13 / 28 / 1 683 in its four groups before the backlog
      run, and 0 / 13 / 28 / 1 683 after
- [ ] `/wygasajace` respects `contractScopeWhere` — a scoped user sees fewer
- [ ] The `system` user cannot sign in
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Q31 — may we close the 173-contract backlog?** 32 expired before the legacy job
   existed and 141 were missed by it; three have been wrongly marked as in force since
   2015. Closing them is a bulk change to legal records. Proposal: produce the dry-run
   list, have the legal department read it, then run once. **Blocks the first real
   run of the job, not the job's development.** Note the 14 post-dump ones are
   uncontroversial and can go in the same pass.
2. **Q32 — where does the nightly job run?** Depends on Q4. Whatever the answer, it
   needs a "has not run in 48 hours" alarm, because the failure mode of this job is
   silence.
3. **Q15 carries over, and the answer is now known.** The earlier question was
   whether the MySQL event scheduler was actually running. The data says yes — the
   event was `ENABLE` at export and 4,596 contracts were closed with no audit trail.
   What the register actually contains is 141 records the job leaked, not thousands.
   **Q15 can be closed.**
4. **Q33 — should an expiring contract notify anyone?** Legacy never did; the data
   supports it (`dateEnd` plus `NoticePeriod`, 14 values) and 41 contracts fall in a
   90-day window today. That is spec 29, and it needs SMTP, which does not exist
   anywhere in the codebase. Listed here because `/wygasajace` is where the feature
   would surface.

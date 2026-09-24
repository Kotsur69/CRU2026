---
id: 29
title: Przypomnienia o końcu umowy
group: E-planned
status: todo
depends-on: [19]
legacy-tables: [contract, contract_notice_period]
prisma-models: [Contract, NoticePeriod, User, ContractUser, ReminderLog]
routes: ["/wygasajace"]
---

# 29 — Przypomnienia o końcu umowy

> **Where we stand (2026-09-24): not started.** Nothing in this spec is built yet.
>
> - **Depends on:** spec 19 (auto-close).
> - **Waiting on:** Q33 (should expiring contracts notify anyone?). There is no SMTP anywhere in the codebase, and no e-mail will be sent without sign-off.
> - **Next step:** after spec 19. An in-app list of contracts expiring within 90 days would need no e-mail.

## Why

A contract register exists so that nobody is surprised by a date. Legacy has every
ingredient — `date_end`, a 14-value `contract_notice_period` dictionary, contract
owners, a mailing table — and **never sent a single reminder**. There is no send
log, no scheduled job and no SMTP configuration anywhere in `cru.sql`.

The consequence is in spec 19's data: **173 contracts sat expired and still marked
"Obowiązująca"**, the oldest since 2015-04-30. Nobody was told, so nobody looked.

The volume is small and that is the argument for building it. Today **41 contracts
fall inside a 90-day window** — 13 within 30 days, 28 between 31 and 90. That is a
handful of e-mails a month, to people who would genuinely want them.

## Prerequisites

| Prerequisite | Status |
|---|---|
| **SMTP** — a host, credentials, a sender address | **Does not exist anywhere in the codebase.** No `nodemailer`, no transport, no config |
| Recipient addresses | `User.email` is null on **all 452 rows** (spec 04). `MailingContact` has 269 real addresses and no link to a user (spec 25) |
| A scheduler | Spec 19 needs one too; the same mechanism serves both (Q32) |

**The second one blocks the feature.** A reminder system with no addresses sends
nothing. It is the same dependency as Q1, and spec 25 narrows it: with logins
alone, up to 275 of 452 users can be resolved to a real address.

So the honest sequencing is: Q1 → spec 25's matching → this. Building the job
before there is anywhere to send is building a no-op.

## Data

### The dictionary that makes it precise

`contract_notice_period`, 14 values, set on 10,704 contracts. It is what turns
"the contract ends" into "you must act by". A three-month notice period on a
contract ending 2026-12-31 means the decision is due by **2026-09-30**, not in
December.

Spec 10 records that the dictionary includes free-text-ish entries such as
`"specyficzne"` (`audyt §1.4`, field 17), so the mapping from a dictionary row to a
number of days is **not total** and must be explicit rather than parsed out of the
label (Q94).

### The population

| Horizon (`statusId = 2`, not deleted) | Contracts |
|---|---|
| Already expired | 187 |
| ≤ 30 days | **13** |
| 31–90 days | **28** |
| 91–365 days | 136 |
| Over a year | 1,814 |
| **Open-ended** — null or `2099-12-31` | **1,683** |

The last row is the trap. Spec 10 establishes that legacy writes `2099-12-31` for
"na czas nieokreślony" and that 1,638 such contracts are still in force. **A
reminder job that does not use `isIndefinite()` will do nothing for 73 years and
then send 1,638 e-mails in one morning.**

### Who to tell

`ContractUser` owners — typically two per record (spec 06), 39,665 grants in total.
That is the right audience: they are the people named on the contract.

Not all admins. Spec 15 documents where that approach leads.

## Design

### Schedule

One daily job, alongside spec 19's auto-close, in the same scheduler. Order
matters: **close expired contracts first, then send reminders**, or a contract
closed this morning generates a reminder this afternoon.

### Cadence

| When | Why |
|---|---|
| `dateEnd − noticePeriod − 14 days` | Enough time to act before the notice deadline |
| `dateEnd − 30 days` | The plain one-month warning |
| `dateEnd − 7 days` | Last call |
| `dateEnd + 1 day` | "This contract has expired and has been closed" — pairs with spec 19 |

Four points, deduplicated: a contract with a one-week notice period would otherwise
get two mails on the same day.

### Exactly once

The one hard requirement. A reminder job that re-sends every morning is worse than
no reminders, because people stop reading them in a week.

```prisma
/// One row per reminder actually sent. The unique constraint is the whole
/// mechanism: re-running the job sends nothing twice.
model ReminderLog {
  id         Int      @id @default(autoincrement())
  contractId Int
  contract   Contract @relation(fields: [contractId], references: [id], onDelete: Cascade)
  userId     Int
  kind       String   // "notice" | "30d" | "7d" | "expired"
  sentAt     DateTime @default(now())

  @@unique([contractId, userId, kind])
  @@index([sentAt])
}
```

The unique key does the work. The job selects candidates, filters out anything
already in the log, sends, and inserts — and a crash between send and insert
duplicates at most one message.

### Content

Polish, plain, short. Subject: **"Umowa {identifier} kończy się {data}"**. Body:
the counterparty, the subject, the end date, the notice period, the deadline it
implies, and a link to the record. No attachments, no HTML beyond a link — this is
a notification, not a document.

### Opt-out

Per user, because somebody will own 200 contracts. A `User.remindersEnabled`
default true, and an unsubscribe link that flips it. Reminders on a legal register
that cannot be turned off get filtered to a folder, which is the same as being off
with none of the honesty.

## What to build first

The screen, not the mail.

Spec 19 already specifies `/wygasajace`, and **a worklist delivers most of the
value with none of the prerequisites**. 41 contracts in a 90-day window is a page
somebody can check weekly, and it works today with no SMTP, no addresses and no
scheduler.

So: `/wygasajace` first (spec 19), an in-app notification second (spec 15's
`Shoutbox` already exists and needs no addresses), e-mail last, when Q1 lands.

That ordering also means the reminder rules get exercised against real data before
anything is sent to a real person.

## Implementation

| Path | Action | Note |
|---|---|---|
| `package.json` | modify | `nodemailer` |
| `lib/mail/transport.ts` | create | SMTP from the environment; a no-op transport when unconfigured |
| `lib/mail/templates.ts` | create | The four messages, Polish |
| `lib/reminders.ts` | create | `dueReminders(today)` — pure, testable, uses `isIndefinite` |
| `scripts/jobs/send-reminders.ts` | create | Dry-run by default, like spec 19's job |
| `prisma/schema.prisma` | modify | `ReminderLog`, `User.remindersEnabled`, `NoticePeriod.days` |
| `app/(app)/wygasajace/page.tsx` | use | Spec 19's screen, which is the first deliverable |

`dueReminders` is pure by design so spec 33 can test it without a clock, a database
or a mail server — and the date arithmetic around notice periods and the
`2099-12-31` sentinel is exactly the kind of thing that is wrong in a way nobody
notices.

The transport is a **no-op when SMTP is unconfigured**: it logs what it would send
and returns success. That lets the job run in every environment from day one
without pretending to have infrastructure it does not.

## Verification

```sql
-- 1. The population, with the sentinel handled correctly.
select case
         when "dateEnd" is null or "dateEnd" = date '2099-12-31' then 'bezterminowa'
         when "dateEnd" <  current_date      then 'po terminie'
         when "dateEnd" <= current_date + 30 then '<=30 dni'
         when "dateEnd" <= current_date + 90 then '31-90 dni'
         else 'dalej' end horizon, count(*)
from "Contract" where not "isDeleted" and "statusId" = 2
group by 1 order by 2 desc;
-- expected: dalej ~1950 | bezterminowa 1683 | po terminie 187 | <=30 13 | 31-90 28

-- 2. The trap: without isIndefinite these 1,638 look like dated contracts.
select count(*) from "Contract"
where not "isDeleted" and "statusId" = 2 and "dateEnd" = date '2099-12-31';
-- expected: 1638 — none of these may ever generate a reminder

-- 3. Notice periods, which turn a date into a deadline.
select np.id, np.name, count(c.id)
from "NoticePeriod" np
left join "Contract" c on c."noticePeriodId" = np.id and not c."isDeleted"
group by 1, 2 order by 3 desc;
-- 14 values; some are free text ("specyficzne") and have no day count — see Q94

-- 4. Whether anyone could be reached at all.
select count(*) filter (where email is not null) from "User";
-- expected today: 0 — the feature cannot send until Q1

-- 5. After go-live: nothing is ever sent twice.
select count(*) from (
  select "contractId", "userId", kind from "ReminderLog"
  group by 1,2,3 having count(*) > 1) d;
-- expected: 0, always
```

Manual checks:

- [ ] `dueReminders` returns **nothing** for a contract dated `2099-12-31`
- [ ] It returns nothing for a contract with no `dateEnd`
- [ ] A contract with a 3-month notice period ending in 90 days produces the
      `notice` reminder today, not the `30d` one
- [ ] A notice period with no day count (`"specyficzne"`) falls back to the plain
      30/7-day schedule and does not crash
- [ ] Running the job twice in one day sends **once**
- [ ] With SMTP unconfigured the job logs what it would send and exits 0
- [ ] A user with `remindersEnabled = false` receives nothing
- [ ] The e-mail names the contract, the counterparty, the date and the deadline,
      and links to the record
- [ ] The job runs **after** spec 19's auto-close in the same schedule
- [ ] `/wygasajace` shows the same 13 / 28 the job would act on
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Q33 — is this wanted?** Legacy never sent a reminder in fourteen years, so
   nobody is asking for something they lost. The argument for it is spec 19's 173
   stranded contracts. Recommend building `/wygasajace` first and deciding about
   e-mail once people have used it.
2. **Q93 — SMTP.** A host, a port, credentials and a sender address, and whether
   the company's relay will accept mail from this application. Blocked behind Q4.
3. **Q94 — how does a `NoticePeriod` become a number of days?** Fourteen dictionary
   values, some free text. Recommend an explicit `days Int?` column filled by hand
   once, rather than parsing the label — a parser that reads "3 miesiące" will
   eventually read something else wrongly and silently.
4. **Q1 carries over and blocks sending entirely.** No user has an e-mail address.
   Spec 25 narrows the ask to logins.
5. **Q95 — should reminders also cover projects?** 915 are "w toku" and 8,007 have
   an end date. A stalled project is a real problem, but "ends" means something
   different there, and spec 16's `/opinie` may be the better instrument.

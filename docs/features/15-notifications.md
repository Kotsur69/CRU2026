---
id: 15
title: Powiadomienia (in-app inbox)
group: C-missing-subsystems
status: in-progress
depends-on: [14]
legacy-tables: [shoutbox, shoutboxusers, shoutboxview, message, admins]
prisma-models: [Shoutbox, ShoutboxRecipient, MessageTemplate]
routes: ["/powiadomienia"]
---

# 15 — Powiadomienia (in-app inbox)

## Why

There are 14,683 notification deliveries in the database, **750 of them still
unread**, and no screen anywhere shows them. Our own application writes new ones every time
someone uses "zadaj pytanie" or "poproś o formularz" (`actions.ts:497,553`) and they
go straight into a table nobody reads.

Legacy had a full inbox: a view that joins the notification to its note and contract,
truncates the note to 150 characters, filters to unread and sorts newest first. That
view is the specification for this feature.

## Legacy behaviour

**Not documented in the audit at all.** `audyt_legacy_strony.md` never mentions
notifications, a bell, or an inbox — the auditor's account saw the contract preview
and the two registers, and this lives somewhere else. Everything below comes from the
dump.

### The inbox, as a view

`cru.sql:447516`:

```sql
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `shoutboxview` AS
select `su`.`id`, `su`.`shoutbox_id`, `s`.`contract_id`, `su`.`user_id`, `su`.`readed`,
       `m`.`name`, `c`.`identifier`, `r`.`created_on`,
       substr(`r`.`body`, 1, 150) AS `notice`,
       `r`.`user_id` AS `myid`
from ((((`shoutbox` `s`
     join `shoutboxusers`  `su` on ((`su`.`shoutbox_id` = `s`.`id`)))
     join `message`        `m`  on ((`m`.`id`  = `s`.`message_id`)))
     join `contract`       `c`  on ((`c`.`id`  = `s`.`contract_id`)))
     join `remarks`        `r`  on ((`r`.`id`  = `s`.`remark_id`)))
where (`su`.`readed` = 0)
order by `r`.`created_on` desc;
```

Everything the screen needs is in there:

- **unread only** (`readed = 0`) — the inbox is a queue, not an archive;
- **newest first**, by the note's creation time, not the notification's;
- a **150-character excerpt** of the note body;
- the contract **identifier** as the subject line;
- the message **template name** as the notification type;
- `myid` — the note's author, so the UI can mark or mute your own notes.

All four joins are `INNER`. A notification whose note or contract was deleted
silently disappears from the inbox rather than rendering broken.

### The fan-out, as a trigger

`cru.sql:447494`:

```sql
CREATE TRIGGER `shoutbox_after_insert` AFTER INSERT ON `shoutbox` FOR EACH ROW BEGIN
	insert into shoutboxusers (shoutbox_id, user_id)
	select new.id, user_id from admins;
END
```

**Every notification goes to every administrator**, and to nobody else. Not to the
contract's owners, not to the person who asked, not to the reviewers. This is the
entire recipient-selection logic of the legacy system and it is invisible from the
schema — it lives in a trigger.

### The data confirms it

| Property | Value |
|---|---|
| `Shoutbox` rows | 1,184 |
| … with `messageId` / `contractId` / `remarkId` | 1,184 / 1,184 / 1,184 — **never null** |
| `ShoutboxRecipient` rows | 14,683 |
| **Read / unread** | **13,933 / 750** — `readed = 1` is *read* |
| Recipients per notification | avg 12.4, min 1, max 19 |
| **Distinct users who ever received one** | **21** |

Twenty-one people across eleven years, with a fan-out that tracks the size of the
admin list as it grew and shrank (currently 10 entries, 16 revoked). That is the
trigger, exactly.

**94.9% read.** The polarity is worth stating plainly because it is easy to get
backwards: legacy's column is `readed int(1) DEFAULT '0'` and `shoutboxview`
selects `WHERE su.readed = 0` (`cru.sql:431756`, `:447516`), so 1 means read.
An earlier draft of this document — and `plan.md` — reported 13,933 as *unread*.
It is the opposite.

So the inbox was **used**: the twenty-one people who received notifications
drained them, leaving 750 outstanding, about 36 each. That strengthens the case for
building the screen and weakens one argument against the all-admins trigger — the
recipients were not ignoring it. The case for changing the recipients rests on the
fan-out data below, not on fatigue.

### Message templates

`message` has exactly one row: `(1, 'nowa notatka')`. Every one of the 1,184
notifications is of that type, and every one references a note. So in practice the
notification system does one thing: *somebody added a note to a contract*.

`Shoutbox.remarkId` is never null, which means there is no such thing as a
notification without a note. Our `requestAcceptanceForm` (`actions.ts:542-553`)
already respects this — it creates a `Remark` first, then the `Shoutbox` pointing at
it.

## Legacy quirks

### Quirk: notifications go to all administrators, not to interested parties

- **Legacy:** the trigger above. 21 distinct recipients ever; contract owners are
  never notified about their own contracts unless they happen to be admins.
- **Why it is wrong:** it makes the inbox useless for the people who need it —
  a contract owner is never told about a note on their own contract unless they
  happen to be an administrator — and it puts every note in front of ten people who
  mostly do not need it. Note that the read rate does **not** support the "nobody
  reads it" version of this argument: 94.9% were read.
- **We do:** notify the people connected to the record — its owners
  (`ContractUser`), its active reviewers (`Opinion.userId` where `active`), and the
  note's author excluded (you do not need telling about your own note). Keep an admin
  opt-in rather than an automatic blanket.
- **Sign-off:** **REQUIRED — behaviour change** (Q5). This is the single largest
  deliberate divergence in the whole spec set, and the one most likely to be noticed
  on day one: the ten current admins will stop receiving everything, and roughly 370
  contract owners will start receiving something.

### Quirk: the inbox hides rather than degrades

- **Legacy:** four inner joins, so a notification loses its note or its contract and
  vanishes.
- **Why it matters:** with soft delete everywhere in the new system this is mostly
  theoretical, but a hard-deleted contract would silently drop notifications.
- **We do:** left-join and render a tombstone ("umowa usunięta") rather than hiding
  the row. Hiding is how you lose a task nobody knows they had.
- **Sign-off:** not needed.

### Quirk: read state is per recipient and never reset

- **Legacy:** `shoutboxusers.readed`, no timestamp, no "mark all".
- **We do:** keep the flag, add `readAt` so the inbox can show when something was
  handled, and offer "oznacz wszystkie jako przeczytane". With 750 outstanding
  across 21 people the bulk action is a convenience rather than a necessity, but it
  costs nothing.
- **Sign-off:** not needed. Note the migration adds a nullable column; historical
  rows have no read timestamp and never will.

## UI

### Routes

| Route | File | Kind |
|---|---|---|
| `/powiadomienia` | `app/(app)/powiadomienia/page.tsx` | list |

Plus a bell in `components/layout/topbar.tsx` with an unread count.

### Screen: Powiadomienia

Header "Powiadomienia" with the unread count, and "oznacz wszystkie jako
przeczytane".

Tabs or a filter: **Nieprzeczytane** (default, legacy's only view) / **Wszystkie**.
Legacy shows unread only; an archive is ours, and it is the right call given the
volume — being unable to find something you already read is worse than a longer list.

Each row:

```
● 2026-07-16 10:16   AMDSP/DYS/2026/0006   nowa notatka
  Prosze o weryfikacje terminu platnosci w par. 4 — kontrahent…     ← 150 chars
  mgolosz                                                   [oznacz jako przeczytane]
```

- Unread rows carry the dot and a heavier weight; read rows are muted.
- The identifier links to the record.
- The excerpt is 150 characters, legacy's exact limit, with an ellipsis.
- Your own notes are muted further — that is what `myid` was for.
- Clicking the row marks it read and navigates to the record's note thread.

Empty state: "Brak nowych powiadomień."

Pagination: `Pagination` (`components/ui/pagination.tsx`), default 25.

### The bell

In the topbar, next to the user menu. Shows the unread count capped at "99+".
Server-rendered on each navigation — no polling. This is an internal register with
a handful of notifications a week; a websocket would be over-engineering.

## Implementation

### Files

| Path | Action | Note |
|---|---|---|
| `app/(app)/powiadomienia/page.tsx` | create | The inbox, following the register recipe in spec 05 |
| `features/powiadomienia/inbox-list.tsx` | create | Row rendering |
| `features/powiadomienia/actions.ts` | create | `markRead`, `markAllRead` |
| `lib/notifications.ts` | create | `notifyAboutRemark(tx, remarkId, …)` — the fan-out, in one place |
| `components/layout/topbar.tsx` | modify | The bell and the count |
| `features/kontrakty/actions.ts` | modify | `askQuestion` and `requestAcceptanceForm` call the shared fan-out |
| `lib/nav.ts` | modify | Only if the inbox gets a nav entry rather than just the bell |
| `prisma/schema.prisma` | modify | `ShoutboxRecipient.readAt DateTime?` |

### The fan-out helper

One function, called inside the same transaction as the note that triggers it:

```ts
/**
 * Recipients of a note notification: the contract's owners and its active reviewers,
 * minus the note's author. Replaces legacy's trigger, which fanned out to every
 * administrator regardless of the contract (see the quirk above).
 */
export async function notifyAboutRemark(
  tx: Prisma.TransactionClient,
  input: { remarkId: number; contractId: number; authorId: number },
): Promise<void>;
```

It writes one `Shoutbox` and N `ShoutboxRecipient` rows, exactly as
`actions.ts:494-500` does today, but with a recipient list that depends on the
contract. Both existing writers switch to it so the rule lives in one place.

### Reuse

- `components/ui/pagination.tsx`, `components/ui/badge.tsx`, `components/ui/clickable-row.tsx`
- `lib/format.ts` — `formatDateTime`, `userLabel`
- `lib/utils.ts` — `pageParam`, `pageSizeParam`
- `lib/authz.ts` — `requireActor`; the inbox is per-actor by construction, so no
  extra scope filter is needed, but a notification pointing at a record the user can
  no longer read must render the tombstone rather than the identifier (spec 03)

### Server actions

| Action | Signature | Authorization | Validation | Writes |
|---|---|---|---|---|
| `markRead` | `(formData) => Promise<void>` | `requireActor`; the recipient row must belong to the actor | id integer | `ShoutboxRecipient.update {isRead:true, readAt:now}` |
| `markAllRead` | `() => Promise<void>` | `requireActor` | — | `ShoutboxRecipient.updateMany` scoped to the actor |

A recipient row belonging to someone else must 404, not 403.

## Verification

```sql
-- 1. Baseline.
select (select count(*) from "Shoutbox")                                  as events,
       (select count(*) from "ShoutboxRecipient")                         as deliveries,
       (select count(*) from "ShoutboxRecipient" where "isRead")          as read_,
       (select count(*) from "ShoutboxRecipient" where not "isRead")      as unread,
       (select count(distinct "userId") from "ShoutboxRecipient")         as recipients;
-- expected: 1184 | 14683 | 13933 read | 750 unread | 21
-- note the polarity: legacy `readed = 1` means READ (cru.sql:431756, :447516)

-- 2. Fan-out shape — the evidence for the all-admins trigger.
select round(avg(n),1), min(n), max(n)
from (select "shoutboxId", count(*) n from "ShoutboxRecipient" group by 1) g;
-- expected: 12.4 | 1 | 19

-- 3. Every notification has all three references (no nulls in legacy data).
select count(*) from "Shoutbox"
where "messageId" is null or "contractId" is null or "remarkId" is null;
-- expected: 0

-- 4. Reproduce the legacy inbox for one user and compare to the new screen.
select s."contractId", c.identifier, m.name, r."createdAt",
       substr(r.body, 1, 150) as notice, r."userId" as author
from "ShoutboxRecipient" su
join "Shoutbox" s on s.id = su."shoutboxId"
join "MessageTemplate" m on m.id = s."messageId"
join "Contract" c on c.id = s."contractId"
join "Remark" r on r.id = s."remarkId"
where su."userId" = <uid> and not su."isRead"
order by r."createdAt" desc;

-- 5. After the fan-out change: new notifications must reach owners, not admins.
--    Add a note to a contract, then:
select u.login, cu."readOnly"
from "ShoutboxRecipient" su
join "User" u on u.id = su."userId"
left join "ContractUser" cu on cu."userId" = su."userId" and cu."contractId" = <cid>
where su."shoutboxId" = (select max(id) from "Shoutbox");
-- expected: the contract's owners and active reviewers; not the ten admins;
--           not the note's author
```

Manual checks:

- [ ] The bell shows a count; it drops when an item is marked read
- [ ] The inbox lists unread first, newest first, with 150-character excerpts
- [ ] Clicking a row marks it read and lands on the record's note thread
- [ ] "Oznacz wszystkie jako przeczytane" clears the count in one action
- [ ] A notification for a soft-deleted contract renders a tombstone, not a blank row
- [ ] Marking someone else's notification read by id — 404
- [ ] Add a note as user A on a contract owned by B and C — B and C get a
      notification, A does not
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Q5 (sign-off) — recipient selection.** Notify owners and reviewers instead of
   all administrators. Confirm, and decide whether administrators keep an opt-in
   "notify me about everything" switch.
2. **What to do with the 750 historical unread items.** They belong to 21 people,
   mostly admins, and are up to eleven years old — about 36 each. Small enough to
   leave alone, which is the recommendation: no migration, no bulk mark-as-read, and
   the first login shows a genuine, short backlog rather than a wall.
3. **Are notifications ever needed for anything other than notes?** `message` has one
   row. Status changes, opinion requests and expiring contracts are all plausible
   future types — spec 19 (auto-close) and spec 16 (opinions) both have a natural
   claim. Keep `MessageTemplate` as a real table rather than an enum so new types do
   not need a migration.
4. **E-mail.** Legacy sends none from here, and neither do we (`actions.ts:464-468`
   says so explicitly). Spec 29 introduces SMTP; at that point notifications become a
   candidate for e-mail delivery, which changes the noise calculus considerably.

## Implementation notes (2026-09-24)

**Status: in progress.** The inbox is built. **Recipient selection is not changed**:
the quirk "notifications go to all administrators" is marked "REQUIRED — behaviour
change" (Q5). Every writer now goes through one helper,
`lib/notifications.ts` → `notifyAboutRemark`, which keeps this application's
existing rule: the record's owners minus the note's author (legacy's trigger went to
all administrators). Once Q5 is decided, only `defaultRecipients` changes — for
example adding active reviewers and an admin opt-in.

Built:

- **Schema:** `ShoutboxRecipient.readAt DateTime?` (migration
  `20260924110000_notification_read_at`). Historical rows stay null.
- **`/powiadomienia`:** "Nieprzeczytane" (default, legacy's only view) and
  "Wszystkie", newest first by the note's date, 150-character excerpts, an unread
  dot and weight, own notes muted "(Ty)", read time shown in the archive, 25 per
  page, "Brak nowych powiadomień.". A notification whose contract was soft-deleted
  renders the tombstone "umowa usunięta" instead of disappearing; a missing note
  renders "notatka usunięta".
- **Actions:** `markRead`, `markAllRead` (own rows only; someone else's id is a 404).
  Opening a notification goes through `GET /powiadomienia/[id]`: it marks the row
  read and redirects to `…/[id]#notatki`. A route handler rather than a server
  action because only an HTTP redirect keeps the anchor. The inbox links to it with
  a plain `<a>`, so prefetch never marks anything read.
- **Bell:** `components/layout/notification-bell.tsx` in the topbar, showing the
  unread count ("99+" cap). It refreshes on every navigation through
  `/api/powiadomienia/licznik`, with no background polling.
- `askQuestion`, "dodaj notatkę" (spec 14) and `requestAcceptanceForm` all use the
  helper. The acceptance-form request passes its single, named recipient.
- **Open question 2** (the 750 historical unread): left alone, as recommended.

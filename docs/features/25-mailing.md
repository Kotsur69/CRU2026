---
id: 25
title: Mailing
group: D-supporting
status: todo
depends-on: [29]
legacy-tables: [mailing_lists, mailing_groups, message]
prisma-models: [MailingContact, MailingGroup, MessageTemplate]
routes: ["/mailing", "/mailing/[id]"]
---

# 25 — Mailing

## Why

On the face of it this is the emptiest module in the system: 275 contacts, **one**
group called `test`, **one** template called `nowa notatka`, and no evidence that a
single message was ever sent. The honest summary is that the feature was started
and abandoned.

But the 275 contacts are not empty at all. They are **real people with real
`@arcelormittal.com` addresses**:

```
Krzysztof Andrzejczak    krzysztof.andrzejczak@arcelormittal.com
Beata Jachym             beata.jachym@arcelormittal.com
Adrian Długosz           adrian.dlugosz@arcelormittal.com
Agnieszka Gołembka-Rosikoń  agnieszka.golembka-rosikon@arcelormittal.com
```

`User.email` is null on all 452 rows and `User.login` is a placeholder on 451 of
them (spec 04). So **`mailing_lists` is the only table in the entire database that
contains a real human name paired with a real address**, and nobody has noticed.

That makes this spec worth more than its feature. It is a partial answer to Q1, the
blocking question the whole project has been waiting on.

## Legacy behaviour

`audyt §3.–8.`: **`Access deny!`** at `/cru/index.php/mailmanagments/index`. Never
observed. The audit's guess (`§8`) is *"zarządzanie mailami (prawdopodobnie
szablony/wysyłki/przypomnienia)"*.

### The tables

`cru.sql:362873` and `:362885`:

```sql
CREATE TABLE IF NOT EXISTS `mailing_groups` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` char(50) COLLATE utf8_polish_ci DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2;
-- one row: (1, 'test')

CREATE TABLE IF NOT EXISTS `mailing_lists` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` char(50), `surname` char(50), `email` char(50),
  `mailing_group_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`), KEY `mailing_group_id` (`mailing_group_id`)
) ENGINE=InnoDB AUTO_INCREMENT=603;
```

`AUTO_INCREMENT=603` against 275 surviving rows, so **328 contacts were deleted** —
the list was maintained, then largely emptied.

The third table, `message`, holds notification templates and is spec 15's, not
this module's: one row, `(1, 'nowa notatka')`, referenced by all 1,184 `Shoutbox`
events.

### What is missing

No send log, no scheduled job, no SMTP configuration, no subject, no body, no
template variables. `message.name` is a label, not content. There is **no evidence
anywhere in the dump that this module ever sent an e-mail.**

## Data

| | Value |
|---|---|
| `MailingContact` rows | **275** |
| With a first name | 275 |
| With a surname | 275 |
| **With an e-mail address** | **269** — 6 have none |
| **Assigned to a group** | **0** |
| `MailingGroup` rows | **1** — `test` |
| `MessageTemplate` rows | **1** — `nowa notatka` |
| Deleted contacts (from `AUTO_INCREMENT`) | ~328 |

**Every contact has `mailing_group_id = NULL`.** The one group exists and contains
nobody. So the grouping mechanism was built, one test group was created, and no
contact was ever put in it.

### The address pattern

Every address follows `imie.nazwisko@arcelormittal.com`, lower-cased, with Polish
diacritics folded (`Gołembka-Rosikoń` → `golembka-rosikon`, `Długosz` → `dlugosz`).

The audit records two real logins from the contract preview (`audyt §1.4`, fields 31
and 33): **`mborowiecka`** and **`mgolosz`** — first initial plus surname. So the
two conventions are derivable from each other in one direction: given a login
`mborowiecka` and a contact `Małgorzata Borowiecka`, the match is unambiguous.

That does **not** unblock Q1 on its own, because we hold neither the real logins
(451 placeholders) nor a `user_id` on `mailing_lists`. But it means that **if the
Bytom admins can supply logins alone** — a single column — the mailing table
supplies names and addresses for up to 275 of the 452 users without any further
export. Worth saying when Q1 is asked.

## Legacy quirks

### Quirk: 275 real names and addresses are sitting unused in the database

- **Data:** 275 contacts, 269 with an address, all `@arcelormittal.com`, while
  `User.email` is null on all 452 rows.
- **Why it matters:** spec 04 treats the directory as entirely missing and blocks on
  an export (Q1). It is not entirely missing — a bit over half of it is here.
- **We do:** two things. Say so in spec 04 and in the Q1 request, so the ask to
  Bytom becomes "logins, and only logins" rather than a full directory export. And
  build the matching as an **opt-in admin tool**, never an automatic merge:
  `scripts/legacy/match-mailing-to-users.ts` proposes login ↔ contact pairs by the
  initial-plus-surname rule and writes nothing until a human approves the list.
- **Sign-off:** **yes** for applying any match. Attaching a wrong name and address
  to a user account is worse than leaving a placeholder.

### Quirk: the feature was never configured

- **Data:** one group named `test`, containing nobody; one template named
  `nowa notatka` with no body; no send log.
- **We do:** **do not build a mailing feature.** There is nothing to reproduce —
  no observed screen, no data shape to honour, no user who will miss it. What the
  data supports is a **contact list**, and that is what this spec builds.
- **Sign-off:** not needed. Recorded so nobody reads "Mailing" in the legacy menu
  and schedules a campaign tool.

### Quirk: `email` is `char(50)` and six contacts have none

- **Legacy:** `char(50)` — fixed width, and the longest address we hold is close to
  it. `agnieszka.golembka-rosikon@arcelormittal.com` is 44 characters; a longer
  Polish surname would have been truncated silently.
- **We do:** check for truncation on import (any address of exactly 50 characters,
  or one not ending in a valid TLD) and report it. The six with no address stay,
  flagged **"brak adresu"** — a name is still directory data.
- **Sign-off:** not needed.

### Quirk: the `message` template belongs to notifications, not here

- **Data:** `message` has one row, referenced by all 1,184 `Shoutbox` events
  (spec 15). It is the notification's *type*, not an e-mail template.
- **We do:** do not surface it under Mailing. Spec 15 owns it. Recorded because the
  Prisma model is called `MessageTemplate`, which invites the wrong grouping.
- **Sign-off:** not needed.

## UI

### /mailing

`requireAdmin` — it is a list of staff names and addresses. The module already uses
`FilterBar`; keep it, 275 rows, page size 50.

Columns: Imię · Nazwisko · E-mail · Grupa · **Dopasowany użytkownik**.

The last column is the point of the screen: whether this contact has been matched
to a `User`, and if so which. Empty on all 275 today.

Filters: name/e-mail text, **"bez adresu"** (6), **"niedopasowani"**.

### /mailing/[id]

Small: the four fields, the group, the matched user, and an admin action to set or
clear the match.

### The matching tool

Not a screen — a script, run once, reviewed by a person:

```ts
/** Proposes `User.login` ↔ `MailingContact` pairs using the two conventions the
 *  data shows: logins are first-initial + surname (`mborowiecka`), addresses are
 *  imie.nazwisko@arcelormittal.com with diacritics folded. Writes nothing.
 *  See docs/features/25 and spec 04's Q1. */
```

Output is a three-column report — login, proposed contact, confidence — split into
unambiguous matches, ambiguous ones (two contacts share a surname and initial) and
unmatched. An admin approves the first group wholesale and the second one by one.

**It cannot run until real logins exist.** Until then the script is written,
tested against the two logins the audit gives us, and idle.

## Implementation

| Path | Action | Note |
|---|---|---|
| `app/(app)/mailing/page.tsx` | modify | `requireAdmin`; the match column; two filters |
| `app/(app)/mailing/[id]/page.tsx` | create | Detail plus the match action |
| `scripts/legacy/match-mailing-to-users.ts` | create | Proposes, never writes |
| `prisma/schema.prisma` | modify | `MailingContact.userId Int?` — the approved match |

Nothing else. No send, no campaign, no SMTP — spec 29 owns outbound mail, and it
has no infrastructure either.

## Verification

```sql
-- 1. The whole module.
select (select count(*) from "MailingContact")                          contacts,
       (select count(*) from "MailingContact" where email is not null)  with_email,
       (select count(*) from "MailingContact" where "mailingGroupId" is not null) grouped,
       (select count(*) from "MailingGroup")                            groups,
       (select count(*) from "MessageTemplate")                         templates;
-- expected: 275 | 269 | 0 | 1 | 1

-- 2. The one group and the one template.
select id, name from "MailingGroup";      -- expected: 1 | test
select id, name from "MessageTemplate";   -- expected: 1 | nowa notatka

-- 3. Every address is an ArcelorMittal one.
select count(*) filter (where email like '%@arcelormittal.com') internal,
       count(*) filter (where email is not null and email not like '%@arcelormittal.com') other
from "MailingContact";
-- expected: 269 | 0

-- 4. Truncation check — `char(50)` in legacy.
select count(*) from "MailingContact" where length(email) >= 50;
-- expected: 0; anything here was cut off on the way in

-- 5. The directory gap this module partly fills.
select (select count(*) from "User")                            users,
       (select count(*) from "User" where email is not null)    users_with_email,
       (select count(*) from "MailingContact" where email is not null) contacts_with_email;
-- expected: 452 | 0 | 269
```

Manual checks:

- [ ] A non-admin gets 404 on `/mailing`
- [ ] 275 contacts listed, 50 per page
- [ ] The six with no address are findable with the "bez adresu" filter
- [ ] The "Dopasowany użytkownik" column is empty on all 275 and says so plainly
- [ ] The matching script runs against the two logins the audit gives (`mborowiecka`,
      `mgolosz`) and proposes the right contacts, if those people are in the list
- [ ] The script writes nothing on its own
- [ ] Approving a match sets `MailingContact.userId` and fills the user's name and
      e-mail — and appears in `AccessAudit` (spec 23), because it changes an identity
- [ ] There is **no send button anywhere**
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Q67 — may we use the mailing list as a directory source?** 269 real names and
   addresses against 451 placeholder users. Matching them fills in more than half
   the directory without any export, and it attaches a real identity to an account
   on the strength of a naming convention. Recommend: build the proposal tool, apply
   nothing without review. **Directly relevant to Q1 — the ask to Bytom can be
   narrowed to logins alone.**
2. **Q68 — is a mailing feature wanted at all?** Legacy has one group named `test`
   and no evidence of a send. Recommend building a contact list and nothing more,
   and treating outbound mail as spec 29's problem.
3. **Q69 — what happened to the 328 deleted contacts?** `AUTO_INCREMENT=603` against
   275 rows. If the list was pruned when people left, it is a leavers list and the
   remaining 275 are current staff — useful to know before matching.
4. **Q1 carries over**, narrowed: the export needs to supply **logins**; names and
   addresses may already be here.

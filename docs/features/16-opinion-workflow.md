---
id: 16
title: Obieg opinii (FAU workflow)
group: C-missing-subsystems
status: todo
depends-on: [01, 15]
legacy-tables: [opinions, opiniontypes, group, users_groups]
prisma-models: [Opinion, OpinionType, Group, UserGroup, Contract, ContractStatus]
routes: ["/projekty/[id]", "/projekty/[id]/opinie", "/opinie"]
---

# 16 — Obieg opinii (FAU workflow)

## Why

FAU — **Formularz Akceptacji Umowy** — is the internal approval round a draft
contract goes through before anyone signs it. The audit calls a project
"an entity that exists *before* the contract: the process of getting to a signature
(opiniowanie → wysłanie do podpisu → obieg FAU → umowa/rezygnacja)"
(`audyt §2.2`, line 110). Opinions are that process made concrete.

It is the largest unbuilt subsystem by usage: **16,531 opinion rows on 3,923
records**, spread over six years. Two of the thirteen contract statuses exist only
to describe where a record sits in this round ("Projekt - rozpoczęto obieg FAU",
"Projekt - zakończono obieg FAU"), and the Projekty register carries two columns
("Opiniujący", "Wysł. do podp.") that report on it.

Today the round is **read-only**: `app/(app)/projekty/[id]/page.tsx:375-414`
renders the imported rows in a "Obieg FAU" section and nothing more. There is no way
to start a round, to ask somebody for an opinion, to answer one, or to see what is
owed to you. **3,702 opinion requests are open and unanswered right now**, and
nobody can see them.

## Legacy behaviour

### What the audit saw

Only three fragments were observable, because the auditor's account never opened a
project with records (`audyt §2.5`, marked `[NIEZNANE]`):

| Fragment | Where | Cited |
|---|---|---|
| "Formularz akceptacji umowy" | contract preview, `/contract/acceptform/{id}` | `audyt §1.4` |
| "obieg FAU", "Opiniujący" | project statuses and the Projekty list | `audyt §2.2`, `§2.4` |
| "zaległe opinie" | report `/raport/opinions` | `audyt §3.` and `§11.4` |

The audit's own gap list names this explicitly as unknown item 4: *"Workflow FAU
(akceptacja umowy) — pełna logika obiegu: kto opiniuje, jakie kroki, jak generowany
PDF, przejścia statusów projektu"* (`audyt §11.4`). Everything below that is not a
cited UI observation is derived from the schema and the data, and is marked.

### The legacy table

`cru.sql:363187`:

```sql
CREATE TABLE IF NOT EXISTS `opinions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `contract_id` int(11) NOT NULL,
  `opiniontype_id` int(2) DEFAULT NULL COMMENT '1 - opinia działu ryzyka\r\n
                                                 2 - opinia działu administracyjno-prawnego /
                                                     prowadzącego prawnika',
  `desc` text COLLATE utf8_polish_ci NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `signature` tinyint(1) NOT NULL,
  `sign_date` datetime DEFAULT NULL,
  `active` int(11) NOT NULL DEFAULT '1',
  `nomdr` int(1) NOT NULL DEFAULT '0',
  `form_ver` int(1) NOT NULL DEFAULT '0',
  `send_ver` int(1) NOT NULL DEFAULT '0',
  `sendinfo` int(1) DEFAULT '0',
  `disableMailing` int(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `contract_id` (`contract_id`),
  CONSTRAINT `opinions_contract` FOREIGN KEY (`contract_id`) REFERENCES `contract` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=17081;
```

And the dictionary, `cru.sql:379743`:

```sql
CREATE TABLE IF NOT EXISTS `opiniontypes` (
  `id` int(2) NOT NULL AUTO_INCREMENT,
  `group_id` int(11) DEFAULT NULL,
  `name` varchar(50) COLLATE utf8_polish_ci DEFAULT NULL,
  PRIMARY KEY (`id`), KEY `group_id` (`group_id`)
) ENGINE=MyISAM AUTO_INCREMENT=10;
```

There is **no view, no procedure and no trigger** for opinions anywhere in the dump —
unlike numbering (`contractview`), expiry (`SetEndContract`) and notifications
(`shoutbox_after_insert`). The workflow logic lived entirely in CakePHP controller
code, which we do not have. This is why so much of this spec is data-derived.

### The central fact: one row = one person asked

This is the thing to get right, and it is not obvious from the schema.

An `opinions` row is **not** "the opinion of type X on contract Y". It is
**"we asked user U for an opinion of type T on contract C"**. The same type appears
several times on one contract, once per person asked, and each carries its own
answer.

Evidence — contract 12728, every row active:

| type | user | `signedAt` | `desc` |
|---|---|---|---|
| 1 Właściciel umowy | 50289 | 2021-05-05 14:42 | "Potwierdzam wykonanie badań…" |
| 1 Właściciel umowy | 724 | 2021-05-05 14:18 | "Potwierdzam wykonanie badań…" |
| 1 Właściciel umowy | 50638 | 2021-05-19 15:19 | "Potwierdzam wykonanie usługi…" |
| 1 Właściciel umowy | 50315 | — | — |
| 1 Właściciel umowy | 205 | 2021-05-06 07:59 | "Potwierdzam wykonanie badania…" |
| 1 Właściciel umowy | 194 | — | — |
| 3 Dyrektor Klastra | 50546 | — | — |
| 5 DPA | 50464 | 2021-05-05 14:15 | "umowa sporządzona zgodnie z wz…" |

508 `(contract, type)` pairs carry more than one row, and **338 of those have more
than one row still active** — so duplication is the normal state, not a data fault:

| Active rows in a duplicated pair | Pairs |
|---|---|
| 0 | 13 |
| 1 | 157 |
| 2 | 255 |
| 3 | 47 |
| 4 | 22 |
| 5 | 6 |
| 6 | 6 |
| 7 | 1 |
| 11 | 1 |

A round is therefore a **set of per-person requests**, and "the round is complete"
means every active request has an answer.

## Data

### Opinion types and their groups

All nine, with the group named on `opiniontypes.group_id` and the live row counts:

| id | Name | Group | Group members | Opinion rows | Pending |
|---|---|---|---|---|---|
| 1 | Właściciel umowy | 2 Właściciele umów | 343 | 4,200 | 311 |
| 2 | Przełożony | 9 Przełożeni | 31 | 2,484 | 242 |
| 3 | Dyrektor Klastra | 10 Dyrektor Klastra | 2 | 2,615 | **2,264** |
| 4 | CreditRisk | 8 Dział ryzyka | 11 | 1,798 | 27 |
| 5 | DPA | 1 Dział prawny | 5 | 3,961 | 446 |
| 6 | INNE | — (`group_id = 0`) | — | 1,266 | 240 |
| 7 | Dyrektor Sieci Sprzedaży | 16 | 1 | 42 | 21 |
| 8 | Dyrektor Zespołu Projektów | 15 | 1 | 164 | 136 |
| 9 | CEO Dystrybucja | 14 | 1 | 1 | 0 |

"Pending" = `active AND signedAt IS NULL` on a non-deleted contract. Total 3,702.

DPA = *Dział Prawny i Administracji*. Type 6 "INNE" carries `group_id = 0` in the
dump — the same "zero is a real value, not a null" pattern spec 01 documents for the
other dictionaries. Our import mapped it to `NULL`, which is the right call here
because group 0 does not exist, but it means the legacy value is lost.

### Totals

| Property | Value |
|---|---|
| Rows | 16,531 |
| Active | 16,183 |
| Inactive (`active = 0`) | 348 |
| `signature = 1` | **0 — on every row, all six years** |
| `sign_date` populated | 12,520 |
| Answered and still active | 12,481 |
| **Pending (active, no answer)** | **3,702** |
| Empty `desc` | 4,842 (29%) |
| `desc` length | min 0, avg 39, max 3,987 |
| `nomdr` | 3,715 |
| `form_ver` | 44 |
| `send_ver` | 52 |
| `sendinfo` | 16,518 |
| `disableMailing` | 2,259 |
| `opiniontype_id` null | 0 |
| `user_id` null | 0 |
| Answer date range | 2020-05-14 → 2026-08-10 |

### Which module uses opinions

| Module | Records | Opinion rows |
|---|---|---|
| PROJECT | 3,883 | 16,396 |
| CONTRACT | 40 | 135 |
| RISK | 0 | 0 |

**This is a Projekty feature.** The 40 contract-module records are almost certainly
projects that were later promoted to contracts and kept their round — the transition
`Projekt - zakończono obieg FAU → Obowiązująca` occurs 1,186 times in the change log.
Build it on the project detail page; show it read-only on a contract that happens to
carry rows.

### Shape of a round

Opinions per record, and distinct types per record:

| Rows | Records | | Distinct types | Records |
|---|---|---|---|---|
| 1 | 4 | | 1 | 4 |
| 2 | 139 | | 2 | 161 |
| 3 | 803 | | 3 | 948 |
| 4 | **1,523** | | 4 | **1,621** |
| 5 | 1,049 | | 5 | 925 |
| 6 | 367 | | 6 | 264 |
| 7–14 | 38 | | | |

The modal round is **four types, four people**. Nothing uses more than six of the
nine types. Design the UI for four to six rows and let it grow.

Answer latency, measured from the contract's registration date because the request
date is not stored (see the quirk below): median **1 day**, mean 14 days.

### The FAU status transitions

Status changes are recorded in `ContractHistory` as **labels, not ids**
(spec 13). Every transition that touches an FAU status, with counts:

| From | To | Count |
|---|---|---|
| Projekt - zakończono obieg FAU | Obowiązująca | 1,186 |
| Projekt - zakończono obieg FAU | Projekt - wysłane do podpisu | 889 |
| Projekt - rozpoczęto obieg FAU | Obowiązująca | 361 |
| Projekt - zakończono obieg FAU | (brak danych) | 339 |
| Projekt - zakończono obieg FAU | Zakończona | 284 |
| Projekt - rozpoczęto obieg FAU | (brak danych) | 246 |
| Projekt - rozpoczęto obieg FAU | Zakończona | 85 |
| Projekt - rozpoczęto obieg FAU | Projekt - wysłane do podpisu | 68 |
| Projekt - rozpoczęto obieg FAU | Projekt - anulowany | 52 |
| Projekt - zakończono obieg FAU | Projekt - anulowany | 37 |
| (empty) | Projekt - rozpoczęto obieg FAU | 8 |
| Projekt - rozpoczęto obieg FAU | Projekt - w toku | 8 |
| Projekt - wysłane do podpisu | Projekt - rozpoczęto obieg FAU | 7 |
| Projekt - zakończono obieg FAU | Projekt - zakończony | 5 |
| Projekt - rozpoczęto obieg FAU | Projekt - zakończony | 4 |
| Projekt - zakończono obieg FAU | Projekt - rozpoczęto obieg FAU | 3 |
| Projekt - wysłane do podpisu | Projekt - zakończono obieg FAU | 3 |
| Projekt - w toku | Projekt - rozpoczęto obieg FAU | 3 |
| Projekt - anulowany | Projekt - rozpoczęto obieg FAU | 2 |
| Projekt - zakończono obieg FAU | Projekt - w toku | 1 |
| Projekt - rozpoczęto obieg FAU | Projekt - zrealizowany brak umowy | 1 |
| Projekt - rozpoczęto obieg FAU | Projekt - zakończono obieg FAU | **1** |

Two things stand out, and both must shape the design.

**The happy path is almost never recorded.** `rozpoczęto → zakończono` — the one
transition the state machine is named after — appears **once** in 237,405 audited
changes. Meanwhile `zakończono → Obowiązująca` appears 1,186 times. The conclusion:
legacy did not *walk* records through 12 → 13. Something set status 13 directly
(`[INFERRED]` — most likely the FAU form's own save path, which is controller code we
do not have, and which evidently bypassed the history writer the same way the
auto-close procedure does in spec 19). Status 12 is a rarely-used intermediate: only
**55 live records** sit in it against 382 in status 13.

**The graph is not a tree.** Every FAU status can move to almost every other,
including backwards (`wysłane do podpisu → rozpoczęto obieg FAU`, 7 times;
`anulowany → rozpoczęto obieg FAU`, twice). So do **not** encode a strict state
machine that forbids transitions. Legacy allowed any status to be picked from the
dropdown, and eleven years of data say users relied on that.

Live record counts in the four workflow statuses, with their open requests:

| Status | Records | Pending opinions on them |
|---|---|---|
| 4 Projekt - w toku | 915 | 0 |
| 7 Projekt - wysłane do podpisu | 189 | 56 |
| 12 Projekt - rozpoczęto obieg FAU | 55 | 85 |
| 13 Projekt - zakończono obieg FAU | 382 | 428 |

Status 13 means "the round is closed" and yet carries 428 unanswered requests.
The status and the request state are independent in legacy; treat them that way.

### Related contract columns

| Prisma | Legacy | Fill | Note |
|---|---|---|---|
| `opinionsRequested` | `giveopinions` | 13,790 true | **Wrong type** — see the quirk below |
| `sentOn` | `date_send` | 3,750 | "Wysł. do podp." column; 2014-02-21 → 2026-08-07 |
| `acceptanceForm` | `acceptance_form` | 1 real row | Spec 17 |

`date_send` was changed 2,372 times according to the audit log, and `giveopinions`
8,192 times — both are live, user-edited fields, not import artefacts.

## Legacy quirks

### Quirk: `giveopinions` is a user id, and the boolean import broke the flag

- **Legacy:** `contract.giveopinions int(11)` with its own index `KEY giveopinion`.
  The audit log settles it — the recorded values are raw user ids:

  | old | new | count |
  |---|---|---|
  | 0 | 50463 | 2,943 |
  | 0 | 50530 | 2,275 |
  | 0 | 50464 | 1,327 |
  | 50530 | 0 | 219 |
  | 50530 | 50463 | 122 |

  The field names **who opened the opinion round**, and `0` means nobody.
- **Why it is wrong now:** `scripts/legacy/import.ts:642` maps it to
  `opinionsRequested: value !== 0`. The consequence is visible in the data:
  **13,790 records say `opinionsRequested = true` and only 3,770 of them have a
  single opinion row.** The flag the project detail page reads at
  `projekty/[id]/page.tsx:206` ("Zlecono opiniowanie") and branches on at `:392`
  ("Obieg opinii otwarty — brak wpisów") is wrong on roughly 10,000 records.
- **We do:** spec 01's `opinionsRequestedById Int?` relation. This spec then reads it
  as "koordynator obiegu" and stops using it as a boolean. Once the re-import lands,
  the empty-state branch at `:390-395` must be re-derived from
  `opinions.length === 0`, not from the flag.
- **Sign-off:** not needed — it is a restoration, not a behaviour change.
- **Blocks:** yes. Do spec 01 first.

### Quirk: `signature` is 0 on all 16,531 rows and `sign_date` means "answered"

- **Legacy:** `signature tinyint(1) NOT NULL` — never once set, across 16,531 rows
  and six years. `sign_date` is populated on 12,520.
- **Why it matters:** the column names promise a signing feature. There isn't one.
  What `sign_date` actually records is **when the person responded**, and the current
  UI reflects the wrong reading: `projekty/[id]/page.tsx:404-406` renders
  `Badge tone={o.signed ? "success" : "warning"}` with the label
  `Podpisano {date}` — so *every* opinion, including the 12,520 answered ones, shows
  as "Oczekuje", because `signed` is false everywhere.
- **We do:** spec 01 renames `signedAt → respondedAt`. This spec drops `signed`
  from the UI entirely and derives state from `respondedAt`:
  `respondedAt == null` → "Oczekuje", otherwise "Zaopiniowano {date}". Build no
  signing UI here — electronic signature is spec 27 and unrelated.
- **Sign-off:** not needed.

### Quirk: the `opiniontype_id` column comment describes a scheme that no longer exists

- **Legacy:** the column comment says `1 - opinia działu ryzyka`,
  `2 - opinia działu administracyjno-prawnego / prowadzącego prawnika`. The
  `opiniontypes` table says 1 = "Właściciel umowy" and 2 = "Przełożony". Risk is
  type 4 and legal is type 5.
- **Why it matters:** the comment is the only in-schema documentation of the field
  and it is wrong. Anyone reading the dump to understand the system — as this
  document's author did — is misled on the first pass.
- **We do:** do not carry the comment over. The Prisma model documents the current
  nine types instead.
- **Sign-off:** not needed.

### Quirk: `opiniontypes.group_id` does not determine who is asked

- **Legacy:** every type but INNE names a group. One would expect the group to be the
  pool of eligible responders.
- **The data says otherwise.** Counting each opinion row by whether its assigned user
  is a member of the type's group:

  | Type | Responder in the group | Not in the group |
  |---|---|---|
  | 1 Właściciel umowy | 3,908 | 292 |
  | 2 Przełożony | 2,275 | 209 |
  | 3 Dyrektor Klastra | **70** | **2,545** |
  | 4 CreditRisk | 1,685 | 113 |
  | 5 DPA | 3,582 | 379 |
  | 6 INNE | 0 | 1,266 |
  | 7 Dyr. Sieci Sprzedaży | 21 | 21 |
  | 8 Dyr. Zespołu Projektów | 164 | 0 |
  | 9 CEO Dystrybucja | 1 | 0 |

  Type 3 is the extreme: 2,545 of 2,615 requests went to someone outside the
  two-member "Dyrektor Klastra" group.
- **Why it matters:** if we enforce group membership on the picker, roughly 5,000
  historical assignments become unrepresentable and the most-used type breaks.
- **We do:** use the group as a **default and a sort key** in the person picker, not
  as a constraint. Members of the type's group are offered first under a
  "Sugerowani" heading; everyone else is reachable below it. Never reject a
  non-member.
- **Sign-off:** not needed.

### Quirk: there is no request date

- **Legacy:** the table stores `sign_date` (the answer) and nothing for when the
  request was made. `id` ordering is the only proxy.
- **Why it matters:** "zaległe opinie" is an ageing report and we cannot age anything
  without a start date. For the 16,531 imported rows this is unrecoverable.
- **We do:** add `requestedAt DateTime @default(now())` for rows we create, and
  leave it null for imported ones. The report shows "od rejestracji rekordu" for
  legacy rows and true ageing for new ones, with the difference visible in the UI so
  nobody reads a fabricated number.
- **Sign-off:** not needed.

### Quirk: `sendinfo` is set on 99.9% of rows, `disableMailing` on 14%

- **Legacy:** `sendinfo = 1` on 16,518 of 16,531 (13 rows are 0);
  `disableMailing = 1` on 2,259. The cross-tab:

  | `sendinfo` | `disableMailing` | Rows |
  |---|---|---|
  | 1 | 0 | 14,259 |
  | 1 | 1 | 2,259 |
  | 0 | 0 | 13 |

  So the effective rule is `sendinfo AND NOT disableMailing` → notify, which is true
  for 14,259 rows and false for 2,272.
- **Why it matters:** `sendinfo` carries no information — it is on by default and
  practically never turned off. `disableMailing` is the real control, an opt-out used
  on one row in seven.
- **We do:** keep both columns so the legacy value survives, but expose only one
  control in the UI — a "nie powiadamiaj" checkbox writing `mailingDisabled`. The
  notification path (spec 15) evaluates
  `sendInfo && !mailingDisabled`. **No mail is sent either way** — there is no SMTP
  anywhere in the codebase (spec 29); this gates the in-app notification only.
- **Sign-off:** not needed.

### Quirk: 2,891 open requests sit on projects that are already finished

- **Data:** pending requests grouped by the status of the record they hang on:

  | Status | Records | Pending requests |
  |---|---|---|
  | Projekt - zakończony | 3,258 | **2,891** |
  | Projekt - zakończono obieg FAU | 379 | 417 |
  | Projekt - anulowany | 87 | 164 |
  | Projekt - rozpoczęto obieg FAU | 53 | 84 |
  | Projekt - wysłane do podpisu | 96 | 56 |
  | Zakończona | 26 | 46 |
  | Obowiązująca | 9 | 16 |
  | (brak danych) | 3 | 10 |
  | Projekt - zrealizowany brak umowy | 1 | 3 |

- **Why it matters:** a naive "zaległe opinie" report lists 3,702 items of which
  **78% are on records nobody will ever return to**. That report is useless on day
  one, and it is very likely why legacy's own `/raport/opinions` went unmentioned by
  every user we have heard from.
- **We do:** the report defaults to open requests on records in an **open** status —
  4, 7, 12, 13 and the contract statuses 1 and 2 — which is 645 items, a real
  worklist. A "pokaż też zamknięte rekordy" toggle reveals the rest. Closing a record
  does **not** silently deactivate its requests; the data stays as it is.
- **Sign-off:** not needed — it is a default, and the full list stays reachable.

### Quirk: `active` is `int(11)` and marks withdrawal, not supersession

- **Legacy:** `active int(11) NOT NULL DEFAULT 1`. 348 rows are 0, spread across
  every year (2020: 35, 2021: 30, 2022: 55, 2023: 33, 2024: 113, 2025: 59, 2026: 23),
  and 39 of them carry an answer.
- **Why it matters:** the obvious reading — "a new request supersedes the old one, so
  the old goes inactive" — is wrong, because 338 duplicated pairs have several rows
  active at once. Inactive means the request was **withdrawn**: the round was
  restarted, or the wrong person was picked.
- **We do:** implement it as a withdraw action, not an automatic supersede. Withdrawn
  requests are hidden behind a "pokaż wycofane (N)" expander, never deleted. Nothing
  auto-deactivates anything.
- **Sign-off:** not needed.

### Quirk: `desc` is `NOT NULL` so a blank answer is an empty string

- **Legacy:** 4,842 rows have `desc = ''`, and 3,702 of the pending ones must, since
  they were never answered. That leaves roughly 1,100 **answered** requests with no
  text — an approval with no comment.
- **We do:** treat an empty description on an answered request as a bare approval and
  render "(bez uwag)". Do not require text to answer; legacy did not.
- **Sign-off:** not needed.

## UI

### Where the round appears

| Surface | What |
|---|---|
| `/projekty/[id]` | The "Obieg FAU" section — the round, inline, with actions |
| `/umowy/[id]`, `/ryzyko/[id]` | The same section, read-only, only when rows exist (40 records) |
| `/projekty` register | "Opiniujący" column (exists, `projekty/page.tsx:148-170`) |
| `/opinie` | "Zaległe opinie" — the cross-record worklist |
| Home page | "Opinie oczekujące na Ciebie: N" tile |

### Section: Obieg FAU

Replaces `app/(app)/projekty/[id]/page.tsx:375-414`, inside the shared `Section`
from spec 05. Title: **"Obieg FAU (Formularz Akceptacji Umowy)"** — keep the current
wording, it expands the acronym for anyone who does not know it.

Header line, left to right:

- **"Koordynator obiegu"** — `opinionsRequestedBy`, the restored user from spec 01,
  or "—".
- Progress: **"Zaopiniowano 3 z 5"**, counting active requests only.
- **"Poproś o opinię"** button (primary) when the actor can edit the record.

Then the request list, grouped by type in `opinionTypes` id order, and within a type
ordered by `respondedAt NULLS LAST, id`. Each row:

| Element | Content |
|---|---|
| Type | `opinionType.name`, or "INNE" |
| Person | `userLabel(user)` |
| State | `Badge` — `warning` "Oczekuje" or `success` "Zaopiniowano {date}" |
| Text | `description`, `whitespace-pre-line`; "(bez uwag)" when empty and answered |
| Actions | "Odpowiedz" for the assignee; "Wycofaj" for the coordinator or an admin |

Below: **"pokaż wycofane (N)"** when inactive rows exist. Empty state, when the
record genuinely has no rows: **"Nie rozpoczęto obiegu opinii."** with the
"Poproś o opinię" button beneath it.

Note the current empty-state text at `:392-394` branches on `opinionsRequested` and
must be deleted along with the flag's boolean reading.

### Screen: asking for an opinion

An inline panel, not a modal — several requests are usually added in one sitting.

| Field | Control | Validation |
|---|---|---|
| "Rodzaj opinii" | select over the nine types | required |
| "Osoba" | person picker; group members first under "Sugerowani", then everyone | required; warn but allow when a duplicate active request already exists for this person and type |
| "Nie powiadamiaj" | checkbox → `mailingDisabled` | — |

Submitting writes one `Opinion` per selected person — the picker is multi-select,
since the modal round asks four people at once — and fans out one notification per
person via spec 15.

### Screen: answering

Inline on the row. A textarea (`maxLength` 4000; the longest legacy answer is 3,987)
and two buttons: **"Zaopiniuj"** and **"Zaopiniuj bez uwag"**. Both set
`respondedAt = now()`; the second leaves `description` empty. Only the assignee, or
an admin, may answer, and only while `active`.

Answering is **not** editing the contract, so it must not require
`canEditContract` — 343 people are in "Właściciele umów" and most of them will never
hold an edit grant.

### Screen: /opinie — "Zaległe opinie"

The register-page recipe from spec 05. Default scope: `active`, `respondedAt IS NULL`,
record not deleted, record status in the open set — 645 rows today.

Filters: "Rodzaj opinii", "Osoba" (defaults to the current user), "Buissnesline",
"Status rekordu", and the "pokaż też zamknięte rekordy" checkbox.

Columns: Identyfikator · Kontrahent · Rodzaj opinii · Osoba · Status rekordu ·
Oczekuje od. The last shows true ageing for rows we created and
"od rejestracji: {date}" for imported ones, per the no-request-date quirk.

Row click opens the record. Admins see everyone's; everyone else sees their own plus
anything on a record they can edit.

### The "Opiniujący" column

`app/(app)/projekty/page.tsx:148-170` already builds it. Two changes: respect
`active`, and mark unanswered people — legacy shows a flat list, but the point of
the column on a worklist is to see who is holding things up. Render answered names
plain and pending names in `text-muted-foreground`.

## Implementation

### Files

| Path | Action | Note |
|---|---|---|
| `prisma/schema.prisma` | modify | `Opinion.requestedAt`, `respondedAt` rename (spec 01) |
| `features/kontrakty/opinion-round.tsx` | create | The section: list, ask panel, answer form |
| `features/kontrakty/opinion-actions.ts` | create | `requestOpinion`, `answerOpinion`, `withdrawOpinion` |
| `features/kontrakty/contract-preview.tsx` | modify | Mount the section for PROJECT, read-only elsewhere |
| `app/(app)/projekty/[id]/page.tsx` | delete | Spec 05 removes the fork; the section moves with it |
| `app/(app)/opinie/page.tsx` | create | The worklist |
| `app/(app)/projekty/page.tsx` | modify | "Opiniujący": filter `active`, mark pending |
| `lib/opinions.ts` | create | `OPEN_RECORD_STATUS_IDS`, `pendingWhere()`, round progress |
| `lib/nav.ts` | modify | Add "Opinie" |

### Server actions

| Action | Authorization | Validation | Writes |
|---|---|---|---|
| `requestOpinion` | `requireActor` + `canEditContract` | record exists, not deleted, module PROJECT or has rows; type id in the nine; 1–20 user ids, each an active user | one `Opinion` per user, then `notifyAboutOpinionRequest` per user, in one `$transaction` |
| `answerOpinion` | `requireActor` + (assignee or admin) | request `active` and unanswered; description ≤ 4000 after trim | `respondedAt = now()`, `description`; notify the coordinator |
| `withdrawOpinion` | `requireActor` + (coordinator, `canEditContract`, or admin) | request `active` | `active = false` |

All three follow `features/kontrakty/actions.ts`: `requireActor()` first,
`$transaction` where more than one table is touched, `revalidatePath`, and the
`{errors, values}` state object `useFormState` expects.

### Reuse

`Section`/`Field`/`Fact` (spec 05), `Badge`, `buttonClass`, `FilterBar`,
`Pagination`, `ClickableRow`, `userLabel`, `formatDate`/`formatDateTime`,
`ASSIGNEE_SELECT` and `loadOwnerOptions` from `lib/contract-access.ts` for the person
picker, `canEditContract` from `lib/authz.ts`, and `contractScopeWhere` from spec 03
on `/opinie`.

### Notifications

Spec 15 owns the fan-out. This spec needs two new reasons:

```ts
notifyAboutOpinionRequest(tx, { opinionId, contractId, requestedById, assigneeId })
notifyAboutOpinionAnswer(tx, { opinionId, contractId, responderId, coordinatorId })
```

Both respect `sendInfo && !mailingDisabled`. Neither may reuse the legacy
all-admins trigger (spec 15's Q5) — a request is directed at one person by
definition.

### Order of work

1. Spec 01's re-import, or `opinionsRequested` stays wrong on 10,000 records.
2. Read-only correctness first: fix the badge so answered requests stop showing as
   "Oczekuje". One line, and it repairs the page that exists today.
3. Then `answerOpinion` — 3,702 people are waiting on it and it needs no new schema.
4. Then `requestOpinion` and `/opinie`.

## Verification

```sql
-- 1. Baseline. Unchanged by a read-only deployment.
select count(*) total,
       count(*) filter (where active) act,
       count(*) filter (where not active) inact,
       count(*) filter (where signed) signed,
       count("signedAt") answered,
       count(*) filter (where "noMdr") nomdr,
       count(*) filter (where "formVerified") form_ver,
       count(*) filter (where "sendVerified") send_ver,
       count(*) filter (where "sendInfo") sendinfo,
       count(*) filter (where "mailingDisabled") mail_off,
       count(*) filter (where description = '') empty_desc
from "Opinion";
-- expected: 16531|16183|348|0|12520|3715|44|52|16518|2259|4842

-- 2. The worklist the report must show by default.
select count(*) from "Opinion" o
join "Contract" c on c.id = o."contractId"
where o.active and o."signedAt" is null and not c."isDeleted"
  and c."statusId" in (1,2,4,7,12,13);
-- expected: 645   (3702 total pending, 78% of them on closed records)

-- 3. One row per person, not per type — duplicates with several active rows.
select count(*) from (
  select "contractId","opinionTypeId" from "Opinion"
  group by 1,2 having count(*) filter (where active) > 1) q;
-- expected: 338

-- 4. Group membership is not a constraint. Type 3 is the proof.
select count(*) filter (where ug."userId" is null) not_in_group
from "Opinion" o
join "OpinionType" ot on ot.id = o."opinionTypeId"
left join "UserGroup" ug on ug."groupId" = ot."groupId" and ug."userId" = o."userId"
where ot.id = 3;
-- expected: 2545 of 2615

-- 5. The flag is broken until spec 01 lands.
select count(*) from "Contract" c
where not c."isDeleted" and c."opinionsRequested"
  and not exists (select 1 from "Opinion" o where o."contractId" = c.id);
-- expected before spec 01: 10020    after: the field is gone

-- 6. Opinions belong to Projekty.
select s.kind, count(distinct o."contractId"), count(*)
from "Opinion" o join "Contract" c on c.id = o."contractId"
join "ContractStatus" s on s.id = c."statusId" group by 1;
-- expected: PROJECT 3883|16396, CONTRACT 40|135
```

Manual checks:

- [ ] Open contract 12728 — six "Właściciel umowy" rows, four answered, two pending,
      each with its own person; none collapsed into one
- [ ] An answered request shows "Zaopiniowano {date}", not "Oczekuje" — the bug at
      `projekty/[id]/page.tsx:404` is gone
- [ ] Ask three people for a DPA opinion in one submit — three rows, three
      notifications, group members listed first in the picker but outsiders selectable
- [ ] Answer as the assignee without holding an edit grant on the record — allowed
- [ ] Answer as an unrelated user — refused
- [ ] "Zaopiniuj bez uwag" stores an empty description and renders "(bez uwag)"
- [ ] Withdraw a request — it leaves the list, appears under "pokaż wycofane", and
      the row still exists with `active = false`
- [ ] `/opinie` shows 645 by default; the toggle raises it to 3,702
- [ ] A record in "Projekt - zakończony" with pending requests is absent by default
      and present with the toggle on
- [ ] Set a record to "Projekt - zakończono obieg FAU" while requests are open —
      allowed, and nothing is auto-deactivated
- [ ] "Opiniujący" on `/projekty` greys pending names and omits withdrawn ones
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Q19 — who is allowed to start a round?** We propose `canEditContract`. Legacy's
   `giveopinions` names one coordinator per record, and the top three coordinators
   account for 6,545 of 8,192 recorded assignments — so in practice a handful of
   people ran every round. If it should stay that way, the button needs an explicit
   entitlement rather than the edit grant.
2. **Q20 — should closing a record close its open requests?** We propose no, matching
   legacy, which left 2,891 hanging. The alternative is a one-off cleanup that
   deactivates pending requests on finished projects, which would make the ageing
   report honest but rewrites six years of history. Needs a decision before `/opinie`
   ships.
3. **Q21 — is type 3 "Dyrektor Klastra" actually broken?** 2,264 of 2,615 requests
   unanswered, and 97% of them addressed to non-members of the group. Either the
   role changed hands and nobody updated the group, or the type is used as a
   catch-all. Worth asking before we surface an ageing report that will be 60%
   type 3.
4. **Q22 — does "wysłane do podpisu" belong to this workflow or to spec 27?**
   `date_send` is set on 3,750 records and status 7 exists, but nothing connects
   them to the opinion round in the schema. If Adobe Sign lands, status 7 becomes
   the integration's trigger and this needs re-reading.
5. **Q17/Q5 carry over** — the notification recipient rule (spec 15) decides whether
   a request notification reaches the right person or all sixteen admins.

---
id: 17
title: Formularz akceptacji umowy i ścieżka MDR
group: C-missing-subsystems
status: todo
depends-on: [16]
legacy-tables: [acceptance_form, opinions]
prisma-models: [AcceptanceForm, Opinion, Contract]
routes: ["/umowy/[id]/formularz-akceptacji", "/projekty/[id]/formularz-akceptacji"]
---

# 17 — Formularz akceptacji umowy i ścieżka MDR

## Why

Two things wear the same name in this system and they are not the same thing.

**"Formularz akceptacji umowy"** is a table, `acceptance_form`, with four checkboxes
and a date. In eleven years it was filled in **once** — contract 11081, on
2020-04-20, three days after the record was created and three weeks before the first
opinion in the system was ever answered. It has not been touched since.

**The MDR track** is three flags on the contract owner's opinion — `nomdr`,
`form_ver`, `send_ver` — and it is alive: `nomdr` is set on **3,715** rows and is
still being set in 2026.

The current screen (`features/kontrakty/acceptance-form-page.tsx`) implements the
first and knows nothing about the second. Its own header comment says so honestly:
*"ekranu FAU w legacy NIKT nie widział … Nie odtwarzamy więc układu legacy"*
(`acceptance-form-page.tsx:13-17`). That was the right call with the information
available then. This spec supplies the missing information: the feature the screen
implements is dead, and the feature it should implement is somewhere else.

MDR = *Mandatory Disclosure Rules* — the Polish tax-scheme reporting obligation
(Ordynacja podatkowa art. 86a et seq., implementing DAC6). A commercial contract can
trigger a reporting duty, and somebody has to declare whether it does. That is what
3,715 owners have been declaring.

## Legacy behaviour

### What the audit saw

`audyt §1.4` records the button **"Formularz akceptacji umowy"** on the contract
preview, pointing at `/contract/acceptform/{id}`. The screen behind it was never
opened — `audyt §1.5` marks it `[NIEZNANE]`, and `§11.4` lists *"jak generowany
PDF"* among the unknowns.

So: **we have never seen this screen.** Nothing below describes observed UI. It is
the table, the data, and what the data implies.

### The table

`cru.sql:18` — the first table in the dump, alphabetically:

```sql
CREATE TABLE IF NOT EXISTS `acceptance_form` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `contract_id` int(11) NOT NULL,
  `mdr_proc` tinyint(1) DEFAULT NULL,
  `initial_verification` tinyint(1) DEFAULT NULL,
  `sended_form` tinyint(1) DEFAULT NULL,
  `owner_acceptance` tinyint(1) DEFAULT NULL,
  `owner_accept_date` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `contract_id` (`contract_id`),
  CONSTRAINT `accept_form_contract` FOREIGN KEY (`contract_id`) REFERENCES `contract` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8 COLLATE=utf8_polish_ci;
```

And the whole of its contents, `cru.sql:33-34`:

```sql
-- Zrzucanie danych dla tabeli cru.acceptance_form: ~1 rows (około)
INSERT INTO `acceptance_form` (`id`, `contract_id`, `mdr_proc`, `initial_verification`,
                               `sended_form`, `owner_acceptance`, `owner_accept_date`) VALUES
	(2, 11081, 1, 1, 1, 1, '2020-04-20 12:53:00');
```

`AUTO_INCREMENT=3` with one surviving row at id 2 — so exactly two rows were ever
inserted and the first was deleted. This feature was tried twice in April 2020 and
abandoned.

Note the column names against our Prisma model:

| Legacy | Prisma | Meaning |
|---|---|---|
| `mdr_proc` | `mdrProcedure` | MDR procedure applies |
| `initial_verification` | `initialVerification` | Initial verification done |
| `sended_form` (sic) | `formSent` | Form sent |
| `owner_acceptance` | `ownerAccepted` | Owner accepted |
| `owner_accept_date` | `ownerAcceptedAt` | When |

All four are `tinyint(1) DEFAULT NULL` — so tri-state in principle, and the one real
row sets all four to 1, which tells us nothing about whether the sequence was ordered.

### The record it was used on

| Field | Value |
|---|---|
| Contract | 11081 |
| Identifier | `2020/0152` — a bare `YYYY/NNNN`, one of spec 02's 18 legacy shapes |
| Status | **Zakończona** (the CONTRACT module, not a project) |
| Registered | 2020-04-17 |
| Accepted | 2020-04-20 12:53 |
| Opinions | **0** |
| Notes | 3 |
| Attachments | 4 |
| History rows | 10 |

Two facts matter. The only acceptance form in the system sits on a **contract**, not
a project — so this is not inherently a Projekty feature the way the opinion round
is. And it carries **no opinions at all**, so the form and the opinion round were
never used together, not even once.

### Where MDR actually lives

The three MDR flags are columns on `opinions`, and they are not spread across the
opinion types. They are on exactly one:

| Opinion type | rows | `nomdr` | `form_ver` | `send_ver` |
|---|---|---|---|---|
| **1 Właściciel umowy** | 4,200 | **3,715** | **44** | **52** |
| 2 Przełożony | 2,484 | 0 | 0 | 0 |
| 3 Dyrektor Klastra | 2,615 | 0 | 0 | 0 |
| 4 CreditRisk | 1,798 | 0 | 0 | 0 |
| 5 DPA | 3,961 | 0 | 0 | 0 |
| 6 INNE | 1,266 | 0 | 0 | 0 |
| 7 Dyr. Sieci Sprzedaży | 42 | 0 | 0 | 0 |
| 8 Dyr. Zespołu Projektów | 164 | 0 | 0 | 0 |
| 9 CEO Dystrybucja | 1 | 0 | 0 | 0 |

**Every MDR flag in the database is on a "Właściciel umowy" opinion.** The MDR
declaration is part of the contract owner's answer, not a separate document.

Narrowing to type 1:

| Property | Value |
|---|---|
| Type-1 rows | 4,200 |
| Answered | 3,813 |
| `nomdr` set | 3,715 |
| `nomdr` set **and answered** | **3,715 — all of them** |
| `form_ver` | 44 |
| `send_ver` | 52 |
| Both `form_ver` and `send_ver` | 12 |
| Distinct contracts with either | 79 |

`nomdr` is never set on an unanswered request. It is set *at the moment the owner
responds*, as part of the response. And 3,715 of 3,813 answered owner opinions —
**97.4%** — declare that MDR does not apply.

`nomdr` by year of answer, against all answered opinions that year:

| Year | `nomdr` | All answered |
|---|---|---|
| 2020 | 109 | 348 |
| 2021 | 781 | 2,594 |
| 2022 | 771 | 2,600 |
| 2023 | 667 | 2,266 |
| 2024 | 696 | 2,193 |
| 2025 | 412 | 1,528 |
| 2026 | 279 | 991 |

Steady, every year, still running. This is the live feature.

### The two mechanisms never meet

Of the 79 contracts carrying `form_ver` or `send_ver`, **not one has an
`acceptance_form` row**. And contract 11081, the one that has a form, has no
opinions. The two tracks are disjoint in the data across six years.

`[INFERRED]` reading of the whole picture: `acceptance_form` was the original design
for the MDR checklist — a separate document with four ordered steps. It was tried in
April 2020, twice, abandoned immediately, and the same four concepts were folded into
the owner's opinion as flags a month later when the opinion round went live. The
shape lines up: `mdr_proc` ↔ the *absence* of `nomdr`, `initial_verification` ↔
`form_ver`, `sended_form` ↔ `send_ver`, `owner_acceptance` ↔ the opinion's
`sign_date` itself.

That is an inference, not an observation. But it is the only reading under which
both sets of columns exist and only one of them is used.

## Legacy quirks

### Quirk: the screen we built implements the dead feature

- **Current:** `features/kontrakty/acceptance-form-page.tsx` renders the four
  `acceptance_form` checkboxes (`:20-25`), saves them through `saveAcceptanceForm`
  (`:154`), and offers a print view (`:74-126`). It is reachable from every record in
  all three modules via `features/kontrakty/record-action-page.tsx`.
- **Why it matters:** it is a working editor for a table with one row in it, and it
  does not surface the 3,715 MDR declarations that people actually made. A user
  looking for "did we check MDR on this contract?" opens this screen, sees four
  unchecked boxes, and concludes nobody checked — when the answer is on the owner's
  opinion.
- **We do:** keep the screen and the table — deleting a legal record is not ours to
  do, and one real row is still a real row — but re-point it. The screen becomes a
  **read-only MDR summary** sourced from the owner's opinion, with the four legacy
  checkboxes shown only when an `acceptance_form` row exists, under the heading
  "Formularz archiwalny (2020)".
- **Sign-off:** **yes.** Turning an editable screen read-only is visible, and if the
  legal department wants the old checklist revived as the forward mechanism, that is
  a different build. See Q23.

### Quirk: our own test row is in the table

- **Data:** `AcceptanceForm` holds two rows — id 2 (contract 11081, legacy,
  2020-04-20) and **id 3 (contract 21234, created 2026-09-18 during our testing)**.
- **Why it matters:** every count in this document and in spec 01's reconciliation
  must say which it means. Records 21234 and 21235 are test data and are to be left
  alone.
- **We do:** the verification queries below filter to `id = 2` or to
  `contractId < 21234` where the legacy figure is what matters. The cutover
  reconciliation (spec 34) must exclude both test records explicitly, not by date.
- **Sign-off:** not needed.

### Quirk: `nomdr` is a negative, and the UI must not show it as one

- **Legacy:** the flag is named for the *absence* of an obligation. Set = "MDR does
  not apply". Unset means either "MDR applies" or "nobody looked" — the column
  cannot tell them apart, and 98 answered owner opinions plus 387 unanswered ones sit
  in that ambiguity.
- **Why it matters:** rendering a raw "nomdr: NIE" is actively misleading in a legal
  register; it reads as "MDR was checked and applies".
- **We do:** three visible states on the record —
  **"MDR: nie dotyczy"** (`noMdr` set, green),
  **"MDR: do weryfikacji"** (owner answered, `noMdr` unset, amber),
  **"MDR: brak deklaracji"** (no answered owner opinion, neutral).
  Never print the column name.
- **Sign-off:** not needed.

### Quirk: `sended_form` is misspelled in the schema

- **Legacy:** `sended_form tinyint(1)`.
- **We do:** the Prisma model already reads `formSent`. Unlike `Buissnesline` and
  `tylko OBSSC`, this spelling never reached a screen — it is a column name, not a
  label — so there is nothing for a user to recognise and nothing to preserve.
  Keep `formSent` and note the legacy name in a doc comment.
- **Sign-off:** not needed.

### Quirk: `tinyint(1) DEFAULT NULL` is tri-state and we imported it as two

- **Legacy:** all four flags are nullable. Null = never touched, 0 = explicitly no,
  1 = yes. The single real row has all four at 1, so we have no example of a 0.
- **Current:** the Prisma model declares `Boolean @default(false)`, collapsing null
  and 0.
- **Why it matters in practice:** almost not at all — there is one row and it is all
  ones. It matters if Q23 revives the checklist, because "not yet verified" and
  "verified as not applicable" are different answers on a compliance form.
- **We do:** leave the model as-is for now and flag it in Q23. If the checklist is
  revived, the four columns become `Boolean?`.
- **Sign-off:** not needed today.

## UI

### Where MDR appears

| Surface | What |
|---|---|
| Record detail, "Obieg FAU" section | The MDR badge, next to the owner's opinion |
| `/…/[id]/formularz-akceptacji` | The summary screen, plus the print view |
| Opinion answer form (spec 16) | The MDR question, for type 1 only |
| `/opinie` | Optional "MDR" column, off by default |

### The MDR question on the owner's answer

This is the only **write** path in this spec, and it belongs to spec 16's
`answerOpinion`. When and only when the opinion's type is 1 "Właściciel umowy", the
answer form gains one required radio group above the textarea:

> **Czy umowa podlega raportowaniu MDR?**
> ( ) Nie podlega  ( ) Podlega — wymaga weryfikacji

"Nie podlega" writes `noMdr = true`. "Podlega" leaves it false and raises the record
in the MDR worklist. Required, because the current data's ambiguity between "no" and
"nobody looked" is a defect worth ending. Legacy let it default; we will not.

`form_ver` and `send_ver` are set only on the "Podlega" branch, as two follow-up
checkboxes shown after that choice:

- **"Weryfikacja wstępna wykonana"** → `formVerified`
- **"Formularz wysłany"** → `sendVerified`

44 and 52 rows respectively over six years, so this is a rare path. It does not need
its own screen.

### Screen: /…/[id]/formularz-akceptacji

Rewritten from `acceptance-form-page.tsx`. Keeps the route, the back link, the
contract facts block (`:58-72` — that part is good and reused as-is) and the print
view. Replaces the editable checkbox form with three sections:

**1. "Deklaracja MDR"** — from the owner's opinion:

| Row | Source |
|---|---|
| Stan | the three-state badge above |
| Zadeklarował | `opinion.user`, via `userLabel` |
| Data deklaracji | `opinion.respondedAt`, via `formatDateTime` |
| Weryfikacja wstępna | `formVerified` — only when MDR applies |
| Formularz wysłany | `sendVerified` — only when MDR applies |
| Uwagi właściciela | `opinion.description`, or "(bez uwag)" |

When there is no answered owner opinion: **"Brak deklaracji MDR dla tego rekordu."**
and, if the actor can edit, a link to the opinion round.

**2. "Formularz archiwalny (2020)"** — rendered **only** when an `AcceptanceForm` row
exists. The four legacy checkboxes as read-only TAK/NIE, plus `ownerAcceptedAt`, and
one line of explanation: *"Formularz z pierwotnej procedury akceptacji, używanej
wyłącznie w kwietniu 2020. Zastąpiony deklaracją MDR w opinii właściciela umowy."*
On contract 11081 that section is the whole legacy record; everywhere else it is
absent.

**3. Print view** — unchanged in structure (`:74-126`), fed from section 1 instead of
the checkbox table. The two signature lines stay: "Data i podpis właściciela umowy"
and "Data i podpis akceptującego".

The disclaimer at `:203-207` stays, updated: the legacy layout is still unseen.

### PDF

Browser print, as today (`PrintButton`, Ctrl+P → "Zapisz jako PDF"). A generated PDF
needs a dependency none of which is installed — that is spec 28. Do not add one here
for a screen whose legacy layout we have never seen; we would be rendering an
invention to paper.

## Implementation

### Files

| Path | Action | Note |
|---|---|---|
| `features/kontrakty/acceptance-form-page.tsx` | modify | Read-only summary; drop the checkbox form, keep facts and print |
| `features/kontrakty/actions.ts` | modify | Remove `saveAcceptanceForm`, or reduce it to admin-only |
| `features/kontrakty/opinion-actions.ts` | modify | `answerOpinion` accepts the MDR answer for type 1 (spec 16) |
| `lib/mdr.ts` | create | `mdrState(contract)` → `"not-applicable" \| "to-verify" \| "none"`, plus the label and tone |
| `features/kontrakty/opinion-round.tsx` | modify | Show the MDR badge on the owner's row |
| `prisma/schema.prisma` | — | No change. `AcceptanceForm` stays exactly as it is |

### `mdrState`

One function, because four surfaces need the same answer and must not each re-derive
it:

```ts
export type MdrState = "not-applicable" | "to-verify" | "none";

/** Resolved from the contract owner's answered opinion (type 1), not from
 *  `acceptance_form` — see docs/features/17. */
export function mdrState(ownerOpinions: Pick<Opinion, "noMdr" | "respondedAt">[]): MdrState;
```

Takes the list because a record can have several owner opinions (six, on contract
12728). Rule: if any answered owner opinion has `noMdr`, the state is
`not-applicable`; if any owner opinion is answered without it, `to-verify`;
otherwise `none`.

### Authorization

The summary screen is readable by anyone who can read the record (spec 03). The MDR
answer is written only through `answerOpinion`, so it inherits that action's rule:
the assignee or an admin. `canEditContract` is **not** required — the same reasoning
as spec 16.

`saveAcceptanceForm` currently writes on `canEditContract`
(`acceptance-form-page.tsx:53`, `:188`). Once the screen is read-only it has no
caller; remove it rather than leave a live write path to a dead table.

## Verification

```sql
-- 1. The legacy table, excluding our test row on 21234.
select id, "contractId", "mdrProcedure", "initialVerification", "formSent",
       "ownerAccepted", "ownerAcceptedAt"
from "AcceptanceForm" where "contractId" <> 21234;
-- expected: exactly one row — 2 | 11081 | t | t | t | t | 2020-04-20 12:53:00

-- 2. MDR flags live only on opinion type 1.
select "opinionTypeId",
       count(*) filter (where "noMdr") nomdr,
       count(*) filter (where "formVerified") fv,
       count(*) filter (where "sendVerified") sv
from "Opinion" group by 1 having
  count(*) filter (where "noMdr") + count(*) filter (where "formVerified")
  + count(*) filter (where "sendVerified") > 0;
-- expected: one row — type 1, 3715 | 44 | 52

-- 3. `noMdr` is only ever set on an answered opinion.
select count(*) from "Opinion" where "noMdr" and "signedAt" is null;
-- expected: 0

-- 4. The three MDR states, across the register.
with owner as (
  select "contractId",
         bool_or("noMdr" and "signedAt" is not null) na,
         bool_or("signedAt" is not null)             answered
  from "Opinion" where "opinionTypeId" = 1 and active group by 1)
select case when na then 'nie dotyczy'
            when answered then 'do weryfikacji'
            else 'brak deklaracji' end state, count(*)
from owner group by 1 order by 2 desc;
-- expected: 'nie dotyczy' dominant (~3700), 'do weryfikacji' ~100,
--           'brak deklaracji' the rest of the owner-opinion contracts

-- 5. The two mechanisms are disjoint.
select count(*) from "Opinion" o
join "AcceptanceForm" a on a."contractId" = o."contractId"
where (o."formVerified" or o."sendVerified") and a."contractId" <> 21234;
-- expected: 0   (79 contracts carry the flags; none has a form)

-- 6. Contract 11081 has no opinions.
select count(*) from "Opinion" where "contractId" = 11081;
-- expected: 0
```

Manual checks:

- [ ] Open `/umowy/11081/formularz-akceptacji` — "Brak deklaracji MDR" in section 1,
      and section 2 "Formularz archiwalny (2020)" shows all four as TAK with
      2020-04-20 12:53
- [ ] Open any project with an answered owner opinion carrying `noMdr` — section 1
      shows "MDR: nie dotyczy" with the right person and date, and section 2 is absent
- [ ] Open a project whose owner answered without `noMdr` — "MDR: do weryfikacji"
- [ ] Open a project with no owner opinion — "Brak deklaracji MDR dla tego rekordu."
- [ ] Answer an owner opinion choosing "Nie podlega" — the badge flips to
      "nie dotyczy" on the record, the detail page and `/opinie`
- [ ] Answer choosing "Podlega" — the two verification checkboxes appear and write
      `formVerified` / `sendVerified`
- [ ] Answer a **non-owner** opinion (DPA) — no MDR question is shown and no MDR
      flag is written
- [ ] Nobody can edit the four archival checkboxes from the UI
- [ ] Print view renders the MDR declaration and both signature lines
- [ ] `grep -rn "saveAcceptanceForm" nextjs_space` returns no live caller
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Q23 — is `acceptance_form` genuinely dead, or was it meant to come back?**
   Two rows ever inserted, one surviving, April 2020, replaced within the month. Our
   proposal is to freeze it read-only and treat the owner's opinion as the live
   mechanism. If the legal department wants a real four-step checklist again — which
   a compliance process arguably needs — that is a new build, the four columns become
   `Boolean?`, and this spec is superseded. **Sign-off required before the screen
   goes read-only.**
2. **Q24 — should the MDR declaration be mandatory on the owner's answer?** We
   propose yes, because the current data cannot distinguish "MDR applies" from
   "nobody looked" across 485 owner opinions. Making it required changes the answer
   form for every contract owner — 343 people — so it needs a decision.
3. **Q25 — what happens after "Podlega"?** 44 records reached `form_ver` and 52
   reached `send_ver`, but nothing in the schema says where the form was sent or what
   came back. Does a reported scheme get an NSP number, a filing date, a document? If
   the answer is "it leaves the system", the two checkboxes are the whole feature.
4. **Q26 — is the print layout acceptable as-is?** It is our invention. If anyone in
   Bytom can produce a printed FAU from the legacy system, one photograph settles the
   field order and the signature block, and this becomes a faithful reproduction
   instead of a plausible one.

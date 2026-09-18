---
id: 10
title: Formularz rekordu (contract form)
group: B-registers
status: todo
depends-on: [01, 02]
legacy-tables: [contract, contract_users]
prisma-models: [Contract, ContractUser, Contractor, Currency, NoticePeriod, DeliveryMethod, Trade]
routes: ["/umowy/nowy", "/umowy/[id]/edytuj", "/projekty/nowy", "/ryzyko/nowy"]
---

# 10 — Formularz rekordu (contract form)

## Why

One form serves six entry points — new contract, new project, new risk record, edit,
"Dodaj aneks" and "Stwórz projekt aneksu" — because in legacy it is one form
differing only in what is pre-filled (`lib/contracts/form-schema.ts:5-7`). It is the
only way data enters the system, so every constraint it gets wrong becomes a record
nobody can save or a value silently lost.

It is built and it works. What this spec adds is the field-by-field contract against
the legacy data, and that comparison turns up three problems: **38 records cannot be
saved at all** because a validation cap is shorter than their stored content;
**4,119 contracts display an end date of 2099-12-31** where legacy means "na czas
nieokreślony"; and 558 records carry a currency literally called `???`.

## Legacy behaviour

### What the audit saw

**Nothing.** `audyt §1.1` is explicit: the add and edit endpoints are `[NIEZNANE]`,
and the pencil icon that jTable labels "Edit Record" actually opens the read-only
preview. The auditor's account never reached an editable form.

So the field list below comes from `audyt §1.4` — the **preview**, which shows what a
record holds — plus the `contract` table and the live data. Labels are the preview's;
controls and validation are ours.

### The "na czas nieokreślony" convention

Legacy has no null end date for an open-ended contract. It writes **`2099-12-31`**.

The string appears **7,442 times in `cru.sql`** and on **4,119 live records**,
distributed evenly across every year from 2012 to 2026 and across all three modules:

| Module | Records with `dateEnd = 2099-12-31` |
|---|---|
| CONTRACT | 2,218 |
| PROJECT | 1,897 |
| RISK | 4 |

That is a convention, not an accident. 530 records in 2012 and 55 in 2026 — it has
been used consistently for fourteen years.

Our import stored it verbatim, so those records currently display
**"Obowiązuje do: 31.12.2099"**.

## Data

### Every field, with its legacy column, cap and live extremes

Caps are the current values in `lib/contracts/form-schema.ts`.

| Field | Legacy column | Type | Cap | Longest / extreme in data | OK? |
|---|---|---|---|---|---|
| `identifier` | `identifier` | text | 190 | 0 over | ✅ |
| `documentTypeId` | `type_id` | select | — | 8 types, 3 inactive | ✅ |
| `statusId` | `status_id` | select | — | 13, split by module | ✅ |
| `companyId` | `company_id` | select | — | 9, 2 inactive | ✅ |
| `businesslineId` | `buissnesline_id` | select | — | 3 | ✅ |
| `primaryLocationId` | `location_id` | select | — | 35 | ✅ |
| `domainId` | `domain_id` | select | — | 37, split GENERAL/RISK | ✅ |
| `natureId` | `contract_nature_id` | select | — | 4 | ✅ |
| `tradeId` | `trade_id` | select | — | 3 (`brak`/`export`/`import`) | ✅ |
| `deliveryMethodId` | `delivery_id` | select | — | 6 | ✅ |
| `noticePeriodId` | `notice_period_id` | select | — | 14 | ✅ |
| `contractReference` | `contract_reference` | text | 190 | 0 over | ✅ |
| `description` | `description` | textarea | 4,000 | **2,283** | ✅ |
| `dateBegin` | `date_begin` | date | — | **1900-01-01** ×49, **2921-08-18** | ⚠️ |
| `dateEnd` | `date_end` | date | — | **2099-12-31** ×4,119 | ⚠️ |
| `sentOn` | `date_send` | date | — | 3,750 set | ✅ |
| `salary` | `salary` | decimal 14,2 | 999 999 999 999.99 | **5 000 000 000** | ✅ |
| `currencyId` | `currency_id` | select | — | 4, one of them **`???`** | ⚠️ |
| `specificSalaryTerms` | `specific_salary_terms` | text | 500 | 255 | ✅ |
| `paymentTerm` | `date_payment` | text | 500 | 220 | ✅ |
| `contractorId` | `contractor_id` | autocomplete | — | 3,580 options | ✅ |
| `debtorId` | `debtor_id` | autocomplete | — | 14,215 set | ✅ |
| `companiesConnected` | `companies_connected` | checkbox | — | 441 true | ✅ |
| `tempForm` | `temp_form` | tri-state | — | 8,968 T / 11,138 F / 31 null | ✅ |
| `obsc` | `OBSC` | checkbox | — | 499 true | ✅ |
| `obscDescription` | `descOBSC` | text | **500** | **1,926 — 38 records over** | ❌ |
| `insuranceGuarantee` | `insurance_guarantee` | checkbox | — | 204 true | ✅ |
| `bill` | `bill` | checkbox | — | 544 true — **"Weksel"** (spec 09) | ✅ |
| `remarks` | `remarks` | textarea | 4,000 | 506 | ✅ |
| `ownerIds` | `contract_users` | multi-select | 100 | 7+ typical max | ✅ |
| `editorIds` | `contract_users.onlyRead=0` | subset | 100 | 17,042 grants | ✅ |

### Dates

| Value | `dateBegin` | `dateEnd` |
|---|---|---|
| Null | 954 | 1,160 |
| `1900-01-01` | **49** | — |
| `2099-12-31` | — | **4,119** |
| `2050-11-02` … `2099-12-14` | — | 7 |
| `2108-10-30`, `2921-08-18` | 1 each | — |

All 49 `1900-01-01` records are "Zakończona" — a second sentinel, this one meaning
"start date unknown". `2921-08-18` is a typo for 2021.

### Currency

| id | Code | Records | Note |
|---|---|---|---|
| 1 | **`???`** | **558** | 546 contracts, 12 projects; only **4** have a non-zero amount |
| 2 | PLN | 18,090 | |
| 3 | EUR | 1,461 | |
| 4 | USD | 28 | |

`???` is the legacy "not stated" entry — the same `id = 0`-style placeholder pattern
spec 01 documents. Almost all 558 have `salary = 0`, so the pairing is coherent:
no amount, no currency.

### Amounts

7,144 live records have `salary = 0`, none is negative, and the maximum is
**5 000 000 000 EUR** — five billion — on a cluster of related records
(`AMDSP/DYS/2023/0035`, its annex `/A01`, and three of its projects). Consistent
across the family, so it is a framework cap or a placeholder, not a stray keystroke.

### Owners and edit rights

`contract_users` holds **39,665** grants: **17,042** with `onlyRead = 0` (editors)
and **22,623** read-only. The form models this as `ownerIds` plus an `editorIds`
subset, with a cross-field rule that an editor must also be an owner
(`form-schema.ts:148-156`).

### `edittable` — frozen records

`isEditable` is **false on 6,742** live records and true on 13,395. Legacy locks a
third of the register. Nothing in our code enforces it (spec 03).

## Legacy quirks

### Quirk: 38 records cannot be saved because of the `obscDescription` cap

- **Current:** `obscDescription: optionalText(MAX_SHORT_TEXT)` with
  `MAX_SHORT_TEXT = 500` (`form-schema.ts:14`, `:123`).
- **Data:** the longest stored `descOBSC` is **1,926 characters**, and **38 records
  exceed 500**.
- **Why it is wrong:** zod's `.max()` raises a validation error; it does not
  truncate. So opening one of those 38 records, changing the status, and pressing
  Zapisz fails with *"Maksymalnie 500 znaków."* on a field the user never touched,
  and there is no way to save the record without destroying data.
- **We do:** raise the cap to **4,000**, matching `description` and `remarks`.
  The legacy column is `text`, so there is no storage constraint; 500 was a guess.
  Audit the other two 500-caps at the same time — `specificSalaryTerms` (longest
  255) and `paymentTerm` (longest 220) are safe, but the same reasoning applies:
  derive caps from the data, not from a round number.
- **Sign-off:** not needed. It unblocks 38 records.
- **Priority:** this is the one defect in this spec that breaks saving today.

### Quirk: `2099-12-31` is legacy's "na czas nieokreślony"

- **Legacy:** 7,442 occurrences in the dump, 4,119 live records, every year
  2012–2026, all three modules.
- **Current:** the form has an `indefinite` checkbox that writes `dateEnd = null`
  (`form-schema.ts:105`, `:160`), and the preview prints "na czas nieokreślony" only
  when `dateEnd` is null. So the 4,119 imported records show **"31.12.2099"** and
  their `indefinite` box loads unticked.
- **Why it matters beyond cosmetics:** 1,638 of them are **"Obowiązująca"**. Spec 19
  counts 45 open-ended contracts in force; the real number is **1,683**. And a user
  who opens one of those records and saves it writes a literal 2099 date back,
  because the checkbox never engaged.
- **We do:** treat `2099-12-31` as a **synonym for indefinite**, not migrate it:

  ```ts
  /** Legacy writes 2099-12-31 for "na czas nieokreślony" — 4,119 live records.
   *  See docs/features/10. */
  export const INDEFINITE_END = "2099-12-31";
  export const isIndefinite = (d: Date | null) =>
    d === null || toISODate(d) === INDEFINITE_END;
  ```

  The preview renders "na czas nieokreślony" for both forms. The form loads the
  checkbox ticked and the date field empty. On save the checkbox writes **null**, so
  a record converts to the modern representation the first time somebody edits it,
  and nothing is rewritten in bulk.
  Spec 19's job and `endUrgency()` must both use `isIndefinite`, or 1,638 contracts
  eventually queue up to auto-close in the year 2100.
- **Sign-off:** **yes** — it changes what 4,119 records display, and the legal
  department may prefer to see the literal date. Recommend the change; it is what the
  data means. See Q48.

### Quirk: `1900-01-01` is "start date unknown"

- **Data:** 49 records, all "Zakończona".
- **We do:** the same treatment, one severity lower — render "(nieznana)" rather
  than 01.01.1900, and leave the stored value alone. Too few records to justify a
  checkbox on the form.
- **Sign-off:** not needed.

### Quirk: two impossible start dates

- **Data:** `2921-08-18` (a typo for 2021) and `2108-10-30`.
- **We do:** add a soft bound to the form — warn, do not block, outside
  1990–2050. Never auto-correct: a wrong date in a legal register is the record's
  problem to fix, not ours. Report both to the legal department.
- **Sign-off:** not needed.

### Quirk: the `???` currency

- **Data:** currency id 1, code `???`, 558 records, 4 with a non-zero amount.
- **Why it matters:** "0,00 ???" is meaningless output, and the four records with
  money and no currency are genuinely ambiguous.
- **We do:** render an amount with currency 1 as the number alone, with no code —
  `formatMoney` already takes the code as an argument, so it is a call-site change.
  On the form, offer the entry as **"(nie określono)"** rather than `???`, keeping
  the id. Flag the four money-bearing ones to the legal department.
- **Sign-off:** not needed.

### Quirk: `tempForm` is genuinely tri-state and the other flags are not

- **Data:** 8,968 true, 11,138 false, **31 null** — and those 31 are exactly the
  status-less projects from spec 06.
- **Current:** `triState` (`form-schema.ts:65-72`) already handles it correctly,
  including legacy's `-1`.
- **We do:** nothing. Recorded because `tempForm` is the only tri-state flag on the
  form and it looks like an inconsistency until you know why.
- **Sign-off:** not needed.

### Quirk: `isEditable` is false on 6,742 records and nothing enforces it

- Carried from spec 03. Legacy freezes a third of the register.
- **We do:** the form refuses to load in edit mode when `isEditable` is false, with
  the message **"Rekord zablokowany do edycji."**, and the server action rejects the
  write regardless of what the client sends. Creating is unaffected.
- **Sign-off:** not needed — it restores a legacy constraint we currently ignore.
- **Owner:** spec 03 implements the check; this spec specifies the form's behaviour.

### Quirk: the creator is not added as an owner

- **Current:** a newly created record has no `ContractUser` row unless the form
  supplies one. 39 live records already have no owner at all.
- **Why it matters:** after spec 03, a record with no owner is visible and editable
  only to admins — so a user creates a record and immediately loses access to it.
- **We do:** add the creator as an owner with `readOnly = false`. Legacy's form has
  no owner field visible in the preview, so this is an addition.
- **Sign-off:** **yes** — Q7, already open.

### Quirk: decimal input must accept three formats

- **Legacy:** accepts both comma and full stop; Excel paste adds thin spaces.
- **Current:** `optionalDecimal` (`form-schema.ts:52-59`) strips `\s` and U+00A0 and
  converts a comma. Correct and worth keeping — it is the kind of thing that gets
  "simplified" away.
- **We do:** nothing, and add a test (spec 33) so it survives.
- **Sign-off:** not needed.

## UI

### Field order and grouping

`FormSection` / `FormRow` from `components/ui/form.tsx`. Labels are `audyt §1.4`'s,
verbatim, including `Buissnesline`.

| Section | Fields |
|---|---|
| **Klasyfikacja** | Identyfikator *(read-only, generated)*, Typ dokumentu, Numer umowy, Status, Spółka, Buissnesline, Lokalizacja, Lokalizacje dodatkowe (spec 12), Rodzaj umowy, Charakter umowy |
| **Przedmiot** | Przedmiot umowy, Uwagi |
| **Terminy** | Data zawarcia, Data zakończenia + **"na czas nieokreślony"**, Okres wypowiedzenia, Data wysłania do podpisu |
| **Wynagrodzenie** | Wynagrodzenie, Waluta, Inne określenie wynagrodzenia, Termin płatności |
| **Strony** | Kontrahent, Dłużnik, Właściciel umowy *(multi)*, Prawo edycji *(subset)* |
| **Cechy** | Weksel, Podmiot powiązane, Formularz *(Tak/Nie/nie wskazano)*, OBSC + Opis OBSC, Gwarancja/ubezpieczenie, Forma doręczenia, Eksport/Import |
| **Załączniki** | spec 18, with the form-session token |

### Per module

| | Umowy | Projekty | Ryzyko |
|---|---|---|---|
| Status options | 3 CONTRACT | 7 PROJECT | 3 RISK |
| Rodzaj umowy | 32 GENERAL | 32 GENERAL | **5 RISK** |
| Dłużnik | optional | optional | **required** — set on all 406 |
| Przedmiot | shown | shown | **hidden** (spec 08) |
| Charakter / Eksport-Import | shown | shown | **hidden** — constant |
| Identifier grammar | `CO/BL/YYYY/NNNN` | `…/PNNNN` | **`YYYY/L/NNNN`** (spec 08) |

### Validation messages

Polish, beside the field, via `FieldError`. The existing set is good; three
additions:

- Date outside 1990–2050 → **"Nietypowa data — sprawdź, czy na pewno o nią chodzi."**
  (a warning, the save proceeds)
- Risk record with no Dłużnik → **"Dłużnik jest wymagany w Dziale ryzyka."**
- Frozen record → **"Rekord zablokowany do edycji."**, form read-only

### The identifier field

Read-only and generated (spec 02). On a new record it shows a preview of the number
that will be assigned, recomputed when company, businessline or — for a risk record
— domain changes, since all three feed the prefix. An annex gets its parent's number
plus the next `/A` suffix (spec 11).

## Implementation

### Files

| Path | Action | Note |
|---|---|---|
| `lib/contracts/form-schema.ts` | modify | `obscDescription` cap → 4,000; soft date bounds; risk requires a debtor |
| `lib/contracts/dates.ts` | create | `INDEFINITE_END`, `isIndefinite`, `UNKNOWN_BEGIN`, `toISODate` |
| `features/kontrakty/contract-form.tsx` | modify | Indefinite checkbox reads `isIndefinite`; module-aware sections |
| `features/kontrakty/actions.ts` | modify | Enforce `isEditable`; add the creator as owner (Q7) |
| `lib/format.ts` | modify | `formatMoney` omits a `???` code; `formatDate` handles the two sentinels |
| `lib/contracts/identifier.ts` | modify | Risk grammar (spec 08) |

### Where `isIndefinite` must be used

A single helper is only worth it if every reader uses it. The call sites:

| Site | Why |
|---|---|
| `contract-preview.tsx` | "na czas nieokreślony" |
| `contract-form.tsx` | the checkbox's initial state |
| `lib/contract-status.ts` → `endUrgency()` | otherwise 4,119 records report "za 26 800 dni" |
| Spec 19's auto-close job | otherwise they queue for the year 2100 |
| Spec 19's `/wygasajace` | the "Bez daty końca" group is 1,683, not 45 |
| Umowy/Projekty register columns | the "Data zakończenia" cell |

## Verification

```sql
-- 1. The save-blocking cap.
select count(*) from "Contract" where length("obscDescription") > 500;
-- expected: 38   → must be 0 records that fail validation after the fix

-- 2. The indefinite sentinel.
select coalesce(s.kind::text, '(brak)') kind, count(*)
from "Contract" c left join "ContractStatus" s on s.id = c."statusId"
where not c."isDeleted" and c."dateEnd" = date '2099-12-31'
group by 1 order by 2 desc;
-- expected: CONTRACT 2218 | PROJECT 1897 | RISK 4   (4119 total)

-- 3. …of which this many are still in force — spec 19's real open-ended count.
select count(*) filter (where "dateEnd" = date '2099-12-31') sentinel,
       count(*) filter (where "dateEnd" is null)             null_end
from "Contract" where not "isDeleted" and "statusId" = 2;
-- expected: 1638 | 45   → 1683 open-ended contracts in force, not 45

-- 4. The unknown-start sentinel.
select count(*) from "Contract" where not "isDeleted" and "dateBegin" = date '1900-01-01';
-- expected: 49, all "Zakończona"

-- 5. Impossible dates.
select id, identifier, "dateBegin" from "Contract"
where not "isDeleted" and ("dateBegin" > date '2050-01-01' or "dateBegin" < date '1899-01-01');
-- expected: 2 rows — 2108-10-30 and 2921-08-18

-- 6. The ??? currency.
select cu.id, cu.code, count(c.id) records,
       count(*) filter (where c.salary > 0) with_money
from "Currency" cu left join "Contract" c on c."currencyId" = cu.id and not c."isDeleted"
group by 1, 2 order by 1;
-- expected: 1 ??? 558 (4 with money) | 2 PLN 18090 | 3 EUR 1461 | 4 USD 28

-- 7. Tri-state `tempForm`.
select "tempForm", count(*) from "Contract" where not "isDeleted" group by 1;
-- expected: null 31 | false 11138 | true 8968

-- 8. Frozen records and owner grants.
select (select count(*) from "Contract" where not "isDeleted" and not "isEditable") frozen,
       (select count(*) from "ContractUser" where not "readOnly")                   editors,
       (select count(*) from "ContractUser" where "readOnly")                       readonly;
-- expected: 6742 | 17042 | 22623
```

Manual checks:

- [ ] Open one of the 38 long-`descOBSC` records, change the status, save — **it
      saves**, and the description is unchanged at full length
- [ ] Open a record with `dateEnd = 2099-12-31` — the preview reads **"na czas
      nieokreślony"**, and the form loads with the checkbox **ticked** and the date
      field empty
- [ ] Save that record without touching the dates — `dateEnd` becomes **null**
- [ ] `endUrgency()` shows no badge on such a record, not "za 26 800 dni"
- [ ] A record with `dateBegin = 1900-01-01` renders "(nieznana)"
- [ ] Entering 2921-08-18 produces a **warning** and still saves
- [ ] An amount in currency `???` renders as a bare number, no code
- [ ] Typing `1 234,56` and `1234.56` both store `1234.56`; a value pasted from
      Excel with a non-breaking space works too
- [ ] "Formularz" offers Tak / Nie / nie wskazano, and "nie wskazano" stores null
- [ ] Marking someone an editor who is not an owner is rejected
- [ ] Creating a record adds the creator as an owner with edit rights
- [ ] Opening a frozen record (`isEditable = false`) for edit shows
      "Rekord zablokowany do edycji." and posting the form anyway is rejected
      server-side
- [ ] A risk record refuses to save without a Dłużnik; the Rodzaj list shows the five
      RISK domains only
- [ ] A new risk record is numbered `YYYY/L/NNNN`
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Q48 — may `2099-12-31` be displayed as "na czas nieokreślony"?** 4,119 records,
   including 1,638 still in force. It is plainly what legacy means, and the change is
   visible on a fifth of the register. Recommend yes. **Sign-off needed.**
2. **Q49 — four records have money in currency `???`.** Which currency are they? The
   other 554 have no amount, so only these four are genuinely ambiguous.
3. **Q50 — is 5 000 000 000 EUR real?** It sits on `AMDSP/DYS/2023/0035`, its annex
   and three of its projects, so it was entered deliberately. A framework ceiling
   or a placeholder — either way it dominates any sum over the register.
4. **Q7 carries over** — auto-assigning the creator as owner.
5. **Q10 residue** — `temp_form` maps to the "Formularz" label (spec 09), but what
   the flag is *for*, on 8,968 records, is still unknown.

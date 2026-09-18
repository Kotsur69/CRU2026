---
id: 08
title: Rejestr Dział ryzyka
group: B-registers
status: todo
depends-on: [03, 05]
legacy-tables: [contract, contract_status, domain, contractor]
prisma-models: [Contract, ContractStatus, Domain, Contractor, ContractUser]
routes: ["/ryzyko"]
---

# 08 — Rejestr Dział ryzyka

## Why

406 records, 2% of the register — and **270 million złotych** of exposure, with a
single record reaching 15 million. By value per row it is the most consequential
module in the system.

It is also the one we know least about from observation. The auditor's account got
**`Access deny!`** at `/cru/index.php/risk` (`audyt §3.`), so there is no observed
screen, no observed filter list, no observed column set. Everything here is derived
from the schema and from 406 rows of live data, and it says so wherever that matters.

What the data shows is that risk records are **not contracts with a different
status**. They use a different identifier grammar, a different domain dictionary, a
second counterparty, and they leave twelve contract columns entirely empty. Treating
them as a variant of Umowy — which is what a shared `contract` table invites —
produces a screen full of blank cells.

## Legacy behaviour

### What the audit saw

Nothing. `audyt §3.–8.` records the module as gated:

| Module | URL | Result from Mati's account |
|---|---|---|
| Dział ryzyka | `/cru/index.php/risk` | ⛔ **Access deny!** |

The audit adds only that *"Istnienie raportów `/raport/ryzyka` i `/raport/supplychain`
sugeruje, że to pełnoprawne rejestry z własnymi danymi"* — a full register with its
own data, inferred from the existence of its report.

So there is no `[OBSERVED]` material in this spec at all. The filters and columns
below are **ours**, built from what the data supports, and the open questions at the
end are the ones a single screenshot from Bytom would settle.

### What the module is

`[INFERRED]` from the domains and the money. The five RISK domains are
**Ugoda** (settlement), **Cesja** (assignment of receivables), **Poręczenie**
(surety), **Zabezpieczenie** (collateral) and **Inne**. Every record names a
**debtor** as well as a counterparty, carries an amount, and runs from a start date
to an end date.

That is a register of **debt-recovery and security instruments** — what the company
is owed, by whom, and what secures it. The three statuses fit: active, closed, and
**in court**.

## Data

### Statuses

| id | Status | Records |
|---|---|---|
| 9 | Dział ryzyka - aktywny | **399** |
| 10 | Dział ryzyka - zakończony | 6 |
| 11 | **Dział ryzyka - w sądzie** | **1** |

98% of the register is active. Unlike Umowy (where 79% is finished) and Projekty
(78% finished), this is a **live working set** — almost every row is something
somebody is still dealing with. That single "w sądzie" record is the one in
litigation.

### The five RISK domains

`Domain.kind = 'RISK'`, all active:

| id | Name | Records |
|---|---|---|
| 33 | Ugoda | 208 |
| 34 | **Cesja** | **0** |
| 35 | Poręczenie | 195 |
| 36 | Zabezpieczenie | 1 |
| 37 | Inne | 2 |

The register is effectively two kinds of thing — settlements and sureties, half
each. Cesja exists in the dictionary and has never been used on a live record.

### The money

| | Value |
|---|---|
| Total | **270 323 086 PLN** |
| Mean | 665 820 |
| Maximum | **15 000 000** |
| Records with `salary = 0` | 2 |

Currency is set on all 406. This is the only register where the amount column is the
point of the screen rather than a detail, which is why it is right-aligned and
formatted in the existing table (`components/ryzyko/risk-table.tsx:56`).

### Two counterparties

Every risk record names both a **Kontrahent** (`contractorId`) and a **Dłużnik**
(`debtorId`), and both are `Contractor` rows:

| | Records |
|---|---|
| Debtor and counterparty are **different** | **214** |
| Debtor and counterparty are the **same** | **192** |
| No debtor | **0** |

So on 53% of records the debtor is a third party — a guarantor's principal, the
original obligor behind a surety — and on 47% the counterparty *is* the debtor. Both
readings are legitimate and both must display.

**`debtorId` is not risk-specific.** Across the whole register:

| Module | Debtor ≠ counterparty | Debtor = counterparty | No debtor |
|---|---|---|---|
| CONTRACT | **8,964** | 0 | 1,740 |
| PROJECT | 5,037 | 31 | 3,928 |
| RISK | 214 | 192 | 0 |
| No status | 0 | 0 | 31 |

8,964 contracts carry a debtor distinct from their counterparty. The Prisma doc
comment at `schema.prisma:364` — *"Risk module: the debtor"* — is **wrong**, or at
least far too narrow. What `debtor_id` means on a contract is Q40; it is used more
there than here.

### Twelve columns that risk records never use

Over all 406, the following are empty or constant:

| Column | Filled | Note |
|---|---|---|
| `description` ("Przedmiot") | **0** | **Not one risk record has a subject** |
| `contractReference` ("Numer umowy") | 0 | |
| `specificSalaryTerms` | 0 | |
| `paymentTerm` (legacy `date_payment`) | 0 | |
| `parentId` | 0 | No annexes, no projects |
| `insuranceGuarantee` | 0 true | False on all 406 |
| `natureId` | 406 — **all "(brak danych)"** | Set, and meaningless |
| `tradeId` | 406 — **all "brak"** | Set, and meaningless |
| `businesslineId` | 298 of 406 | 73% |
| `dateBegin` | 404 | |
| `dateEnd` | 401 | |

The existing table renders a **"Przedmiot"** column (`risk-table.tsx:55`) that is
empty on every single row.

### What they do use

| Column | Filled |
|---|---|
| `identifier`, `documentTypeId`, `companyId`, `primaryLocationId`, `contractorId`, `debtorId`, `domainId`, `currencyId` | 406 / 406 |

Document types in use: **Umowa** 354, **Aneks** 51, **Porozumienie** 1.
Companies: AMDSP 385, AMC 7, AMDP 4, HK POM 2, SSC 1, "(brak danych)" 7.

Date range: registered 2020-04-28 → 2026-07-15. The module is six years old, not
eleven — it postdates the rest of the system.

### A third identifier grammar

Every one of the 406 matches `^[0-9]{4}/[A-Z]/[0-9]{4}$` — **`YYYY/L/NNNN`**:

```
2026/U/0013    2026/P/0016    2020/C/0003    2021/Z/0001    2022/I/0001
```

The letter is the **initial of the domain**:

| Letter | Domain | Records |
|---|---|---|
| U | Ugoda | 205 |
| P | Poręczenie | 195 |
| C | Cesja | 2 — but both are filed under domain *Ugoda* |
| Z | Zabezpieczenie | 1 |
| I | Inne | 2 |
| P | *Ugoda* | 1 — a slip |

Three records disagree with their own identifier (two `C` and one `P` filed as
Ugoda) — six years of manual numbering, three mistakes.

The sequence **resets per year and per letter**:

| Year | Letter | Range | Count |
|---|---|---|---|
| 2020 | U | 0001–0015 | 11 |
| 2020 | P | 0002–0011 | 9 |
| 2021 | P | 0001–0052 | 52 |
| 2022 | U | 0001–0048 | 47 |
| 2026 | U | 0001–0013 | 13 |
| 2026 | P | 0001–0016 | 15 |

Gaps in every series (2020 U runs to 0015 with 11 rows) — deleted records, matching
the pattern spec 02 documents for contracts.

This is a **third grammar**, alongside `CO/BL/YYYY/NNNN` for contracts and
`…/PNNNN` for projects, and spec 02 does not cover it.

## Legacy quirks

### Quirk: the "Przedmiot" column is empty on all 406 records

- **Data:** `description IS NULL` on every risk record.
- **Current:** `components/ryzyko/risk-table.tsx:55` renders the column and the
  filter form offers a "Przedmiot" text search (`ryzyko/search-form.tsx:99`) that
  can never match anything.
- **Why it matters:** a column that is blank on 100% of rows is wasted width on a
  screen that needs it for the amount, and a filter that always returns nothing is
  worse than no filter.
- **We do:** drop both. If a risk record ever needs a description, the form can add
  the field back — but do not display a column for data that does not exist.
- **Sign-off:** not needed. Flagged as Q41 in case the field is meant to be filled
  going forward.

### Quirk: `natureId` and `tradeId` are set on every record and mean nothing

- **Data:** all 406 carry `natureId` → "(brak danych)" and `tradeId` → "brak".
- **Why:** the shared `contract` table makes both columns mandatory-ish, so the risk
  form fills them with the dictionary's null entry. They are structural noise.
- **We do:** never show them on the risk register or the risk detail page. Note that
  "(brak danych)" and "brak" are **real dictionary rows with real ids** — spec 01
  covers the `id = 0` pattern — so they cannot be filtered out by testing for null.
- **Sign-off:** not needed.

### Quirk: the debtor doc comment is wrong

- **Current:** `prisma/schema.prisma:364` reads *"Risk module: the debtor. Legacy
  `debtor_id` had no foreign key."* The second sentence is right; the first is not.
- **Data:** 8,964 contracts and 5,037 projects carry a debtor different from their
  counterparty, against 214 risk records.
- **We do:** correct the comment to state what is known — the column names a second
  `Contractor` on the record, used across all three modules, and its meaning outside
  Dział ryzyka is unconfirmed (Q40). A comment that scopes a column to the wrong
  module will send somebody down the wrong path.
- **Sign-off:** not needed.

### Quirk: the risk identifier grammar is not implemented

- **Data:** 406 of 406 are `YYYY/L/NNNN`, the letter encodes the domain, the
  sequence resets per year and per letter.
- **Current:** `lib/contracts/identifier.ts` knows the contract and project grammars
  and nothing about this one. A new risk record created through
  `/ryzyko/nowy` therefore gets a contract-shaped identifier.
- **We do:** add a third branch. Spec 02 owns the parser and generator; this spec
  supplies the grammar, the letter map and the reset rule. The letter is derived from
  the **domain**, so the form must require a domain before it can number the record.
- **Sign-off:** not needed. It is a missing implementation, not a change.
- **Blocks:** creating a correctly numbered risk record. Editing existing ones is
  unaffected.

### Quirk: three records contradict their own identifier

- **Data:** `2020/C/0003` and `2022/C/0002` are filed under domain **Ugoda**, not
  Cesja; one `P` record is likewise filed as Ugoda.
- **Why it matters:** the letter map is derived from the data, so these three are the
  counter-examples to it. A validation rule that rejects a mismatch would reject
  three existing records on edit.
- **We do:** **warn, do not block.** On save, if the identifier's letter disagrees
  with the chosen domain, show "Litera identyfikatora (C) nie zgadza się z rodzajem
  (Ugoda)" and let the user continue. Never renumber an existing record — the
  identifier is what the counterparty's paperwork says.
- **Sign-off:** not needed.

### Quirk: Cesja has never been used

- **Data:** domain 34, active, **zero** live records — while two records carry the
  `C` letter and are filed as Ugoda.
- **`[INFERRED]`:** the two `C` records *are* the assignments, and somebody picked
  the wrong domain twice. Or Cesja was added and never adopted.
- **We do:** keep the domain in the dropdown — it is active in the dictionary and
  removing a legal category on our own initiative is not ours to do. Recorded so
  nobody reports "an unused dictionary entry" as dead weight.
- **Sign-off:** not needed. Worth mentioning to the risk department alongside the
  three mismatched records.

### Quirk: risk records get the contract status palette on the detail page

- Carried from spec 05: `contract-preview.tsx:163` always calls `statusTone()`, while
  the risk *table* uses `riskStatusTone()` (`lib/contract-status.ts:24`). The same
  status is coloured differently in the list and on the record.
- **We do:** select the palette from the module, as spec 05 specifies.
- **Sign-off:** not needed.

## UI

### Layout

`app/(app)/ryzyko/page.tsx` is already the reference implementation for the
register-page recipe (spec 05), so this register changes least. Header
`<h1>Dział ryzyka</h1>`, **"Znaleziono: N"**, **"Dodaj nowy wpis"** →
`/ryzyko/nowy`.

With 406 records the default page size should be **50**, not 25 — the whole register
is nine pages. Options stay 10/15/25/50/100/250/500.

### Summary strip

Unique to this register, because the numbers are the point. Four `Fact` tiles above
the table, computed over the **filtered** set:

| Tile | Value today |
|---|---|
| Rekordów | 406 |
| Łączna kwota | 270 323 086 PLN |
| Aktywne | 399 |
| W sądzie | 1 |

The court figure is one record out of 406 and deserves to be impossible to miss.

### Filters

The existing nine (`features/ryzyko/search-form.tsx:90-99`), minus "Przedmiot",
plus three:

| Label | Param | Note |
|---|---|---|
| Identyfikator | `identifier` | |
| Status | `status` | The three RISK statuses |
| Spółka | `company` | |
| **Rodzaj** | `domain` | The five RISK domains |
| Właściciel | `owner` | `[na]` suffix |
| **Dłużnik** | `debtor` | Autocomplete over `Contractor` |
| Kontrahent | `contractor` | Autocomplete |
| NIP | `nip` | **Matches either party** — see below |
| Lokalizacja | `location` | New; set on all 406 |
| Typ dokumentu | `type` | New; Umowa/Aneks/Porozumienie |
| Kwota od / do | `amountFrom`, `amountTo` | New; the register's defining value |
| ~~Przedmiot~~ | — | **Removed** — never matches |

The NIP filter must search **both** parties:

```ts
{ OR: [{ contractor: { vatId: { contains: nip } } },
       { debtor:     { vatId: { contains: nip } } }] }
```

Otherwise a search for a debtor's NIP misses the 214 records where the debtor is not
the counterparty. This is the one filter behaviour that differs materially from the
other two registers.

### Columns

The existing eleven (`risk-table.tsx:49-59`), minus "Przedmiot":

> Identyfikator · Status · Spółka · **Dłużnik** · Kontrahent · Rodzaj · **Kwota** ·
> Od · Do · Właściciel

- **Kwota** right-aligned, `formatMoney`, with the currency. Amounts run to eight
  figures; use tabular numerals.
- **Dłużnik** and **Kontrahent** side by side. When they are the same — 192 records
  — render the debtor cell as "— (ten sam)" rather than repeating the name, so the
  214 genuine third-party debtors stand out.
- **Rodzaj** as a `Badge`; five values, two of which cover 99%.
- **Status** via `riskStatusTone()`, and "w sądzie" in `danger`.
- No "Przedmiot", no "Charakter umowy", no "Buissnesline" by default (empty on 27%),
  no "Numer umowy" (empty on 100%).

### Ordering

`registeredAt DESC, id DESC`, as elsewhere. With 98% of the register active and
value being the organising fact, an amount-descending sort is the obvious second
option — worth adding here even though the other registers have no sorting (Q35).

### Empty state

**"Brak rekordów spełniających kryteria."** / **"Zmień lub wyczyść filtry."**

## Implementation

### Files

| Path | Action | Note |
|---|---|---|
| `app/(app)/ryzyko/page.tsx` | modify | Default page size 50; summary tiles; new filters; `moduleWhere("RISK")` |
| `features/ryzyko/search-form.tsx` | delete | Replaced by `FilterBar` (spec 05) |
| `components/ryzyko/risk-table.tsx` | modify | Drop "Przedmiot"; "— (ten sam)" for a self-debtor |
| `lib/contracts/identifier.ts` | modify | The `YYYY/L/NNNN` grammar (spec 02 owns the file) |
| `lib/contracts/risk.ts` | create | `RISK_DOMAIN_LETTER`, `riskIdentifierFor(domain, year, seq)`, `riskSummary(where)` |
| `prisma/schema.prisma` | modify | Correct the `debtorId` doc comment |

### The letter map

```ts
/** The risk identifier is `YYYY/L/NNNN`, where L is the domain's initial and the
 *  sequence resets per year *and* per letter. Derived from all 406 live records;
 *  three of them disagree with their own domain — see docs/features/08. */
export const RISK_DOMAIN_LETTER: Record<number, string> = {
  33: "U", // Ugoda
  34: "C", // Cesja
  35: "P", // Poręczenie
  36: "Z", // Zabezpieczenie
  37: "I", // Inne
};
```

Keyed by domain id, not by name, so a renamed dictionary entry does not silently
change the numbering.

### The summary tiles

One `aggregate` alongside the existing `count` and `findMany`, over the same `where`:

```ts
prisma.contract.aggregate({ where, _sum: { salary: true }, _count: true })
```

plus two `count` calls for the active and in-court figures. Four queries on a
406-row register is not worth optimising further.

### Reuse

`FilterBar`, `Pagination`, `ClickableRow`, `Badge`, `Fact` (spec 05),
`riskStatusTone()`, `formatMoney`, `formatDate`, `userLabel`, `contractorLabel`,
`ASSIGNEE_SELECT`, `loadOwnerOptions`, `contractScopeWhere` (spec 03).

## Verification

```sql
-- 1. Scope and statuses.
select s.id, s.name, count(c.id)
from "ContractStatus" s
left join "Contract" c on c."statusId" = s.id and not c."isDeleted"
where s.kind = 'RISK' group by 1, 2 order by 1;
-- expected: 9→399, 10→6, 11→1     (406 total)

-- 2. The five domains.
select d.id, d.name, count(c.id)
from "Domain" d
left join "Contract" c on c."domainId" = d.id and not c."isDeleted"
where d.kind = 'RISK' group by 1, 2 order by 1;
-- expected: 33 Ugoda 208 | 34 Cesja 0 | 35 Poręczenie 195 | 36 Zabezpieczenie 1 | 37 Inne 2

-- 3. The money — drives the summary tiles.
select count(*), round(sum(salary)), round(avg(salary)), round(max(salary)),
       count(*) filter (where salary = 0)
from "Contract" c join "ContractStatus" s on s.id = c."statusId"
where not c."isDeleted" and s.kind = 'RISK';
-- expected: 406 | 270323086 | 665820 | 15000000 | 2

-- 4. Two parties.
select count(*) filter (where "debtorId" <> "contractorId") differs,
       count(*) filter (where "debtorId" =  "contractorId") same,
       count(*) filter (where "debtorId" is null)           none
from "Contract" c join "ContractStatus" s on s.id = c."statusId"
where not c."isDeleted" and s.kind = 'RISK';
-- expected: 214 | 192 | 0

-- 5. The columns that are always empty — justifies dropping them.
select count(description) przedmiot, count("contractReference") numer,
       count("specificSalaryTerms") inne_wynagr, count("paymentTerm") termin,
       count("parentId") parent, count(*) filter (where "insuranceGuarantee") gwarancja
from "Contract" c join "ContractStatus" s on s.id = c."statusId"
where not c."isDeleted" and s.kind = 'RISK';
-- expected: 0 | 0 | 0 | 0 | 0 | 0

-- 6. The identifier grammar — every record, no exceptions.
select count(*) filter (where identifier ~ '^[0-9]{4}/[A-Z]/[0-9]{4}$') canonical, count(*) total
from "Contract" c join "ContractStatus" s on s.id = c."statusId"
where not c."isDeleted" and s.kind = 'RISK';
-- expected: 406 | 406

-- 7. Letter ↔ domain, including the three slips.
select substring(c.identifier from '^[0-9]{4}/([A-Z])/') letter, d.name, count(*)
from "Contract" c join "ContractStatus" s on s.id = c."statusId"
left join "Domain" d on d.id = c."domainId"
where not c."isDeleted" and s.kind = 'RISK' group by 1, 2 order by 3 desc;
-- expected: U/Ugoda 205 | P/Poręczenie 195 | C/Ugoda 2 | I/Inne 2 | P/Ugoda 1 | Z/Zabezpieczenie 1

-- 8. `debtorId` is not risk-specific.
select coalesce(s.kind::text, '(brak)') kind,
       count(*) filter (where c."debtorId" is not null and c."debtorId" <> c."contractorId") differs
from "Contract" c left join "ContractStatus" s on s.id = c."statusId"
where not c."isDeleted" group by 1 order by 2 desc;
-- expected: CONTRACT 8964 | PROJECT 5037 | RISK 214 | (brak) 0
```

Manual checks:

- [ ] `/ryzyko` reports **406** and the summary strip reads 406 / 270 323 086 PLN /
      399 aktywne / 1 w sądzie
- [ ] Filtering by domain "Ugoda" recomputes the total from the filtered set, not the
      whole register
- [ ] The "w sądzie" record is rendered in `danger` and is easy to find
- [ ] There is **no "Przedmiot" column and no "Przedmiot" filter**
- [ ] Searching a NIP that belongs to a **debtor only** finds the record — test one
      of the 214 where debtor ≠ counterparty
- [ ] On one of the 192 self-debtor records the Dłużnik cell reads "— (ten sam)"
- [ ] "Kwota od / do" filters correctly at the 15 000 000 extreme
- [ ] Amounts are right-aligned with tabular numerals and do not reflow between rows
- [ ] Default page size is 50; the register is nine pages
- [ ] A new risk record with domain Poręczenie in 2026 is numbered `2026/P/0017`
- [ ] Editing `2020/C/0003` (domain Ugoda) shows the mismatch **warning** and saves
      anyway, with the identifier unchanged
- [ ] A risk record's status badge is the same colour in the list and on the detail
      page
- [ ] Opening a risk id under `/umowy/[id]` 404s (spec 05)
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Q40 — what does `debtor_id` mean on a contract?** 8,964 contracts and 5,037
   projects carry a debtor distinct from their counterparty, which is 20× the risk
   module's usage. Either it means something quite different outside Dział ryzyka, or
   the contract form has been writing it as a second counterparty field. It is
   currently displayed nowhere outside `/ryzyko`, so whatever it holds is invisible.
   **This is the largest unexplained column left in the schema.**
2. **Q41 — should risk records have a "Przedmiot"?** Not one of the 406 does. We
   propose removing the column and the filter. If the risk department expects to
   describe a settlement in free text, the field belongs on the form instead.
3. **Q42 — can anyone send a screenshot of the legacy `/risk` list?** One image
   settles the real column set, the real filters and the default sort, and converts
   this whole spec from inferred to observed. The same request covers Supply chain
   (spec 26).
4. **Q43 — the three identifier/domain mismatches and the unused Cesja domain.**
   `2020/C/0003` and `2022/C/0002` are filed as Ugoda; one `P` record likewise. Are
   they mislabelled, or is the letter not the domain after all? Worth confirming
   before the generator derives numbering from the domain.
5. **Q44 — should the amount be sortable?** It is the organising fact of the module
   and no other register has sorting. Adding it here only is a small inconsistency
   with a clear justification; adding it everywhere is Q35.

---
id: 09
title: Podgląd rekordu (contract detail)
group: B-registers
status: done
depends-on: [05]
legacy-tables: [contract]
prisma-models: [Contract, ContractUser, Attachment, Remark, Opinion, AcceptanceForm]
routes: ["/umowy/[id]", "/projekty/[id]", "/ryzyko/[id]"]
---

# 09 — Podgląd rekordu (contract detail)

## Why

The preview is the screen people actually work in. `audyt §1.4` documents it more
completely than anything else in the legacy system — **34 fields, in order, with
example values and types**, captured from a live record. That table is the single
most valuable artefact we have from the old UI, and it has never been checked
field-by-field against what we built.

Doing that check here turns up four fields legacy shows and we do not, a different
field order, and — unexpectedly — **answers two of the open questions about column
semantics** that have been sitting in the README since spec 01.

## Legacy behaviour

### Routing

`/contract/preview/{id}`, opened as a **1000×600 popup** by a JavaScript
`openPreview2` / `window.open`, read-only (`audyt §1.1`). Projekty reuses the same
function and probably the same screen (`audyt §2.1`).

Three iframes hang inside it: `/files/show/{id}/` (attachments),
`/remarks/index/{id}` (notes), and the acceptance form is a separate route with a
"…-pdf" button next to it (`audyt §1.5`).

### The 34 fields, in legacy order

Verbatim from `audyt §1.4`, with the Prisma field each maps to:

| # | Legacy label | Example | Prisma |
|---|---|---|---|
| 1 | Buissnesline | DYSTRYBUCJA / SSC | `businessline.name` |
| 2 | Forma doręczenia | (brak danych) | `deliveryMethod.name` |
| 3 | Identyfikator | AMDSP/DYS/2026/0006 | `identifier` |
| 4 | **Aneksy do umowy** | relation | children, module CONTRACT |
| 5 | **Project** | AMDSP/DYS/2025/P0481; | children, module PROJECT |
| 6 | **Aneks do umowy** | relation | `parent` |
| 7 | Typ dokumentu | Umowa | `documentType.name` |
| 8 | **Weksel** | Nie | **`bill`** — see below |
| 9 | Numer umowy | text | `contractReference` |
| 10 | Status | Zakończona | `status.name` |
| 11 | Spółka | AMDSP | `company.shortName` |
| 12 | Lokalizacja | Katowice | `primaryLocation.name` |
| 13 | Rodzaj umowy | Usługi | `domain.name` |
| 14 | Przedmiot umowy | long text | `description` |
| 15 | Data zawarcia | 2025-12-18 | `dateBegin` |
| 16 | Data zakończenia | 2026-01-09 | `dateEnd` |
| 17 | Okres wypowiedzenia | "specyficzne" | `noticePeriod.name` |
| 18 | Wynagrodzenie | 0.00 | `salary` |
| 19 | Waluta | PLN | `currency.code` |
| 20 | Termin płatności | long text | `paymentTerm` |
| 21 | Kontrahenci | Hotel Lamberton Sp. z o.o. NIP: 1182274493 | `contractor` + NIP |
| 22 | Podmiot powiązane | Nie | `companiesConnected` |
| 23 | Inne określenie wynagrodzenia | "9 369,75 zł brutto" | `specificSalaryTerms` |
| 24 | Charakter umowy | Kosztowa | `nature.name` |
| 25 | Eksport/Import | brak | `trade.name` |
| 26 | **Formularz** | Tak | **`tempForm`** — see below |
| 27 | Uwagi | (empty) | `remarks` |
| 28 | OBSC | Nie | `obsc` |
| 29 | Właściciel umowy | Włodek Karolina; Mazur Mateusz | `userAccess` → users |
| 30 | Data rejestracji | 2026-01-16 13:30:30 | `registeredAt` |
| 31 | **Zarejestrowano przez** | **mborowiecka** | `registeredBy` — **the login** |
| 32 | Data modyfikacji | 2026-07-16 10:16:06 | `modifiedAt` |
| 33 | **Modyfikowano przez** | **mgolosz** | `modifiedBy` — **the login** |

Four observations worth carrying forward.

**The audit's field 21 renders the NIP inline** — "Hotel Lamberton Sp. z o.o. NIP:
1182274493", not just the name. The NIP is how a counterparty is identified in
practice.

**Fields 31 and 33 show the login, not the display name.** `mborowiecka`, not
"Borowiecka Małgorzata". Everywhere else in the system a person is "Nazwisko Imię";
in the audit footer legacy shows the account.

**`insurance_guarantee` is not in the list.** It exists in the schema and on 204
records (91 contracts, 113 projects, 0 risk), and legacy does not show it on the
preview.

**Fields 4, 5 and 6 are three separate relation fields**, distinguishing the
record's annexes, its projects, and the contract it is an annex of. Spec 07
establishes that all three come from the same overloaded `parent_id`.

## The two semantics questions, answered

`README.md` has carried Q8 (*what is `contract.bill`?*) and Q10 (*what is
`contract.temp_form`?*) since spec 01, both marked "semantics unconfirmed". The
audit answers both, by position.

The legacy preview shows exactly **four** booleans: **Weksel**, **Podmiot
powiązane**, **Formularz**, **OBSC** (`audyt §1.4`, fields 8, 22, 26, 28). The
`contract` table has exactly four boolean-ish columns that could back them —
`bill`, `companies_connected`, `temp_form`, `OBSC` — since `insurance_guarantee`,
`edittable` and `accept` are accounted for elsewhere. Two of the pairings are
already obvious by name. That leaves `bill` ↔ **Weksel** and `temp_form` ↔
**Formularz** as the only possible assignment.

**Q8 — `bill` is "Weksel", a bill of exchange.** The English word *bill*, in the
sense of *bill of exchange*, is precisely Polish *weksel*. 544 records are set,
which is what one would expect of a promissory note securing a contract, and it is
nothing like "faktura" (which would be set on most of the register). Whoever wrote
`features/kontrakty/contract-preview.tsx:284` reached the same conclusion — the
`FlagChip` already reads "Weksel" — but no document recorded the reasoning, so the
question stayed open.

**Q10 — `temp_form` is "Formularz".** 9,113 records set, and the audit's example
record shows "Formularz: Tak", so a high hit rate is expected. `contract-preview.tsx:287`
already labels it "Formularz". What the *flag itself* means — which form, and why a
contract has one — is still unknown, and that residue is the part of Q10 worth
keeping open.

Both should be recorded as **strongly supported inference**, not observation: the
audit gives labels and the schema gives columns, and the mapping is by elimination.
A single legacy record where `bill = 1` would settle it outright (Q45).

## Data

Fill rates over all 20,137 live records, in the audit's field order, so gaps in the
screen are predictable:

| Field | Filled | Note |
|---|---|---|
| `businesslineId` | 12,516 | 62% — blank on most projects |
| `deliveryMethodId` | ~10,120 on contracts | "(brak danych)" is a real value |
| `identifier` | 20,137 | always |
| `documentTypeId` | 20,106 | |
| `bill` true | **544** | |
| `contractReference` | ~10,900 | |
| `statusId` | 20,106 | 31 without |
| `description` | 19,632 | **0 on all 406 risk records** (spec 08) |
| `paymentTerm` | ~0 on risk, free text elsewhere | legacy `date_payment`, a `varchar(255)` |
| `companiesConnected` true | ~441 | |
| `specificSalaryTerms` | sparse | |
| `tradeId` | set everywhere, "brak" on 14,183 | |
| `tempForm` true | **9,113** | |
| `obsc` true | **499** across all modules | |
| `insuranceGuarantee` true | **204** | not shown by legacy |
| `debtorId` | **14,215** | shown by us, not by legacy (spec 08, Q40) |

## Legacy quirks

### Quirk: the "Project" field is missing from our preview

- **Legacy:** field 5, *"Project | AMDSP/DYS/2025/P0481; | relacja do projektu/-ów
  (może wiele)"* — the projects that produced this contract.
- **Current:** `features/kontrakty/contract-preview.tsx` renders no such field.
  Spec 07 establishes the data is there: **6,981 projects hang off contract-kind
  records** through `parent_id`.
- **Why it matters:** it is the link from a signed contract back to how it was
  negotiated, and it is the only navigation between the two modules.
- **We do:** add it, labelled **"Project"** — legacy's label, in English, inside an
  otherwise Polish screen, preserved verbatim per `README.md`. Render each as a link
  to `/projekty/{id}`, semicolon-separated as legacy does.
- **Sign-off:** not needed. It restores a legacy field.

### Quirk: "Aneksy do umowy" counts projects as annexes

- Carried from spec 07. Fields 4 and 5 are two different lists from one relation,
  and our `_count.annexes` does not distinguish them.
- **We do:** `annexesOf()` for field 4, `projectsFor()` for field 5 (spec 07
  §Implementation).
- **Sign-off:** not needed.

### Quirk: the audit footer should show the login, not the display name

- **Legacy:** "Zarejestrowano przez: **mborowiecka**", "Modyfikowano przez:
  **mgolosz**" (`audyt §1.4`, fields 31 and 33).
- **Current:** `contract-preview.tsx` uses `userLabel()`, which renders
  "Nazwisko Imię".
- **Why legacy is right here:** the audit trail identifies the *account* that acted.
  With 451 of 452 users currently placeholders (spec 04), `userLabel` produces
  "legacy-50463" anyway, while the login is a real, stable identifier that survives
  the directory import.
- **We do:** show the login in the audit section, and keep `userLabel` everywhere a
  person is named as a person (owners, note authors, reviewers). Render the display
  name as a `title` attribute so hovering still answers "who is that".
- **Sign-off:** not needed. It restores legacy.

### Quirk: two of three detail routes do not check the record's module

- Carried from spec 05: `/umowy/[id]` and `/ryzyko/[id]` render `ContractPreview`
  without checking `status.kind`, so a project id under `/umowy` renders with the
  wrong back link and the wrong buttons.
- **We do:** one guard in the shared preview, `notFound()` on a mismatch.
- **Sign-off:** not needed.

### Quirk: risk records get the contract status palette

- Carried from spec 05 (`contract-preview.tsx:163`).
- **We do:** pick the palette from the module.
- **Sign-off:** not needed.

### Quirk: we show three fields legacy does not

- **`Dłużnik`** (`contract-preview.tsx:276`) — set on 14,215 records and invisible
  in legacy. Keep it: hiding data we hold is worse than showing an unexplained field,
  and it is the only surface where Q40 can ever be answered by a user noticing it.
- **`Gwarancja/ubezpieczenie`** (`:285`) — 204 records, absent from `audyt §1.4`.
  Keep, for the same reason.
- **`Prawo edycji`** (`:278`) — ours entirely. It becomes genuinely useful once
  spec 03 makes edit rights mean something.
- **We do:** keep all three, and record here that they are additions so nobody
  "restores parity" by deleting them.
- **Sign-off:** not needed.

### Quirk: the counterparty should show its NIP inline

- **Legacy:** field 21 renders "Hotel Lamberton Sp. z o.o. **NIP: 1182274493**".
- **Current:** `contractorLabel()` renders the name only.
- **We do:** in the preview's party section, append the NIP as legacy does. Leave
  `contractorLabel` alone — the register columns are tight and the NIP does not
  belong there.
- **Sign-off:** not needed.

## UI

### Structure

One kind-aware component for all three modules (spec 05), replacing the
433-line `app/(app)/projekty/[id]/page.tsx` fork.

Legacy renders 34 fields as a flat list in a popup. We keep the **content** and the
**labels** exactly, and group them into sections, because a flat 34-row list on a
full-width page is worse than legacy's popup, not better. Field order within a
section follows the audit.

| Section | Fields (audit numbers) |
|---|---|
| Tiles (`Fact`) | Spółka 11, Lokalizacja 12, Kontrahenci 21, Wynagrodzenie 18+19, Okres 15–16 |
| **Klasyfikacja** | Buissnesline 1, Typ dokumentu 7, Numer umowy 9, Rodzaj umowy 13, Charakter umowy 24, Lokalizacje (spec 12) |
| **Przedmiot i wynagrodzenie** | Przedmiot umowy 14, Wynagrodzenie 18, Waluta 19, Inne określenie wynagrodzenia 23, Termin płatności 20 |
| **Terminy** | Data zawarcia 15, Data zakończenia 16, Okres wypowiedzenia 17, Data wysłania do podpisu |
| **Dostawa i handel** | Forma doręczenia 2, Eksport/Import 25, Opis OBSC |
| **Strony** | Kontrahenci 21 *(with NIP)*, Dłużnik, Właściciel umowy 29, Prawo edycji |
| **Cechy** (`FlagChip`) | Weksel 8, Podmiot powiązane 22, Formularz 26, OBSC 28, Gwarancja/ubezpieczenie |
| **Powiązania** | **Aneks do umowy 6**, **Aneksy do umowy 4**, **Project 5** |
| **Uwagi** | Uwagi 27 |
| Per module | Obieg FAU (spec 16) on projects; notes (14); attachments (18); history (13) |
| **Audyt** | Data rejestracji 30, Zarejestrowano przez 31 *(login)*, Data modyfikacji 32, Modyfikowano przez 33 *(login)* |

### Per-module differences

| | Umowy | Projekty | Ryzyko |
|---|---|---|---|
| Status palette | `statusTone` | `projectStatusTone` | `riskStatusTone` |
| Obieg FAU | only if rows exist (40 records) | always | never |
| Powiązania | Aneksy + Project | the resulting contract | hidden — `parentId` is null on all 406 |
| Przedmiot | shown | shown | **hidden** — null on all 406 |
| Dłużnik | shown if set | shown if set | **prominent**, next to Kontrahent |
| Charakter / Eksport-Import | shown | shown | **hidden** — constant (spec 08) |

A field with no value renders "—" rather than disappearing, so the layout is stable
between records. The exceptions are the module-level hides above, which are
structural rather than per-record.

### Actions

The existing action bar (`features/kontrakty/contract-actions.tsx`): Edytuj,
Dodaj aneks, Formularz akceptacji, Zadaj pytanie, Historia zmian, Usuń. Edit
actions are hidden — not merely disabled — when `canEditContract` is false, and
after spec 01, when `isEditable` is false (6,829 frozen records).

**No "wyślij jako załącznik".** Excluded.

## Implementation

### Files

| Path | Action | Note |
|---|---|---|
| `features/kontrakty/contract-preview.tsx` | modify | Module guard, palette, the three missing relation fields, login in the footer, NIP inline |
| `app/(app)/projekty/[id]/page.tsx` | delete | Spec 05 |
| `components/ui/section.tsx` | create | Spec 05 — `Section`, `Field`, `Fact`, `FlagChip` |
| `lib/contracts/relations.ts` | use | `annexesOf`, `projectsFor` from spec 07 |
| `prisma/schema.prisma` | modify | Doc comments: `bill` → "Weksel", `tempForm` → "Formularz", citing this spec |

### Loading the three relation fields

One `include` on the existing query, split in memory rather than issuing two more
queries:

```ts
children: {
  where: { isDeleted: false },
  select: { id: true, identifier: true, statusId: true, status: { select: { kind: true } } },
  orderBy: { identifier: "asc" },
}
```

then partition on `status.kind`. A record has at most a few dozen children, so this
is cheaper than two filtered relations.

## Verification

```sql
-- 1. The four legacy booleans and their fill rates.
select count(*) filter (where bill)                 weksel,
       count(*) filter (where "companiesConnected") podmiot_powiazane,
       count(*) filter (where "tempForm")           formularz,
       count(*) filter (where obsc)                 obsc,
       count(*) filter (where "insuranceGuarantee") gwarancja_nie_w_legacy
from "Contract" where not "isDeleted";
-- expected: 544 | 441 | 9113 | 499 | 204

-- 2. The "Project" field has data on most contracts.
select count(distinct p.id) contracts_with_projects, count(*) project_links
from "Contract" p
join "ContractStatus" ps on ps.id = p."statusId" and ps.kind = 'CONTRACT'
join "Contract" c on c."parentId" = p.id and not c."isDeleted"
join "ContractStatus" cs on cs.id = c."statusId" and cs.kind = 'PROJECT'
where not p."isDeleted";
-- expected: project_links 6981

-- 3. The audit footer needs a login, and almost nobody has a real name yet.
select count(*) total, count(*) filter (where login is not null) with_login,
       count(*) filter (where login like 'legacy-%') placeholders
from "User";
-- expected: 452 | 452 | 451

-- 4. Fields that must be hidden per module, not per record.
select count(description) przedmiot, count("parentId") parent
from "Contract" c join "ContractStatus" s on s.id = c."statusId"
where not c."isDeleted" and s.kind = 'RISK';
-- expected: 0 | 0   → hide both sections on risk records
```

Manual checks:

- [ ] Open the audit's example record (`AMDSP/DYS/2026/0006`) and walk all 33
      labelled fields — every one present, spelled as in `audyt §1.4`
- [ ] **"Project"** appears, in English, linking to `/projekty/{id}`
- [ ] "Aneksy do umowy" lists annexes only; the projects are under "Project"
- [ ] "Aneks do umowy" links to the parent on an annex and is absent otherwise
- [ ] "Zarejestrowano przez" shows a **login**, with the display name on hover
- [ ] The counterparty shows "Nazwa NIP: 1234567890"
- [ ] `Weksel`, `Podmiot powiązane`, `Formularz`, `OBSC` all render as chips
- [ ] A risk record shows no "Przedmiot", no "Charakter umowy", no
      "Eksport/Import", no "Powiązania", and a prominent Dłużnik
- [ ] A project shows "Obieg FAU" and the resulting contract
- [ ] A risk status badge matches its colour in the register
- [ ] A project id under `/umowy/[id]` 404s; a contract id under `/ryzyko/[id]` 404s
- [ ] With `canEditContract` false, the edit actions are **absent**, not greyed out
- [ ] No "wyślij jako załącznik" anywhere
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Q45 — confirm `bill` = "Weksel" and `temp_form` = "Formularz" on a live
   record.** The mapping is by elimination from `audyt §1.4` and is very likely
   right, but one legacy preview of a record with `bill = 1` settles it, and the same
   screenshot answers what the "Formularz" flag is actually for.
   **This supersedes Q8 and narrows Q10.**
2. **Q46 — should the preview stay a full page or become a popup?** Legacy uses a
   1000×600 `window.open`. We render a page. A page is better on every axis except
   familiarity, and the legal department has used the popup for eleven years.
3. **Q47 — order within the sections.** We keep legacy's field order inside our
   groups, which means the overall top-to-bottom order differs from legacy. If
   anyone reads the preview as a checklist, the grouping is a real change and they
   should see it before cutover.
4. **Q40 carries over** — `Dłużnik` is shown on 14,215 records and nobody knows what
   it means outside Dział ryzyka.

## Implementation notes (2026-09-24)

- One module-aware `ContractPreview` for all three routes, sections as in the table
  above. The 433-line Projekty fork is gone.
- **Relations** load once and are partitioned in memory (`partitionRelations`):
  "Aneks do umowy", "Aneksy do umowy", and **"Project"** (English label, links to
  `/projekty/{id}`, `;`-separated). A project shows "Umowa" (the resulting
  contract), plus "Projekt nadrzędny" / "Projekty aneksów" where the data has them.
  Children sort numerically (`compareIdentifiers`).
- **Audit footer** shows the login, with the display name on hover. The
  counterparty shows "Nazwa NIP: …". The four legacy booleans plus
  Gwarancja/ubezpieczenie are chips.
- **Per module:** risk hides Przedmiot, Charakter umowy, Eksport/Import and
  Powiązania, and puts Dłużnik in the tiles. Obieg FAU always shows on projects, on
  contracts only when there are rows, never on risk. Its empty state comes from the
  rows, not the `opinionsRequested` flag. A project's workflow section shows
  "Koordynator obiegu" from spec 01's `opinionsRequestedBy`.
- **Frozen records.** `canEditContract` now honours `Contract.isEditable`
  (administrators excepted). The action bar hides edit actions and says why. This
  one gate from spec 03 was needed here, and does not depend on Q18.
- The schema doc comments on `bill` ("Weksel") and `tempForm` ("Formularz") cite
  this spec.

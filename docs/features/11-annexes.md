---
id: 11
title: Aneksy
group: B-registers
status: todo
depends-on: [02, 10]
legacy-tables: [contract]
prisma-models: [Contract, DocumentType]
routes: ["/umowy/[id]", "/umowy/[id]/aneks", "/umowy/[id]/projekt-aneksu"]
---

# 11 — Aneksy

## Why

3,038 annexes hang off contracts. Amending a signed contract is the second most
common thing that happens in this register after creating one, and the identifier
grammar has a dedicated suffix for it (`/A01`) that `contractview` parses
(`cru.sql:447511`).

"Dodaj aneks" is built (`features/kontrakty/contract-actions.tsx`). What is not
settled is the numbering rule, and this spec establishes it from all 3,010 annex
identifiers: **flat, never nested, one sequence per parent, gaps allowed.**

It also corrects the figure the project has been working from. `plan.md` says
*"Half the register is annexes — 10,167 of 20,137 live contracts have a
`parentId`"*. Spec 07 shows why that is wrong; this spec gives the real number.

## Legacy behaviour

### What the audit saw

`audyt §1.4` records two relation fields on the preview:

| Field | Meaning |
|---|---|
| **Aneksy do umowy** | the annexes of this contract |
| **Aneks do umowy** | the contract this record is an annex of |

No add-annex route was observed — `audyt §1.1` marks the edit and add endpoints
`[NIEZNANE]`. The two buttons we have, "Dodaj aneks" and "Stwórz projekt aneksu",
are ours, built from the data pattern.

### The identifier

`contractview` (`cru.sql:447511`) branches on `type_id = 5` — "Aneks" — to parse
three parts instead of two:

```sql
abs(substring_index(`c`.`identifier`, '/', if((`c`.`type_id` = 5), -(3), -(2))))  AS n_year
abs(substring_index(replace(`c`.`identifier`,'P',''), '/', if((`c`.`type_id` = 5), -(2), -(1)))) AS n_number
if((`c`.`type_id` = 5), abs(substring_index(replace(`c`.`identifier`,'A',''), '/', -(1))), 0)    AS n_anex
```

So an annex is `<parent identifier>/A<nn>`, and a non-annex has `n_anex = 0`.
Spec 02 owns the parser; this spec owns the generator.

## Data

### How many annexes there really are

`parentId` is set on 10,167 live records, but the relation is overloaded — on a
project it means "became this contract" (spec 07). Counting children of
contract-kind records by the child's own module:

| Child is | Count |
|---|---|
| A **project** | 6,981 |
| **An annex** (a contract) | **3,038** |

Plus 111 projects parented by projects, and 28 projects carrying an `/A` suffix —
drafts of an amendment going through the approval round.

So: **3,038 annexes, not 10,167.** 15% of the register, not half.

### Suffix and relation agree, with one historical exception

Over contract-kind records:

| | Count |
|---|---|
| `/A` suffix **and** a parent | **2,982** |
| `/A` suffix, **no** parent | **0** |
| Parent, **no** `/A` suffix | **61** |

Nothing carries the suffix without a parent — so the suffix is never decorative.
The 61 the other way are all **2012 records typed "Aneks"** with the old bare
`YYYY/NNNN` numbering (`2012/0789`, `2012/0289`, `2012/0346`, …): the suffix
convention was adopted after the first year, and those 61 predate it.

### The document type is not a reliable marker

| Document type | Records | …with an `/A` suffix |
|---|---|---|
| Umowa | 6,466 | **27** |
| **Aneks** | 2,937 | **2,808** |
| Zlecenie | 827 | **19** |
| Porozumienie | 294 | **127** |
| Umowa ramowa | 128 | 0 |
| Kontrakt | 20 | 0 |
| Przetarg | 19 | 0 |
| List intencyjny | 13 | **1** |

129 records typed "Aneks" have no suffix (the 61 from 2012 plus 68 more), and 174
records with a suffix are typed as something else — mostly **Porozumienie**, which
makes sense: a settlement amending a contract is both.

**Neither signal alone identifies an annex.** The `parentId` relation plus the
module is authoritative; the type and the suffix are corroboration.

### Numbering

3,010 live records carry a suffix. The distribution is a clean decay:

| `/A` number | Records | | `/A` number | Records |
|---|---|---|---|---|
| 01 | **1,400** | | 08 | 36 |
| 02 | 583 | | 09 | 23 |
| 03 | 304 | | 10 | 19 |
| 04 | 191 | | 11 | 17 |
| 05 | 119 | | 12 | 12 |
| 06 | 88 | | 13 | 10 |
| 07 | 60 | | 14 | 8 |

The maximum is **`/A58`**. Annexes per parent:

| Annexes on one contract | Parents |
|---|---|
| 58 | 1 |
| 56 | 1 |
| 49 | 1 |
| 20 | 1 |
| 18 | 1 |
| 17 | 2 |
| 13 | 1 |
| 12 | 2 |

Two-digit zero padding throughout, so `/A58` not `/A058`. Nothing has reached 100
in fourteen years; at 58 the format still has room, and the parser (spec 02) must
not assume exactly two digits.

**70 parents have gaps** — their annex count does not equal their highest number,
because an annex was deleted. So the generator must take `max + 1`, never
`count + 1`.

### Annexes never nest

**Zero** annexes have an annex as their parent. The structure is strictly two
levels: a contract, and its annexes. An amendment to an amendment gets the next
number on the original contract.

## Legacy quirks

### Quirk: `_count.annexes` counts projects

- Carried from spec 07 and repeated here because this is the spec that owns the
  relation: `app/(app)/umowy/page.tsx:178` selects `_count: { annexes: true }`
  unfiltered, so the "Aneks" column reports 10,019 children where 3,038 are annexes.
- **We do:** `annexesOf()` from `lib/contracts/relations.ts` (spec 07) everywhere the
  word "aneks" appears in the UI.
- **Sign-off:** not needed.

### Quirk: the numbering must be `max + 1`, not `count + 1`

- **Data:** 70 parents have a gap between their annex count and their highest
  number.
- **Why it matters:** `count + 1` on a contract whose `/A03` was deleted produces a
  duplicate `/A03`. `identifier` is not unique in this database — spec 02 counts 111
  duplicates already — so nothing would stop it.
- **We do:** `max(n_anex) + 1` over the parent's annexes, **including soft-deleted
  ones**. A deleted annex still consumed its number; reusing it makes two documents
  share an identifier, and the paper copies are already filed.
- **Sign-off:** not needed.

### Quirk: 61 annexes from 2012 have no suffix

- **Data:** `2012/0789`, `2012/0289`, … — typed "Aneks", parented, bare numbering.
- **Why it matters:** any rule of the form "an annex is a record whose identifier
  matches `/A\d+$`" misses them, including a display that decides whether to show
  the "Aneks do umowy" field.
- **We do:** decide from `parentId` plus the module, never from the identifier.
  Never renumber them.
- **Sign-off:** not needed.

### Quirk: the document type disagrees with the relation on ~300 records

- **Data:** 129 typed "Aneks" with no suffix, 174 with a suffix typed otherwise
  (127 of them "Porozumienie").
- **We do:** do not enforce `documentTypeId = Aneks` when creating an annex —
  default to it, and let the user choose Porozumienie, which 127 records show is a
  legitimate combination. Do not validate the pair.
- **Sign-off:** not needed.

### Quirk: two buttons, one form

- **Current:** "Dodaj aneks" and "Stwórz projekt aneksu" both open the contract form
  (spec 10) with the parent pre-filled. The difference is the module of the record
  created — a contract-module annex, or a **project** for that annex, which is what
  the 28 `/A`-suffixed projects are.
- **Why both exist:** an amendment usually goes through the same approval round as
  the original, so the project comes first and becomes the annex.
- **We do:** keep both, and make the distinction explicit in the button's help text.
  "Stwórz projekt aneksu" creates a PROJECT-module record with the `/A` suffix; when
  it completes, its `parentId` points at the contract, matching the 28 existing ones.
- **Sign-off:** not needed.

## UI

### On the parent contract

The **"Aneksy do umowy"** section of the preview (spec 09, audit field 4). A table,
not a comma list — 1,400 contracts have one annex but the long tail runs to 58:

| Column | Source |
|---|---|
| Identyfikator | `identifier`, linking to the annex |
| Typ dokumentu | `documentType.name` |
| Status | `Badge` |
| Data zawarcia | `dateBegin` |
| Wynagrodzenie | `salary` + currency |

Ordered by the parsed annex number, ascending — **not** by identifier string, or
`/A10` sorts before `/A2`. Spec 02's `parseIdentifier().annex` supplies the key.

Collapse beyond ten with "pokaż wszystkie (N)". Empty state: the section is absent,
not empty.

Above the table, when the actor can edit: **"Dodaj aneks"** and
**"Stwórz projekt aneksu"**.

### On the annex

**"Aneks do umowy"** (audit field 6) — a link to the parent, shown prominently near
the identifier rather than buried in a section, because on an annex the parent is
the first thing anyone needs.

An annex also shows its **siblings** — the other annexes of the same parent — which
legacy does not. Worth it: on a contract with 58 amendments, "which one is current"
is the question, and answering it by going up and back down is friction.

### Creating one

The contract form (spec 10) with these pre-filled from the parent and editable:

| Field | Pre-filled from |
|---|---|
| Identyfikator | generated — `<parent>/A<max+1>`, read-only |
| Typ dokumentu | **Aneks** |
| Spółka, Buissnesline, Lokalizacja | parent |
| Kontrahent, Dłużnik | parent |
| Rodzaj umowy, Charakter umowy | parent |
| Właściciel umowy, Prawo edycji | parent |
| Status | **not** pre-filled — a new annex is not automatically in force |
| Daty, Wynagrodzenie, Przedmiot | **empty** — these are what the annex changes |

The generated number appears before the first save so the user sees what they are
creating.

## Implementation

### Files

| Path | Action | Note |
|---|---|---|
| `lib/contracts/identifier.ts` | modify | `nextAnnexIdentifier(parent)` — `max + 1`, including deleted |
| `lib/contracts/relations.ts` | use | `annexesOf` (spec 07) |
| `features/kontrakty/contract-preview.tsx` | modify | The annex table, the parent link, siblings |
| `features/kontrakty/form-page.tsx` | modify | Pre-fill map above; `/aneks` and `/projekt-aneksu` entry points |
| `app/(app)/umowy/page.tsx` | modify | `_count.annexes` filtered by module |

### The generator

```ts
/** `<parent>/A<nn>`, two-digit padded, `max + 1` over the parent's annexes
 *  **including soft-deleted ones** — 70 parents have gaps because an annex was
 *  removed, and reusing a number would duplicate a filed document.
 *  Annexes never nest: the parent of an annex is always a non-annex.
 *  See docs/features/11. */
export async function nextAnnexIdentifier(parentId: number): Promise<string>;
```

Two details the implementation must get right. It counts **soft-deleted** children,
so the query cannot reuse `annexesOf()`, which filters them. And it parses the
number with `parseIdentifier()` rather than a local regex, so the 61 suffix-less
2012 annexes resolve to `annex: 0` and do not break `max`.

### Guard against nesting

Creating an annex of an annex is not possible in fourteen years of data. The form
should refuse it — **"Nie można dodać aneksu do aneksu. Dodaj kolejny aneks do
umowy nadrzędnej."** — with a link to the parent. Cheaper than discovering later
that the numbering assumed two levels.

## Verification

```sql
-- 1. The real annex count, against plan.md's 10,167.
select coalesce(cs.kind::text, '(brak)') child_kind, count(*)
from "Contract" p
join "ContractStatus" ps on ps.id = p."statusId" and ps.kind = 'CONTRACT'
join "Contract" c on c."parentId" = p.id and not c."isDeleted"
left join "ContractStatus" cs on cs.id = c."statusId"
where not p."isDeleted" group by 1 order by 2 desc;
-- expected: PROJECT 6981 | CONTRACT 3038

-- 2. Suffix and relation agree.
select count(*) filter (where identifier ~ '/A[0-9]+$' and "parentId" is not null) both,
       count(*) filter (where identifier ~ '/A[0-9]+$' and "parentId" is null)     suffix_only,
       count(*) filter (where identifier !~ '/A[0-9]+$' and "parentId" is not null) parent_only
from "Contract" c join "ContractStatus" s on s.id = c."statusId"
where not c."isDeleted" and s.kind = 'CONTRACT';
-- expected: 2982 | 0 | 61      (the 61 are all 2012, typed "Aneks")

-- 3. Numbering: two digits, max 58, never nested.
select max((substring(identifier from '/A([0-9]+)$'))::int) max_annex, count(*)
from "Contract" where not "isDeleted" and identifier ~ '/A[0-9]+$';
-- expected: 58 | 3010

select count(*) from "Contract" c join "Contract" p on p.id = c."parentId"
where not c."isDeleted" and c.identifier ~ '/A[0-9]+$' and p.identifier ~ '/A[0-9]+$';
-- expected: 0 — annexes never nest

-- 4. Gaps, which force `max + 1`.
select count(*) from (
  select p.id
  from "Contract" p
  join "Contract" c on c."parentId" = p.id and not c."isDeleted"
                   and c.identifier ~ '/A[0-9]+$'
  where not p."isDeleted"
  group by 1
  having count(*) <> max((substring(c.identifier from '/A([0-9]+)$'))::int)) q;
-- expected: 70

-- 5. Type is not a reliable marker.
select dt.name, count(*) total, count(*) filter (where c.identifier ~ '/A[0-9]+$') with_suffix
from "Contract" c
join "ContractStatus" s on s.id = c."statusId" and s.kind = 'CONTRACT'
join "DocumentType" dt on dt.id = c."documentTypeId"
where not c."isDeleted" group by 1 order by 2 desc;
-- expected: Umowa 6466/27 | Aneks 2937/2808 | Zlecenie 827/19 | Porozumienie 294/127 | …

-- 6. Projects that are drafts of an annex.
select count(*) from "Contract" c join "ContractStatus" s on s.id = c."statusId"
where not c."isDeleted" and s.kind = 'PROJECT' and c.identifier ~ '/A[0-9]+$';
-- expected: 28
```

Manual checks:

- [ ] The Umowy list's "Aneks" column reads **3 038** in total, not 10 019 — check a
      contract that has both annexes and projects
- [ ] Open the contract with 58 annexes — they are listed **`/A01` … `/A58` in
      numeric order**, not string order, and collapse after ten
- [ ] Open one of the 70 gapped parents, add an annex — it takes `max + 1`, not
      `count + 1`, and does not collide with the deleted number
- [ ] An annex's preview links to its parent, prominently, near the identifier
- [ ] An annex lists its siblings
- [ ] One of the 61 suffix-less 2012 annexes still shows "Aneks do umowy" and appears
      in its parent's annex list
- [ ] "Dodaj aneks" pre-fills company, businessline, location, counterparty, domain,
      nature and owners, and leaves status, dates, amount and subject **empty**
- [ ] The generated identifier is visible before saving
- [ ] "Stwórz projekt aneksu" produces a PROJECT-module record with an `/A` suffix,
      matching the 28 that exist
- [ ] Adding an annex to an annex is refused, with a link to the parent
- [ ] Creating an annex with type "Porozumienie" is allowed
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Q51 — should an annex inherit its parent's dates and amount?** We leave them
   empty on the grounds that an amendment exists precisely to change them, and a
   pre-filled value silently becomes the answer when nobody edits it. The opposite
   argument is that most annexes change one thing. A legacy user knows which.
2. **Q52 — what happens to the parent when an annex takes effect?** Nothing in the
   schema links an annex's dates back to the contract's, so a contract can read
   "expires 2024-01-01" while its `/A03` extends it to 2027. With 3,038 annexes this
   is a real reporting hazard — the Umowy register's "Data zakończenia" may be stale
   on any amended contract. **Worth answering before anyone builds a report on end
   dates.**
3. **Q53 — should the annex numbering be per parent or per year?** Per parent, on the
   evidence: 1,400 contracts have exactly `/A01`. Recorded because "annex 3 of 2024"
   is also a plausible reading and would produce different numbers.
4. **Q39 carries over** — `plan.md`'s annex figure is wrong and says so in a document
   this spec set does not replace.

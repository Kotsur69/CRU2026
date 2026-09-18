---
id: 20
title: Kontrahenci
group: D-supporting
status: todo
depends-on: [05]
legacy-tables: [contractor, attachment]
prisma-models: [Contractor, Contract, Attachment]
routes: ["/kontrahenci", "/kontrahenci/[id]", "/kontrahenci/nowy", "/api/contractors"]
---

# 20 — Kontrahenci

## Why

3,580 counterparties, referenced by **every** record in the register — `contractorId`
is non-null on all 20,137 — and by 14,215 of them a second time as `debtorId`. It is
the one dictionary that users add to daily, and the one place a data-quality problem
propagates everywhere: a duplicated company means a contract filed under the wrong
party and a NIP search that finds half the documents.

There are already 177 duplicate NIPs.

The module is built read-only plus a create endpoint (`app/api/contractors/route.ts`).
What it lacks is edit, delete, restore, duplicate handling, the attachment list, and
any authorization at all — today **any signed-in user can write the shared
dictionary that the whole register depends on**.

## Legacy behaviour

### What the audit saw

`audyt §3.–8.`: **`access deny`** at `/cru/index.php/contractor`. The module was
never observed.

Indirect evidence only (`audyt §8`): *"słownik firm (widoczny pośrednio jako dropdown
`contractor` w Umowach/Projektach; tysiące pozycji, z NIP). Prawdopodobnie tu jest
CRUD kontrahentów."* The dropdown renders each entry with its NIP, which is how
`audyt §1.4` field 21 shows it on the preview: *"Hotel Lamberton Sp. z o.o. NIP:
1182274493"*.

So: a dictionary with thousands of entries, searched by name and by NIP, with CRUD
behind a role this account did not hold. Everything below is schema- and
data-derived.

## Data

### Totals

| Property | Value |
|---|---|
| Rows | **3,580** |
| Soft-deleted (`isDeleted`) | **86** |
| `shortName` | 3,575 |
| `fullName` | 3,568 |
| `address` | 3,476 |
| **`vatId` (NIP)** | **3,052** — 528 have none |
| `register` (KRS / registry) | 1,977 |
| `cruIdentifier` | 3,577 |
| **`isCeidg`** — sole traders | **341** |
| `isConnected` — related entity | 69 |
| `registeredAt` | **1,019** — 2,561 have no creation date |
| `registeredByLegacyId` | 3,579 |
| `modifiedAt` | 1,590 |
| **Never referenced by any record** | **208** |

### The NIP problem

| | Value |
|---|---|
| Rows with a NIP | 3,052 |
| **Distinct NIPs** | **2,875** |
| **Duplicated NIPs** | **177 values** |

Broken down:

| Rows sharing one NIP | NIP values |
|---|---|
| 2 | 137 |
| 3 | 17 |
| **4** | **2** |
| 1 (unique) | 2,719 |

So 177 tax numbers are attached to more than one counterparty row, two of them to
four rows each. Every one of those is the same legal entity entered more than once
— and contracts are distributed across the copies.

This is the single most consequential data-quality fact in the module. A NIP search
on the Umowy register (`umowy/page.tsx:80`) matches `contractor.vatId`, so it finds
all the copies; but a user who picks a counterparty from the autocomplete picks one
copy, and the record's party is then that copy alone.

### Sole traders

341 rows are flagged `isCeidg` — a *jednoosobowa działalność gospodarcza*, registered
in CEIDG rather than the KRS. They have a NIP but no KRS number, which is why
`register` is filled on only 1,977 of 3,580.

### Contractor-level attachments

48 attachments hang off a `Contractor` rather than a contract (spec 18), mostly
named `RP_<number>_<date>.pdf` — the filename pattern of an *odpis z rejestru
przedsiębiorców*, a registry extract. Two are 2015 test rows on "TEST MARCN"
(contractor 1200).

So the feature is real and narrow: proof of who the counterparty is, filed against
the counterparty.

## Legacy quirks

### Quirk: any signed-in user can write the shared dictionary

- **Current:** `app/api/contractors/route.ts` creates a counterparty for anyone with
  a session. There is no admin check, no role check, no rate limit.
- **Why it matters:** this dictionary is referenced by all 20,137 records. An
  accidental or careless insert adds a duplicate that will be picked by someone
  else's autocomplete tomorrow, and there are already 177 duplicated NIPs without
  anybody trying.
- **We do:** creating stays open — a user registering a contract must be able to add
  a counterparty that is not there yet, and forcing an admin round-trip would be
  worse. But **editing and deleting require admin**, and creating gets the duplicate
  check below plus the record of who did it (`registeredByLegacyId` already exists).
- **Sign-off:** not needed for the edit/delete gate. See Q57 on whether creation
  should be restricted too.

### Quirk: a NIP collision silently returns the existing row

- **Current:** `POST /api/contractors` responds with the existing counterparty when
  the NIP already exists, rather than creating a second one.
- **Why that is half right:** it prevents *new* duplicates, which is why 177 is not
  1,770. But it is silent — the user typed a different name, got back a different
  company, and has no idea. If the NIP was mistyped they have just attached their
  contract to an unrelated firm.
- **We do:** keep refusing the insert, and **say so**: return the match and have the
  form show *"Kontrahent o tym NIP już istnieje: {nazwa}. Użyć go?"* with an explicit
  confirm. Never substitute silently.
- **Sign-off:** not needed.

### Quirk: 177 NIPs are on more than one row

- **Data:** 137 doubled, 17 tripled, 2 quadrupled.
- **Why it matters:** contracts for one legal entity are split across rows, so
  "all contracts with X" is wrong on any of them.
- **We do:** **do not merge automatically.** Merging counterparties reassigns
  contracts, and getting it wrong is unrecoverable. Instead:
  1. surface it — a `Badge tone="warning"` **"duplikat NIP (N)"** on the detail page,
     linking to the other rows;
  2. add a `/kontrahenci?duplikaty=1` filter listing all 177 groups;
  3. build an admin-only **merge** action that moves `contractId`/`debtorId`
     references and soft-deletes the loser, with a confirm naming the exact counts.
  Whether to run it is the legal department's call (Q58).
- **Sign-off:** **yes**, for the merge action. Surfacing needs none.

### Quirk: 528 counterparties have no NIP

- **Data:** 3,052 of 3,580 have one.
- **`[INFERRED]`:** foreign entities (no Polish NIP), natural persons, and the oldest
  2012-era rows entered before the field was required.
- **We do:** do not make NIP mandatory on the form. Warn when it is empty —
  *"Brak NIP — kontrahent nie będzie wyszukiwalny po numerze."* — and allow the save.
  A blocked save on a foreign counterparty is worse than a missing NIP.
- **Sign-off:** not needed.

### Quirk: 2,561 rows have no `registeredAt`

- **Data:** 1,019 of 3,580 have a creation date; `registeredByLegacyId` is set on
  3,579.
- **So:** legacy recorded *who* created almost every counterparty and *when* for
  fewer than a third. Like `Attachment.addedAt` (spec 18), the missing dates are
  unrecoverable.
- **We do:** render "(nieznana)" rather than a fabricated date, and never sort the
  list by it.
- **Sign-off:** not needed.

### Quirk: 208 counterparties are referenced by nothing

- **Data:** 208 rows are neither a `contractorId` nor a `debtorId` on any record.
- **`[INFERRED]`:** created during a contract that was then abandoned, or duplicates
  whose contracts were moved.
- **We do:** nothing automatic. Offer `/kontrahenci?nieuzywane=1` so an admin can
  review them, and leave them in the autocomplete — an unused counterparty today is
  a used one tomorrow.
- **Sign-off:** not needed.

### Quirk: `registeredByLegacyId` is a loose integer, not a relation

- **Current:** `Contractor.registeredByLegacyId Int?` and `modifiedByLegacyId Int?`
  are plain columns, so the detail page cannot name the person without a manual
  lookup.
- **We do:** spec 01 makes them real relations to `User`. Until then the detail page
  shows the raw id, which with 451 placeholder users (spec 04) is no worse than the
  login would be.
- **Sign-off:** not needed. Owned by spec 01.

## UI

### /kontrahenci

The register-page recipe (spec 05). This module already uses `FilterBar` and
`Pagination`, so it changes least.

Filters: **Nazwa** (matches `shortName` and `fullName`), **NIP**, **KRS**,
**Miejscowość**, and three checkboxes — **"tylko CEIDG"** (341),
**"pokaż usunięte"** (86), **"tylko duplikaty NIP"** (177 groups).

Columns: Nazwa skrócona · Nazwa pełna · NIP · KRS · Adres · Umowy (count) ·
Załączniki (count). Default page size 50 — 3,580 rows.

The duplicate badge appears in the NIP cell, not in a column of its own.

### /kontrahenci/[id]

| Section | Content |
|---|---|
| Dane | Nazwa skrócona, Nazwa pełna, NIP, KRS/rejestr, Adres, CEIDG, Podmiot powiązany |
| **Duplikaty** | Only when the NIP is shared — the other rows, with their contract counts |
| Umowy | Records where this is the counterparty, paginated |
| Zobowiązania | Records where this is the **debtor** — a separate list (spec 08) |
| **Dokumenty rejestrowe** | The attachment list from spec 18 |
| Audyt | Zarejestrowano / zmodyfikowano, "(nieznana)" where the date is missing |

Actions, admin only: Edytuj · Usuń (soft) · Przywróć · **Scal z innym** (Q58).

### The form

| Field | Control | Validation |
|---|---|---|
| Nazwa skrócona | text | required, ≤ 190 |
| Nazwa pełna | text | ≤ 500 |
| NIP | text | 10 digits after stripping separators; **warn** if empty; **confirm** on collision |
| KRS / rejestr | text | ≤ 190 |
| Adres | textarea | ≤ 500 |
| CEIDG | checkbox | |
| Podmiot powiązany | checkbox | |

NIP normalisation: strip spaces and hyphens before storing and before comparing, so
`123-456-78-90` and `1234567890` are the same number. The 177 existing duplicates
should be re-checked after normalising — some may be formatting differences rather
than true duplicates (Q58).

### Autocomplete

`/api/contractors` serves the picker in the contract form. Two changes: return the
NIP alongside the name, so the picker shows what `audyt §1.4` shows; and rank exact
NIP matches first, because a user pasting a NIP wants that company and nothing else.

## Implementation

| Path | Action | Note |
|---|---|---|
| `app/(app)/kontrahenci/page.tsx` | modify | Three new filters, duplicate badge, page size 50 |
| `app/(app)/kontrahenci/[id]/page.tsx` | modify | Duplicates, debtor list, attachments, actions |
| `app/(app)/kontrahenci/nowy/page.tsx` | create | The form |
| `features/kontrahenci/actions.ts` | create | `createContractor`, `updateContractor`, `deleteContractor`, `restoreContractor`, `mergeContractors` |
| `app/api/contractors/route.ts` | modify | Return the NIP; explicit collision response; rank NIP matches |
| `lib/contractors.ts` | create | `normaliseVatId`, `duplicateGroups()`, `contractorLabel` with NIP |

### Authorization

| Operation | Rule |
|---|---|
| List, detail, autocomplete | any signed-in user |
| Create | any signed-in user, with the collision confirm |
| Edit, soft-delete, restore | **admin** |
| Merge | **admin**, with a confirm naming the record counts moved |

### Merge

```ts
/** Moves every `contractId` and `debtorId` reference from `loserId` to `winnerId`,
 *  moves contractor-level attachments, then soft-deletes the loser.
 *  Never hard-deletes: the losing row's id appears in 14 years of history.
 *  See docs/features/20, Q58. */
export async function mergeContractors(
  winnerId: number, loserId: number,
): Promise<{ contracts: number; debts: number; attachments: number }>;
```

One `$transaction`, and a `ContractHistory` row per contract touched
(`columnName = 'contractor_id'`), because a change of counterparty on a legal
record must be visible in the record's own log.

## Verification

```sql
-- 1. Baseline.
select count(*) total, count(*) filter (where "isDeleted") deleted,
       count("vatId") with_nip, count(register) with_krs,
       count(*) filter (where "isCeidg") ceidg, count("registeredAt") with_date
from "Contractor";
-- expected: 3580 | 86 | 3052 | 1977 | 341 | 1019

-- 2. Duplicate NIPs — the headline problem.
select cnt, count(*) nip_values from (
  select "vatId", count(*) cnt from "Contractor" where "vatId" is not null group by 1) q
group by 1 order by 1 desc;
-- expected: 4→2, 3→17, 2→137, 1→2719   (177 duplicated values, 2875 distinct)

-- 3. After normalising separators — are some of the 177 just formatting?
select count(distinct regexp_replace("vatId", '[^0-9]', '', 'g'))
from "Contractor" where "vatId" is not null;
-- if this is < 2875, some duplicates are real that currently look distinct;
-- if the duplicate count falls, some "duplicates" are formatting only

-- 4. Referenced by nothing.
select count(*) from "Contractor" k
where not exists (select 1 from "Contract" c
                  where c."contractorId" = k.id or c."debtorId" = k.id);
-- expected: 208

-- 5. Usage.
select (select count(distinct "contractorId") from "Contract") as as_party,
       (select count(distinct "debtorId")     from "Contract") as as_debtor;
-- expected: 3244 | 308

-- 6. Contractor-level attachments.
select count(*) from "Attachment" where "contractorId" is not null;
-- expected: 48
```

Manual checks:

- [ ] `/kontrahenci` lists 3 580 (3 494 without the deleted), 50 per page
- [ ] "tylko duplikaty NIP" returns the 177 groups
- [ ] A counterparty with a shared NIP shows the warning badge and links to its twins
- [ ] Creating one with an existing NIP shows the confirm and never substitutes
      silently
- [ ] Creating one with **no** NIP warns and saves
- [ ] `123-456-78-90` and `1234567890` are treated as the same number
- [ ] A non-admin cannot edit, delete or merge — the buttons are absent and the
      actions reject
- [ ] Soft-delete hides the row from the autocomplete but keeps it on its contracts
- [ ] Restore brings it back
- [ ] Merging two rows moves the contract and debtor references, moves the
      attachments, soft-deletes the loser, and writes a history row per contract
- [ ] The detail page lists contracts and debts separately
- [ ] "Dokumenty rejestrowe" shows the registry extracts (spec 18)
- [ ] A counterparty with no `registeredAt` shows "(nieznana)", not a made-up date
- [ ] The contract form's picker shows the NIP and ranks an exact NIP match first
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Q57 — may any user create a counterparty?** Today yes, with no check at all.
   Proposal: keep it open (with the collision confirm) because the alternative
   blocks contract registration, and gate only edit, delete and merge behind admin.
2. **Q58 — merge the 177 duplicate-NIP groups?** Each is one legal entity entered
   two to four times, with contracts split between the copies. Merging is the right
   outcome and it reassigns records, so it needs the legal department's sign-off and
   a reviewed list. Run the normalisation query first — some may be formatting only.
3. **Q59 — is REGON/GUS lookup wanted on this form?** Spec 30 plans it. It would
   prevent most future duplicates by resolving a NIP to a canonical name before the
   row is created, which makes it worth more than its "nice to have" billing.
4. **Q42 carries over** — a screenshot of the legacy `/contractor` screen would
   replace every inference in this spec.

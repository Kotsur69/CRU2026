---
id: 20
title: Kontrahenci
group: D-supporting
status: in-progress
depends-on: [05]
legacy-tables: [contractor, attachment]
prisma-models: [Contractor, Contract, Attachment]
routes: ["/kontrahenci", "/kontrahenci/[id]", "/kontrahenci/nowy", "/api/contractors"]
---

# 20 — Kontrahenci

> **Where we stand (2026-09-24): in progress (interrupted).** Everything except merging duplicates is built.
>
> - **Done:**
>   - `/kontrahenci` with the spec's filters plus "duplikaty" and "nieużywane", and a "duplikat NIP (N)" badge;
>   - `/kontrahenci/[id]` with Dane, Duplikaty, paginated Umowy and Zobowiązania, Dokumenty rejestrowe and Audyt;
>   - create and edit through one form (`/kontrahenci/nowy`, `/kontrahenci/[id]/edycja`);
>   - NIP normalisation, and a duplicate check that never silently reuses a live NIP;
>   - edit, delete and restore for admins only. Q57 is taken at its proposal: anyone signed in can create.
> - **Not done:**
>   - the merge action for duplicate-NIP groups;
>   - the REGON/GUS lookup (spec 30);
>   - "Dokumenty rejestrowe" does not use spec 18's shared `AttachmentList` yet;
>   - the forms were not clicked through in a browser after the final rebase.
> - **Waiting on:** **Q58**. Merging the 177 duplicate-NIP groups reassigns contracts and needs legal sign-off. Q59 is recorded.
> - **Next step:** a browser check of create, edit, delete and restore on the merged branch, then switch "Dokumenty rejestrowe" to `AttachmentList`. Details are in "Implementation notes" at the end.

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

## Implementation notes (2026-09-24)

Verified on the synthetic fixture plus a few added rows (a formatted-NIP twin, a
deleted `PL…` twin, a foreign VAT number, a row without NIP, two contractor-level
attachments). The real-data counts in Verification (3 580 / 177 / 208 / 48) still
need a run against `cru2026` once `cru.sql` is at hand.

### Done

- **`/kontrahenci`** on the spec 05 recipe: filters Nazwa (short or full), NIP, KRS,
  Miejscowość (searches `address` — there is no city column) and the checkboxes
  "tylko CEIDG", "pokaż usunięte", "tylko duplikaty NIP" (`?duplikaty=1`) and
  "tylko nieużywane" (`?nieuzywane=1`: neither party nor debtor on any record,
  deleted records included). Columns as specified; CEIDG / powiązany / usunięty are
  badges under the name; "duplikat NIP (N)" sits in the NIP cell. Page size 50, never
  sorted by `registeredAt`. The duplicates view keeps each group together (ordered by
  NIP) and shows the number of groups next to "Znaleziono". The old "Identyfikator
  CRU", "Podmiot powiązany" and "Tylko z umowami" filters were dropped — they are not
  in the spec's list; the CRU identifier moved to the Audyt section.
- **NIP normalisation** (`lib/contractors.ts`): separators and a `PL` prefix are
  stripped before storing and comparing; the database side compares digits
  (`regexp_replace(…, '[^0-9]', '')`, as Verification query 3), so `123-456-78-90`
  and `1234567890` are one number in the filter, the autocomplete, the collision
  check and the duplicate groups (`lib/contractors-db.ts`). Groups count deleted rows
  too — contracts hang on them, and the 177 figure was measured that way.
- **`/kontrahenci/[id]`**: Dane · Duplikaty (only when the NIP is shared: the other
  rows with contract and debt counts; the warning badge links to it) · Umowy and
  Zobowiązania as two separate lists, paginated independently (`?umowy=`,
  `?zobowiazania=`), across all three registers with a "Rejestr" column and
  module-correct links · Dokumenty rejestrowe (`isFinal DESC, id ASC`) · Audyt with
  "(nieznana)" for a missing date and the login from spec 01's `registeredBy` /
  `modifiedBy`. Counts exclude soft-deleted and `LEGACY_2021` records.
- **`/kontrahenci/nowy`** and **`/kontrahenci/[id]/edycja`** share one form: limits
  190/500/190/500, NIP 10 digits after normalisation, the empty-NIP warning (the save
  is allowed), and never a silent substitution — create refuses a NIP held by a live
  row and asks "Kontrahent o tym NIP już istnieje: {nazwa}. Użyć go?"; an admin edit
  that moves the NIP onto another live row needs "Tak — zapisz mimo to". An unchanged
  legacy value that is not a 10-digit NIP (a foreign VAT number) is kept as it is, so
  fixing an address does not force deleting the number.
- **Authorization (Q57, as proposed):** create is open to any signed-in user; edit,
  soft-delete and restore use `requireAdmin()` (404 for anyone else) in the actions and
  on the edit page, and the buttons are rendered for admins only. Checked over HTTP: a
  non-admin's crafted delete/restore action gets 404 and the row is untouched; the
  admin's goes through.
- **`/api/contractors`**: GET keeps `all=1`, matches the NIP by digits and puts an
  exact 10-digit match first; POST validates with the shared schema (over-long input is
  rejected, no longer truncated) and answers a live collision with **409** and the
  existing row. The contract form's "dodaj" handles the 409 with the same question and
  "Tak — użyj go", warns on an empty NIP, and the pickers show "NIP: …" as the legacy
  preview does. A per-NIP advisory lock closes the race between the collision check
  and the insert — a unique index is impossible while duplicates exist.
- Shared additions, backward compatible: `Pagination` takes `param` and `anchor` (two
  lists on one page); `REGISTER_LABEL` in `lib/contracts/modules.ts` replaces the
  contract preview's private copy; the preview uses `contractorLabelWithNip`.
- Tests: `lib/contractors.test.ts` (normalisation, validation, schema, labels).
  `tsc`, `yarn test` and `next build` pass; smoke run as `admin` and `jkowalski`.

### Not done

- **Browser check of the forms.** The create/edit forms, the collision question and
  the picker's 409 path are built and type-checked, and their server side was
  exercised over HTTP, but they were not clicked through in a browser.
- The registry-extract list is local to the page. Spec 18's shared
  `components/ui/attachment-list.tsx` (size, empty-file badge) landed on the
  integration branch while this was built and is not mounted here yet.
- The register NIP filters (`/umowy`, `/projekty`, `/ryzyko`) still compare the raw
  column; they could reuse `idsWithNipFragment` so formatted NIPs match there too.

### Blocked

- **Merge — "Scal z innym" and `mergeContractors` (Q58).** Not built: it reassigns
  contracts and debts between counterparties and needs the legal department's
  sign-off and a reviewed list. `?duplikaty=1` is that list, read-only.
- **REGON/GUS lookup (Q59)** — spec 30, outside this build.
- **Real-data verification** — needs `cru.sql` loaded into `cru2026`.

### Next steps

1. Load the dump and run Verification queries 1–6; compare the group count on
   `?duplikaty=1` with query 2 (raw) and query 3 (normalised) — the difference is the
   formatting-only duplicates Q58 asks about.
2. Click through `/kontrahenci/nowy`, an admin edit with a colliding NIP, and the
   contract form's "dodaj" with an existing NIP.
3. After Q58 sign-off: `mergeContractors(winnerId, loserId)` in one `$transaction`
   (move `contractorId` / `debtorId` and the attachments, soft-delete the loser, one
   `ContractHistory` row per contract with `columnName = 'contractor_id'`), admin only,
   behind a confirm naming the counts.
4. Swap "Dokumenty rejestrowe" for spec 18's shared `attachment-list.tsx`.

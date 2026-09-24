---
id: 30
title: Wyszukiwanie w REGON / GUS
group: E-planned
status: todo
depends-on: [20]
legacy-tables: [contractor]
prisma-models: [Contractor]
routes: ["/kontrahenci/nowy", "/api/gus/lookup"]
---

# 30 — Wyszukiwanie w REGON / GUS

> **Where we stand (2026-09-24): not started.** Nothing in this spec is built yet.
>
> - **Depends on:** spec 20 (Kontrahenci).
> - **Waiting on:** **Q59**: is a REGON/GUS lookup wanted, and when?
> - **Can start now:** the NIP/REGON checksum validation, which the spec wants regardless.
> - **Next step:** after spec 20 and Q59.

## Why

Spec 20 documents the problem this feature solves: **177 NIP numbers are attached
to more than one counterparty row** — 137 doubled, 17 tripled, 2 quadrupled. Each
one is a single legal entity typed in more than once, with contracts split between
the copies, so "all contracts with X" is wrong on any of them.

They exist because a counterparty is created by typing a name. Two people type
`ArcelorMittal Poland S.A.` and `Arcelormittal Poland SA` and the register has two
companies.

A REGON lookup removes the typing. The user enters a NIP, the GUS registry returns
the canonical name, address and REGON, and the row is created from authoritative
data. It does not fix the existing 177 — that is spec 20's merge action and Q58 —
but it stops the count growing.

`plan.md:90` lists it among the things explicitly deferred, with the note that
*"żadna z tych rzeczy nie jest już blokowana architekturą — to kwestia priorytetu,
nie wykonalności"*. This spec argues the priority is higher than "nice to have",
because it is the only preventive fix for the register's worst data-quality issue.

## What GUS provides

**BIR1** — *Baza Internetowa REGON*, the Polish statistical office's public SOAP
API. Free, requires a registered API key, and it is the canonical source for
Polish company data.

| Lookup by | Returns |
|---|---|
| NIP | REGON, name, address, legal form, status |
| REGON | The same |
| KRS | The same |

The fields map cleanly onto `Contractor`:

| GUS | `Contractor` | Spec 20 fill rate |
|---|---|---|
| `nip` | `vatId` | 3,052 of 3,580 |
| `regon` | **no column — new** | — |
| `nazwa` | `fullName` | 3,568 |
| `ulica`, `nrNieruchomosci`, `kodPocztowy`, `miejscowosc` | `address` | 3,476 |
| `krs` | `register` | 1,977 |
| *silosID* — 1/2/3/4/6 | `isCeidg` | **341 flagged today** |

That last row is worth noting: GUS distinguishes a CEIDG sole trader from a KRS
company by its *silo* identifier, which is exactly the distinction
`Contractor.isCeidg` already encodes on 341 rows. The flag stops being something a
user ticks and becomes something the registry states.

`regon` has no column today and should get one — it is the registry's own primary
key and the most stable identifier a Polish entity has.

## Design

### A search box, not an autofill

The user types a NIP and presses **"Pobierz z GUS"**. The result is shown for
confirmation — name, address, REGON, status — and only then fills the form.

Never silently overwrite what somebody typed. Two reasons: GUS returns the
*registered* name, which is sometimes not the name the contract uses, and a
transposed NIP digit returns a real, wrong company. A confirmation step makes that
visible; an autofill hides it.

### The duplicate check comes first

Order matters, and it is the point of the feature:

1. User enters a NIP.
2. **Check our own database.** If a counterparty already has that NIP, show it and
   offer to use it — spec 20's collision confirm, reached before GUS is called.
3. Only if there is no local match, call GUS.
4. Show the result, let the user confirm, create the row.

Step 2 is where the 177 duplicates stop growing. Step 3 is where the data quality
comes from. Doing them in the other order would call an external service to create
a duplicate.

### Caching

GUS rate-limits and is occasionally slow. Cache a successful lookup by NIP for
30 days in a small table — a company's registered name changes rarely, and a
second lookup of the same NIP during one editing session should not leave the
building.

### Failure

The registry being down must never block creating a counterparty. If the lookup
fails, say so — *"Nie udało się pobrać danych z GUS. Wprowadź dane ręcznie."* — and
leave the manual form exactly as it is today. This is an assist, not a gate.

## Validation worth having regardless

The NIP checksum is computable offline, needs no API key, and catches a transposed
digit before anything else happens:

```ts
/** Polish NIP: 10 digits, weighted checksum over the first nine.
 *  Weights 6,5,7,2,3,4,5,6,7; sum mod 11 must equal the tenth digit
 *  (and a remainder of 10 means the number is invalid). */
export function isValidNip(nip: string): boolean;
```

**Worth shipping on its own**, before any GUS integration. Spec 20 recommends
normalising separators; validating the checksum at the same time costs ten lines
and would have prevented an unknown share of the 177.

Run it over the existing 3,052 NIPs first — it is one query's worth of work and it
says how much of the duplication is actually mistyping (Q96).

## Implementation

| Path | Action | Note |
|---|---|---|
| `lib/nip.ts` | create | `isValidNip`, `normaliseVatId` — **no dependencies, ship first** |
| `lib/gus/client.ts` | create | BIR1 SOAP, session key handling, 30-day cache |
| `app/api/gus/lookup/route.ts` | create | `?nip=` → local match, or GUS, or an error |
| `features/kontrahenci/gus-lookup.tsx` | create | The box, the result card, the confirm |
| `app/(app)/kontrahenci/nowy/page.tsx` | modify | Mount it above the form |
| `prisma/schema.prisma` | modify | `Contractor.regon String?`, `GusCache` |

BIR1 is SOAP, which is unpleasant from TypeScript. Either a thin hand-rolled client
over `fetch` with XML templates — the API surface needed here is three calls — or
a SOAP library. Recommend hand-rolling: three calls, no dependency, and the XML is
stable.

### Authorization and secrets

The lookup route requires a session — it is an outbound call on the company's API
key and must not be open. The key lives in `.env` as `GUS_API_KEY`, never in code
and never in a client bundle, and the call is made server-side only.

Rate-limit per user: a handful of lookups a minute is generous for a form and
prevents the key being used as a free proxy to GUS.

## Verification

```sql
-- 1. The problem, restated. Every one of these is one entity typed twice.
select cnt, count(*) nip_values from (
  select "vatId", count(*) cnt from "Contractor" where "vatId" is not null group by 1) q
group by 1 order by 1 desc;
-- expected: 4→2, 3→17, 2→137, 1→2719   → 177 duplicated values

-- 2. How many are formatting rather than real duplicates.
select count(distinct "vatId")                                     as raw,
       count(distinct regexp_replace("vatId", '[^0-9]', '', 'g'))  as normalised
from "Contractor" where "vatId" is not null;
-- expected raw: 2875. If normalised < 2875, some "distinct" NIPs are the same number

-- 3. What a lookup would fill in.
select count(*) total, count("vatId") nip, count("fullName") name_,
       count(address) addr, count(register) krs,
       count(*) filter (where "isCeidg") ceidg
from "Contractor";
-- expected: 3580 | 3052 | 3568 | 3476 | 1977 | 341
-- `regon` does not exist yet

-- 4. Checksum audit — run once `isValidNip` exists.
-- Counts how many stored NIPs fail the check. Every failure is either a foreign
-- number, a typo, or a duplicate waiting to happen.
```

Manual checks:

- [ ] `isValidNip` accepts a known-good NIP and rejects it with two digits swapped
- [ ] It accepts `123-456-78-90` and `123 456 78 90` as the same number
- [ ] Entering a NIP that **already exists** shows the existing counterparty and
      does **not** call GUS
- [ ] Entering a new, valid NIP returns name, address, REGON and the CEIDG flag
- [ ] Nothing is written until the user confirms
- [ ] Confirming creates a counterparty whose name matches the registry exactly
- [ ] A sole trader comes back with `isCeidg` set, without the user ticking it
- [ ] With GUS unreachable, the message appears and the manual form still works
- [ ] A second lookup of the same NIP within 30 days is served from cache
- [ ] `GUS_API_KEY` appears in no client bundle — check the built output
- [ ] An unauthenticated request to `/api/gus/lookup` is rejected
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Q59 carries over — is this wanted, and when?** `plan.md` defers it. The
   argument for pulling it forward is that it is the only *preventive* fix for the
   177 duplicate NIPs; spec 20's merge is the corrective one and needs sign-off
   (Q58). Doing the corrective fix without the preventive one means doing it again.
2. **Q96 — how many of the 177 are mistyped rather than merely duplicated?** The
   normalisation and checksum queries above answer it in minutes and would sharpen
   both this spec and Q58.
3. **Q97 — does the company already hold a GUS BIR1 key?** It is free and requires
   registration. If another internal system uses one, reuse beats applying.
4. **Q98 — should existing counterparties be enriched?** 3,052 NIPs could be looked
   up in a batch to fill `regon`, correct names and confirm the CEIDG flag. That is
   3,052 external calls and a bulk change to a shared dictionary — attractive, and
   it needs the same sign-off as Q58. Recommend doing it only after the merge.

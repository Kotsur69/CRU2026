---
id: 14
title: Notatki (notes)
group: C-missing-subsystems
status: todo
depends-on: []
legacy-tables: [remarks]
prisma-models: [Remark]
routes: ["/umowy/[id]", "/umowy/[id]/pytanie"]
---

# 14 — Notatki (notes)

## Why

50,737 notes across 15,522 contracts — **three quarters of the register has at
least one**. Judged by volume this is the most-used write function in the whole
legacy system, more used than editing the contract itself.

Today notes are read-only: the preview lists them (`contract-preview.tsx:300-306`)
and there is no way to add one except through the "zadaj pytanie" screen, which is a
different affordance with different semantics. Legacy's note box sits directly on the
record with a "dodaj notatkę" button.

## Legacy behaviour

Notes live in an iframe on the contract preview: `/remarks/index/{id}`
(`audyt §1.4`). Inside it:

- a **"dodaj notatkę"** button;
- the empty state **"Brak uwag"**;
- the thread itself, newest first `[INFERRED]` — the audit saw only an empty one.

The Projekty list carries an **"Ostatnia notatka"** column (`audyt §2.4`), so the
most recent note is part of how a project is scanned in the register.

A separate **"zadaj pytanie"** button exists on the preview. Where the question goes
is `[UNKNOWN]` (`audyt §11.5`) — e-mail or an internal thread. Our implementation
writes a `Remark` plus a `Shoutbox` notification (`actions.ts:469-500`), which is
consistent with the schema but not verified against legacy.

### The iframe title problem

The remarks iframe renders with the page title **"System Zarządzania Ofertami"**
(`audyt §1.4`), not "CRU". Combined with spec 04's finding that CRU is
`system_id = 7` inside a shared `am_admin` directory, this suggests the notes module
is shared with a separate quotation system. If it is, notes may be visible to users
of that other system, and `remarks.contract_id` may not be unique to CRU contracts.

Our data does not show contamination — all 50,737 rows resolve to a CRU contract —
but the question stands (Q14).

### Data

| Property | Value |
|---|---|
| Rows | 50,737 |
| With `contractId` | 50,737 (all) |
| With `userId` | 50,737 (all) |
| With a non-empty `body` | 50,719 — **18 rows have no body** |
| Longest body | 1,400 characters |
| Average body | 68 characters |
| Date range | 2015-01-13 → 2026-09-18 |
| Soft-deleted (`active = false`) | **0** |
| Contracts with at least one note | 15,522 of 20,626 |
| Most notes on one contract | 60 |

Two things follow. Notes are **short** — 68 characters on average, so this is a
running commentary, not a document store; the UI should be a compact thread, not a
list of cards. And **`active` has never been used**: the soft-delete capability
exists in the schema and no note has ever been retracted in eleven years.

`Remark.shoutboxEntries` — a note can be the subject of a notification. 1,184
`Shoutbox` rows reference 1,184 notes, so roughly 2% of notes generated an alert.
That relationship is spec 15's subject.

## Legacy quirks

### Quirk: 18 notes have no body

- **Data:** 50,737 rows, 50,719 non-null bodies.
- **Why it matters:** a note with no text renders as an empty bubble with a date and
  an author. Legacy presumably allowed an empty submit.
- **We do:** render them as "(pusta notatka)" so the row is not mistaken for a
  rendering fault, and reject empty submissions going forward.
  `actions.ts:473-474` already rejects an empty body on the question path.
- **Sign-off:** not needed.

### Quirk: `active` exists and was never used

- **Legacy:** `remarks.active int(1) DEFAULT '1'`, zero rows set to 0.
- **Why it matters:** we could drop it, but soft delete on a note is the right
  behaviour for a legal register — a retracted note should be recoverable.
- **We do:** keep the column, implement delete as a soft delete, and filter
  `active: true` in every read. Since no legacy row is inactive, this changes nothing
  for imported data.
- **Sign-off:** not needed.

### Quirk: "zadaj pytanie" has no record-level permission check

- **Current:** `askQuestion` (`actions.ts:469`) calls `requireActor()` and nothing
  else. Any authenticated user can write a note onto any contract and fan out
  notifications for it. `canAskQuestion` (`lib/authz.ts:60`) exists and is never
  called.
- **Why it is wrong:** after spec 03 a user may not even be able to *see* the
  contract they are posting on.
- **We do:** gate on `canReadContract` — asking is not editing, so read access is the
  right bar, which is also why legacy puts the button in the read-only preview. Then
  actually call `canAskQuestion`, or delete it as dead code.
- **Sign-off:** not needed.

## UI

### Where notes appear

| Surface | Behaviour |
|---|---|
| Contract / project / risk detail | The thread, plus "dodaj notatkę" |
| `/…/[id]/pytanie` | Existing question screen; stays, thread capped at 30 (`question-page.tsx:19`) |
| Projekty register | "Ostatnia notatka" column (already present, `projects-table.tsx`) |
| Umowy register | Optional column, off by default (the chooser in `lib/umowy-columns.ts`) |

### Screen: the note thread

Section title "Notatki", inside the shared `Section` from spec 05.

- Newest first.
- Each entry: author (`userLabel`), timestamp (`formatDateTime`), body with
  `whitespace-pre-line`.
- The current user's own notes are visually distinguished — legacy's `shoutboxview`
  passes `myid` for exactly this purpose (`cru.sql:447516`), so the distinction is
  legacy's idea, not ours.
- Collapse beyond 10 entries with a "pokaż wszystkie (N)" expander. Only 1 contract
  has 60 notes, but 14 have 28 or more.
- Empty state: **"Brak uwag"** — legacy's exact wording.

### Adding a note

An inline textarea under the thread with a "dodaj notatkę" button, submitted by a
server action. No modal — legacy uses an inline iframe and the interaction is
high-frequency.

- `maxLength` 4000 on the client, matching the existing question form; enforce the
  same limit server-side, which `askQuestion` currently does not do.
- Optimistic append is not needed; `revalidatePath` on the detail route is enough.

### Deleting a note

Soft delete, author or admin only, with a confirm. Deleted notes vanish from the
thread. No edit — legacy has none, and an editable audit trail in a legal register is
worse than an immutable one.

## Implementation

### Files

| Path | Action | Note |
|---|---|---|
| `features/kontrakty/notes-thread.tsx` | create | Server component thread + client composer |
| `features/kontrakty/actions.ts` | modify | Add `addNote`, `deleteNote`; fix `askQuestion`'s authz |
| `features/kontrakty/contract-preview.tsx` | modify | Replace the read-only list with the thread |
| `features/kontrakty/question-page.tsx` | modify | Reuse the thread component |
| `lib/authz.ts` | modify | Call `canAskQuestion`, or remove it |

### Server actions

| Action | Signature | Authorization | Validation | Writes |
|---|---|---|---|---|
| `addNote` | `(_state, formData) => Promise<State>` | `requireActor` + `canReadContract` | contract id integer, record exists and not deleted, body 1–4000 chars after trim | `Remark.create`, then the notification fan-out from spec 15 |
| `deleteNote` | `(formData) => Promise<void>` | `requireActor` + (author or `isAdmin`) | note id integer | `Remark.update {active:false}` |

Both follow the shape of the existing actions in `features/kontrakty/actions.ts` —
`requireActor()` first, `$transaction` where more than one table is touched,
`revalidatePath`, and the `{errors, values}` state object that `useFormState` expects.

### Interaction with notifications

Adding a note is what creates a `Shoutbox` entry in legacy. This spec creates the
note; spec 15 owns who gets told. Build the note path first with the existing
fan-out from `askQuestion` (`actions.ts:494-500`), then let spec 15 replace the
recipient selection.

## Verification

```sql
-- 1. Baseline. Must be unchanged by a read-only deployment.
select count(*), count("contractId"), count("userId"), count(body),
       max(length(body)), round(avg(length(body))),
       min("createdAt")::date, max("createdAt")::date,
       count(*) filter (where not active)
from "Remark";
-- expected: 50737 | 50737 | 50737 | 50719 | 1400 | 68 | 2015-01-13 | <today> | 0

-- 2. Coverage — how many records show a thread at all.
select count(distinct "contractId") from "Remark";
-- expected: 15522

-- 3. Thread depth, for the collapse threshold.
select cnt, count(*) from (
  select "contractId", count(*) cnt from "Remark" group by 1
) g group by 1 order by 1 desc limit 10;
-- expected top: 60×1, 39×1, 38×3, 36×2, 31×4, 28×3

-- 4. Every note resolves to a contract and a user.
select count(*) from "Remark" r
left join "Contract" c on c.id = r."contractId"
left join "User" u on u.id = r."userId"
where c.id is null or u.id is null;
-- expected: 0

-- 5. Notes that carry a notification (spec 15's input).
select count(distinct "remarkId") from "Shoutbox" where "remarkId" is not null;
-- expected: 1184
```

Manual checks:

- [ ] Open the 60-note contract from query 3 — thread collapses at 10 with a working
      expander
- [ ] Add a note — it appears immediately, with the right author and timestamp, and
      the register's "Ostatnia notatka" column updates
- [ ] Submit an empty note — rejected with a message, no row written
- [ ] Submit 4001 characters — rejected server-side, not only in the browser
- [ ] Delete your own note — it disappears; `active` is `false`, the row still exists
- [ ] Try to delete someone else's note as a non-admin — refused
- [ ] A user who cannot read the contract cannot add a note to it
- [ ] One of the 18 bodyless legacy notes renders as "(pusta notatka)"
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Q14 — is the notes module shared with another system?** The iframe title is
   "System Zarządzania Ofertami" and CRU is `system_id = 7` in a shared directory.
   If notes are shared, deleting or editing one here may affect another application.
   Our data shows no contamination, but the question should be put to the vendor or
   to a legacy user before the delete action ships.
2. **Q17 — where does "zadaj pytanie" send the question?** If legacy mails it, our
   implementation (a note plus an in-app notification) is a behaviour change that
   nobody has noticed yet because neither system sends mail from here.
3. **Should notes be editable?** Recommend no. Confirm, because the legal department
   may expect to fix a typo.
4. **"Ostatnia notatka" on the Umowy register.** Legacy has it only on Projekty.
   Adding it to Umowy is a small improvement and a divergence; recommend offering it
   as an optional column, off by default.

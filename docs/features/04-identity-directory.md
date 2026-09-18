---
id: 04
title: Identity and directory
group: A-foundations
status: todo
depends-on: []
legacy-tables: [users, admins, users_groups, users_locations, useraccess]
prisma-models: [User, UserGroup, UserLocation, UserAccessScope]
routes: ["/login"]
---

# 04 — Identity and directory

## Why

CRU never owned its users. The `users` "table" is a database view onto a separate
corporate directory that was not part of the dump, so we received 20,626 contracts,
237,405 history entries and 50,737 notes all referencing user ids we cannot resolve
to a name. Of 452 user rows, **451 are placeholders** named `legacy-<id>` with no
e-mail, no surname and no password. Exactly one account can sign in: the seeded
`admin`.

Nothing that shows a person's name is right until this is fixed — the owner column,
the change log, the notes thread, the opinion workflow, and every "Zarejestrowano
przez" footer. It is also the blocking prerequisite for cutover, because on day one
the legal department has to log in.

## Legacy behaviour

### `users` is a view, not a table

`cru.sql:447521`:

```sql
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `users` AS
select id, name, surname, street, number, zip, city, phone, email, password, serwis,
       active, login, `desc`, logins, nip, activate_code, new_password
from (`am_admin`.`users` join `am_admin`.`users_systems`
      on ((`am_admin`.`users_systems`.`user_id` = `am_admin`.`users`.`id`)))
where (`am_admin`.`users_systems`.`system_id` = 7);
```

Three facts follow:

1. Identity lives in `am_admin`, a database we do not have. The dump contains the
   view definition and zero rows.
2. **CRU is `system_id = 7`** in that directory. The same directory serves other
   applications — which is consistent with the remarks iframe being titled "System
   Zarządzania Ofertami" (see spec 14, Q14).
3. Authentication was native — login and password against `am_admin.users.password`.
   There is no SSO. `audyt §0` corrected an earlier assumption that Entra ID was
   involved; the legacy login form is at `/cru/index.php/users/login` with a
   "Zapomniałem hasła!" link pointing into `/admin/index.php/forgot_password`.

### Columns the directory carries that our `User` has no home for

| Legacy column | Our field | Note |
|---|---|---|
| `id` | `User.id` | Preserved 1:1. Not auto-generated. |
| `login` | `login` | |
| `name` / `surname` | `firstName` / `lastName` | |
| `email` | `email` | |
| `phone` | `phone` | |
| `desc` | `description` | |
| `active` | `active` | |
| `logins` | `loginCount` | In the schema, never read or written by any code |
| `password` | `passwordHash` | Hash algorithm unknown — not in the dump |
| `street`, `number`, `zip`, `city` | **none** | Postal address |
| `nip` | **none** | A tax id on a *user* row — probably for contractor-side accounts |
| `serwis` | **none** | Unknown; `[UNKNOWN — ask Mati]` |
| `activate_code`, `new_password` | **none** | The password-reset mechanism |

The four address columns, `nip` and `serwis` are the decision points: we either take
them when the export arrives or we drop them deliberately. Dropping is defensible —
a contract register does not need a user's postal address — but it must be a decision,
because re-requesting an export is slow.

### What the import produced

`scripts/legacy/import.ts` creates a placeholder row for every user id referenced
anywhere in the data. Current state:

| `isPlaceholder` | `active` | Rows | `login` | `email` | `passwordHash` | `lastName` |
|---|---|---|---|---|---|---|
| `true` | `false` | **451** | 451 (`legacy-<id>`) | 0 | 0 | 0 |
| `false` | `true` | 1 | 1 | 0 | 1 | 1 |

Placeholders are inactive and have no password, so `lib/auth.ts:25` rejects them —
correct, and it means the system cannot be opened to real users until the export lands.

Ten placeholders carry `isAdmin = true`, inherited from the legacy `admins` table
(11 total including the seeded account). They are flagged as administrators and
cannot log in. That is the right state, but it means "11 admins" in any report is
currently misleading.

### Names shown in legacy are logins

`audyt §1.4` records "Zarejestrowano przez: `mborowiecka`", "Modyfikowano przez:
`mgolosz`" — the audit footer shows the **login**, not a display name, even though
the owner dictionary elsewhere shows "Nazwisko Imię". `lib/format.ts:52` `userLabel`
already implements the right fallback chain (`lastName firstName` → `login` → `#id`),
so it degrades correctly today and will improve automatically after the sync.

The owner dictionary in legacy shows a `[na]` suffix on some entries, `[INFERRED]` to
mean "nieaktywny" (`audyt §2.3`).

## Legacy quirks

### Quirk: password hashes are unrecoverable

- **Legacy:** hashes live in `am_admin.users.password`, outside the dump, with an
  unknown algorithm (the system is CakePHP-era MySQL 5.1, so most likely unsalted
  SHA-1).
- **Why it matters:** even if the export includes the hash column, we should not
  import it. An unsalted legacy hash is worse than no hash.
- **We do:** own identity from now on. Import identity attributes, not credentials;
  issue passwords through a reset flow on first login. `lib/auth.ts` already uses
  bcrypt.
- **Sign-off:** not needed, but it changes the cutover script — every user needs a
  first-login path on day one.

### Quirk: `admins` membership has no history

- **Legacy:** gaps in the `admins.id` sequence (1–3, 6, 7, 9, 11, 13–18, 20–22)
  show 16 admins were revoked over time. Nothing records who or when.
- **We do:** nothing retroactive — the information is gone. Going forward, admin
  changes are audited like any other change (spec 23).
- **Sign-off:** not needed.

## Implementation

### Files

| Path | Action | Note |
|---|---|---|
| `scripts/legacy/sync-directory.ts` | create | Idempotent upsert from the `am_admin` export |
| `package.json` | modify | Add `db:sync-users` |
| `lib/auth.ts` | modify | First-login password set; `loginCount` increment |
| `app/login/page.tsx` | modify | "Nie pamiętam hasła" path |
| `prisma/schema.prisma` | modify | Only if the address columns are taken (see Q) |

### The sync script

Mirrors the shape of `scripts/legacy/import.ts` — streaming, idempotent, counting
anomalies rather than throwing:

- Match on `User.id` (the `am_admin` id), which is already the primary key.
- Upsert identity attributes; **never** touch `passwordHash`.
- Clear `isPlaceholder` and set `active` from the directory for every matched row.
- Report, do not fail, on: directory users with no CRU reference (they get created,
  inactive), CRU-referenced ids missing from the directory (they stay placeholders
  and are listed), and any id collision.
- Re-runnable, because the directory will be re-exported before cutover.

### Login

`lib/auth.ts` is a credentials provider with bcrypt and a JWT session carrying
`uid`, `role` and `login`. Two additions:

- **First login.** An account that is active and has no `passwordHash` must be able
  to set one, verified by e-mail, rather than being silently rejected as it is today
  (`lib/auth.ts:25`).
- **`loginCount`.** Legacy tracked `logins`; the column exists and nothing writes it.
  Increment on successful sign-in — it is the cheapest possible signal for "who has
  actually started using the new system" during parallel run.

Session claims stay minimal. Note that `role` is baked into the JWT at sign-in
(`lib/auth.ts:36,47`), so promoting someone to admin does not take effect until they
sign in again. Acceptable, but spec 23 should say so where the toggle lives.

### Not in scope

Entra ID / SSO. It was in the July plan, was removed on the 31.07 direction change,
and `plan.md` lists it under "Poza zakresem tego kierunku". Nothing in this design
blocks adding it later — NextAuth would gain a provider and the `User.id` mapping
already exists.

## Verification

```sql
-- 1. Before the sync: the current, known state.
select "isPlaceholder", active, count(*), count(login), count(email),
       count("passwordHash"), count("lastName")
from "User" group by 1, 2;
-- expected: true/false 451 | 451 | 0 | 0 | 0
--           false/true    1 |   1 | 0 | 1 | 1

-- 2. After the sync: no referenced user may remain a placeholder.
select count(*) from "User" u where u."isPlaceholder" and (
  exists (select 1 from "ContractUser"    x where x."userId" = u.id) or
  exists (select 1 from "Opinion"         x where x."userId" = u.id) or
  exists (select 1 from "Remark"          x where x."userId" = u.id) or
  exists (select 1 from "ContractHistory" x where x."userId" = u.id) or
  exists (select 1 from "Contract" x where x."registeredById" = u.id
                                        or x."modifiedById"   = u.id)
);
-- expected after sync: 0. Anything left is a directory gap to report to Bytom.

-- 3. Admin count must become real accounts, not placeholders.
select "isPlaceholder", count(*) from "User" where "isAdmin" group by 1;
-- now: true 10, false 1.  after sync: true 0, false 11.

-- 4. Ids are stable — the sync must never renumber.
select count(*) from "User";   -- must not drop; may grow with directory-only users
```

Manual checks:

- [ ] Run `db:sync-users` twice — the second run reports zero changes
- [ ] A contract detail page shows "Zarejestrowano przez" as a real login, and the
      owner column shows "Nazwisko Imię" instead of `legacy-50463`
- [ ] A synced user with no password can complete first login and then sign in
- [ ] `loginCount` increments
- [ ] An inactive directory user cannot sign in
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Q1 (blocking) — the export itself.** Needed columns: `id`, `login`, `name`,
   `surname`, `email`, `active`, and ideally `phone` and `desc`. Explicitly **not**
   `password`. Requested from the Bytom admins; still outstanding.
2. **Address, `nip` and `serwis`.** Take them or drop them? Recommend dropping the
   four address columns and `serwis`, and asking what a `nip` on a user row means
   before deciding — it may indicate external/contractor accounts, which would matter
   for spec 03.
3. **What happens to directory users who never appear in CRU data?** Create them
   inactive (so they can be granted access later) or skip them? Recommend creating,
   inactive.
4. **First-login channel.** E-mail verification needs SMTP, which does not exist
   anywhere in the codebase yet (see spec 29). Alternative for day one: an admin sets
   an initial password from spec 23's user screen. Recommend the admin path first,
   e-mail later.
5. **`[na]` suffix** on legacy owner-dictionary entries — confirm it means
   "nieaktywny" so the new picker can reproduce or replace it.

# CRU2026 — deployment and access security

Status as of **2026-10-07**. Phase: **internal test** (≤ 5 trusted testers).

---

## 1. How it runs today

```
Tester's browser (office network or home)
   │  HTTPS (certificate managed by Vercel)
   ▼
https://cru-2026-deployed.vercel.app      ← Vercel, Hobby plan, functions in Frankfurt (fra1)
   │  Next.js app: pages, API, middleware session gate
   ▼
Neon Postgres 18, AWS eu-central-1 (Frankfurt)   ← contract metadata, users, LoginEvent
   (pooled connection string in DATABASE_URL)

Attachments: NOT served yet (STORAGE_DRIVER=none → 503 "not available yet").
   A copy of all 39 281 files (48 GB) sits in OneDrive: CRU2026\attachments,
   same keys as the database. Serving them needs the OneDrive/Graph adapter (phase 2).
```

- **Vercel project** `cru-2026-deployed`, team "ArcelorMittal" (Hobby), Git repo
  `Kotsur69/CRU2026`, root directory `nextjs_space`, production branch `main`.
- **Database** moved on 2026-10-07 from the local Postgres 16 (dump + restore, all
  10 735 contracts and the test accounts). **Neon is now the only live database** —
  the local Postgres on the office PC is a stale snapshot for development only.
- **Data location:** EU (Frankfurt) for both the database and the functions. Vercel
  and Neon are external processors — confirm with company IT before real data.
- **Licence:** Vercel Hobby is for personal, non-commercial use. Accepted for a short
  test with ≤ 5 people; the risk is Vercel pausing the project → move to Pro ($20/month).

### Why not the office PC + Cloudflare tunnel (tried 2026-10-05, abandoned)

| Blocker | Detail (verified) |
|---|---|
| Company Zscaler | Every request to `*.trycloudflare.com` is bounced via `gateway.zscalertwo.net` even after SSO. The page loads, but the login form's background `fetch()` turns into a cross-origin request and is blocked by the browser → NextAuth's grey "Error" page. `*.vercel.app` is not bounced. |
| Office LAN | Windows firewall is `BlockInbound` with GPO-only rules; a colleague could not reach the PC (timeout). No admin rights to change it. |

The scripts for that setup (`scripts/prod/run-prod.ps1`, `backup.ps1`) are kept but
no longer used; its autostart shortcut has been removed.

---

## 2. Security measures in place

All checks run **on the server**. Editing the HTML, removing `required`/`maxlength`,
or sending hand-made requests changes nothing: the browser is never trusted.

### Sign-in (`lib/auth.ts`, `lib/login-guard.ts`)

| Measure | How |
|---|---|
| Passwords | bcrypt, cost 12. Never stored or logged in plain text. |
| Brute force — per account | 5 wrong passwords → account locked 15 min. After the lock the counter stays, so each further wrong guess re-locks: one guess per 15 min. While locked even the **correct** password is refused. |
| Brute force — per IP | 30 failures / 15 min from one address → that address is refused. State lives in the database, so it works across Vercel's serverless instances. |
| Parallel bursts | Each attempt is **reserved atomically before** the password is checked (one SQL `UPDATE`). Verified: 10 simultaneous guesses → exactly 5 counted, the other 5 refused. |
| No user enumeration | One error message for every failure. Unknown login and wrong password take the same time (a dummy bcrypt check). |
| Input limits | Login ≤ 64 chars, password ≤ 72 bytes (bcrypt limit) — rejected, never truncated. |
| CSRF | NextAuth CSRF token required on sign-in. |
| SQL injection | Prisma parameterised queries only. |
| Audit log | Every attempt → table `LoginEvent` (login as typed, IP, result, time). The IP is the last `X-Forwarded-For` entry, which Vercel sets to the real client address. |

### Sessions

| Measure | How |
|---|---|
| Lifetime | 8 h of inactivity, and a hard limit of 12 h after sign-in. |
| Revocation | Changing a password (or deactivating a user) bumps `User.sessionVersion`; every open session of that user dies **on its next request**, on every device. |
| Enforcement point | `middleware.ts` checks every request (pages, client-side navigation, API, file downloads, server actions) against the database by calling `INTERNAL_APP_URL/api/auth/session`. Fails closed: any error = signed out. |
| Cookies | httpOnly, SameSite=Lax, `Secure` + `__Secure-` prefix (HTTPS). |
| Secret | The app refuses to start in production if `NEXTAUTH_SECRET` is missing, short (< 32 chars) or the placeholder. |

### Files (`app/api/files/[...key]/route.ts`)

| Measure | How |
|---|---|
| Session required | No live session → 401. |
| Only registered attachments | A key must exist in the `Attachment` table — path tricks (`../../.env`) → 404. |
| No storage attached | With `STORAGE_DRIVER=none` downloads answer **503** "Załączniki nie są jeszcze dostępne…", uploads answer 503 with a JSON error. |
| No stored XSS | Only PDF/PNG/JPG open in the browser. Everything else is forced to download as `application/octet-stream`. |
| Safe file names | RFC 5987 encoding; Polish characters preserved, header injection impossible. |
| No caching | `Cache-Control: private, no-store`. |

### Whole site (`next.config.js`)

Content-Security-Policy (no framing, no plugins, no foreign forms), `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, strict Referrer-Policy, Permissions-Policy, HSTS,
`X-Powered-By` removed.

---

## 3. Accounts

The legacy dump contains **no usable logins** (452 users, all placeholders without
passwords). Accounts that exist:

| Login | Role | Note |
|---|---|---|
| `admin` | administrator | created by `yarn db:seed` |
| `test1` … `test5` | user | names "Test Test1" … "Test Test5"; random 16-char passwords |

- **Change own name / password:** click your name in the top bar → **Moje konto**
  (`/konto`). New passwords: ≥ 12 characters, letters plus a digit or symbol, must not
  contain the login. Changing the password signs the account out everywhere.
- **Account scripts** (`yarn users:create-test`, `yarn users:reset-password <login>`)
  read `DATABASE_URL` from `nextjs_space/.env`, which points at the **local** database.
  To act on the live one, set Neon's connection string for that one command (an
  environment variable wins over `.env`):

  ```powershell
  cd C:\Users\mmazur\source\repos\CRU2026\nextjs_space
  $env:DATABASE_URL = "<Neon connection string, from Neon → Connect>"
  yarn users:reset-password test3
  Remove-Item Env:DATABASE_URL
  ```
- Passwords are printed **once** in the terminal and stored only as bcrypt hashes.
  Hand them to testers over a private channel.

---

## 4. Runbook

### Environment variables (Vercel → Settings → Environment Variables)

| Name | Value | Note |
|---|---|---|
| `DATABASE_URL` | Neon connection string **with pooling** (`…-pooler…`) | Secret. Rotate in Neon → Roles → Reset password, then update here. |
| `NEXTAUTH_SECRET` | random 32-byte base64 | Secret. Changing it signs everyone out. |
| `NEXTAUTH_URL` | `https://cru-2026-deployed.vercel.app` | No trailing slash. |
| `INTERNAL_APP_URL` | `https://cru-2026-deployed.vercel.app` | Where the middleware checks sessions. |
| `STORAGE_DRIVER` | `none` | Until the OneDrive adapter exists. |

**Any change to these needs a Redeploy** (Deployments → latest → ⋯ → Redeploy):
`NEXTAUTH_URL` is inlined into the middleware at build time.

Function region: Settings → Functions → **Frankfurt (fra1)** (next to the database).

### Deploying a code change

1. Commit and `git push` to `main`. Vercel should build automatically.
2. If no new deployment appears within a minute (the Vercel account and the Git
   author differ, which can stop auto-deploys): Deployments → ⋯ → **Create
   Deployment** → `main`. Do **not** use "Redeploy" for this — it rebuilds the old commit.
3. `postinstall` runs `prisma generate`, so the Prisma client is always fresh.

### Database migrations

Vercel does **not** run migrations. Before deploying code that adds a migration:

```powershell
cd C:\Users\mmazur\source\repos\CRU2026\nextjs_space
$env:DATABASE_URL = "<Neon connection string WITHOUT pooling>"
npx prisma migrate deploy        # applies pending migrations, never resets data
Remove-Item Env:DATABASE_URL
```

### Backups

- Neon keeps a short point-in-time restore window (see the current Free plan limit in
  the Neon console → Backup & Restore).
- **Not automated yet:** a nightly logical dump. Note: the office PC has `pg_dump` 16
  and Neon runs Postgres 18 — `pg_dump` must be version ≥ 18 to dump it.

### Useful checks (Neon → SQL Editor)

```sql
-- recent sign-in attempts
select "createdAt", login, ip, reason from "LoginEvent" order by id desc limit 20;
-- locked accounts
select login, "lockedUntil" from "User" where "lockedUntil" > (now() at time zone 'UTC');
```

Unlock someone early: `yarn users:reset-password <login>` against Neon (section 3), or
`update "User" set "failedLoginCount"=0, "lockedUntil"=null where login='…';`

Application errors: Vercel → project → **Logs**.

### Local development

`yarn dev` uses `nextjs_space/.env` (local Postgres, `STORAGE_DRIVER=local`,
`storage-local/attachments`). The local data is a snapshot from 2026-10-05 and is
**not** synced with Neon.

---

## 5. Known gaps (accepted for the test phase)

| Gap | Why accepted now | Fix later |
|---|---|---|
| **Read authorization per contract (spec 03) not implemented** — every signed-in user sees every contract, and `/dostepy` lists all accounts. | Testers are trusted people who may see everything. | Spec 03, **before any non-trusted user gets an account**. |
| **Attachments unavailable** (download and upload answer 503). | Files are 48 GB; the OneDrive adapter needs IT consent. | Phase 2, step 1. |
| **Vercel Hobby is non-commercial.** | ≤ 5 testers, short test. | Vercel Pro ($20/month) for anything beyond the test. |
| Company data at external processors (Vercel, Neon), EU region. | Test with trusted users. | IT / data-protection sign-off before real users. |
| No automated database backup beyond Neon's restore window. | Little new data during the test. | Nightly `pg_dump` (v18) to OneDrive. |
| Anyone with the link reaches the login page. | Login is hardened (lockout, IP limit, audit). | Entra ID sign-in or an access gate in front. |
| A locked account can be abused to lock a tester out (DoS). | Few known testers; unlock with `users:reset-password`. | Same as above. |
| CSP allows inline scripts (Next 14 hydration). | Other directives still block framing, plugins, foreign forms. | Nonce-based CSP. |
| `LoginEvent` grows without limit. | Tiny volume. | Retention job (delete > 90 days). |
| Neon Free suspends an idle database; the first request after a pause is slower. | Acceptable for testing. | Paid plan if it bothers users. |

---

## 6. Plan for the future

### Phase 2 — attachments and company sign-off

1. **OneDrive / SharePoint storage adapter** (`STORAGE_DRIVER=sharepoint`, a new file
   in `lib/storage/`): reads files through Microsoft Graph. Needs an **app
   registration in the company Entra ID with admin consent** (IT). Downloads should
   redirect to a short-lived Graph download URL instead of streaming through Vercel —
   Vercel Hobby caps request and response bodies at ~4.5 MB. Better long term: move
   the files from a personal OneDrive to a SharePoint/Teams site.
2. IT / data-protection sign-off for Vercel + Neon (EU), or move to company hosting.
3. Implement **spec 03** (read authorization) and an **admin screen for users**.
4. Import real users once the corporate directory (`am_admin`) export is available.
   Consider Entra ID single sign-on instead of local passwords.

### Phase 3 — production

| Option | Shape | Cost |
|---|---|---|
| A. Stay on Vercel + Neon | Vercel Pro, Neon paid plan (longer restore window, no suspend), files via Graph. | ~$20–40/month |
| B. Company server / VM | App + Postgres on company infrastructure, files on SharePoint or a file server. | company hardware |

The storage layer (`STORAGE_DRIVER`) and the session design make either option a
configuration/adapter change, not a rewrite.

---

## 7. Files involved

| File | Role |
|---|---|
| `nextjs_space/lib/auth.ts` | NextAuth config, sign-in flow, session revocation, timeouts, secret guard |
| `nextjs_space/lib/login-guard.ts` | Lockout, IP limit, atomic attempt reservation, audit log |
| `nextjs_space/lib/password-policy.ts` | Password rules, random password generator |
| `nextjs_space/middleware.ts` | Per-request session + revocation gate (`INTERNAL_APP_URL`) |
| `nextjs_space/lib/storage/` | `StorageAdapter`; `local` and `none` drivers |
| `nextjs_space/app/api/files/[...key]/route.ts` | Secure attachment download |
| `nextjs_space/app/api/attachments/route.ts` | Attachment upload |
| `nextjs_space/next.config.js` | Security headers |
| `nextjs_space/app/(app)/konto/` + `features/konto/` | "Moje konto" — name and password change |
| `nextjs_space/scripts/accounts.ts` | `users:create-test`, `users:reset-password` |
| `nextjs_space/package.json` | `postinstall: prisma generate` for Vercel |
| `nextjs_space/scripts/prod/` | Former office-PC setup (tunnel, backup) — not in use |

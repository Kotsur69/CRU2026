# CRU2026 — deployment and access security

Status as of **2026-10-05**. Phase: **internal test** (5 trusted testers).

---

## 1. How it runs today

```
Tester's browser
   │  HTTPS  (TLS ends at Cloudflare — certificate managed by Cloudflare)
   ▼
https://<random-words>.trycloudflare.com    ← Cloudflare quick tunnel (free, no account, no domain)
   │  outbound-only connection from this PC: no open router ports, office IP never exposed
   ▼
cloudflared.exe (C:\Users\mmazur\cloudflared, user folder — no admin rights needed)
   │
   ▼
This PC ─ Next.js production server on 127.0.0.1:3100 (loopback only)
            ├─ PostgreSQL (portable) on localhost:5432 — contract metadata
            └─ storage-local/attachments — 49 GB, 39 281 files (PDF, msg, docx …)
```

- **Everything runs on this PC**: application, database and files. Nothing is
  hosted externally and no data is copied to a cloud service.
- The app and the database listen **only on loopback**. The single entry point
  from the internet is the Cloudflare tunnel.
- **No admin rights on this PC** (company-managed), so everything runs as the normal
  user: portable Postgres, the app, and `cloudflared.exe` (single signed binary, no
  installer). Tailscale Funnel was the first plan but its installer needs admin.
- **The address changes whenever the tunnel restarts** (reboot, crash). The current
  one is always in `nextjs_space/logs/public-url.txt`; send it to testers again.
- **Check with company IT** that running a tunnel from this PC is allowed.
- Files never leave through any other path: every download goes through
  `/api/files/...`, which checks the session first.

### Why not Vercel / Abacus (decided 2026-10-05)

| Reason | Detail |
|---|---|
| Cost / licence | Vercel Hobby (free) forbids commercial use; Pro is $20/month. Abacus is paid. |
| Database on this PC | Vercel functions cannot run `cloudflared`, so they cannot reach a Postgres behind a tunnel. The alternatives were exposing Postgres to the internet (rejected) or rewriting every DB query behind a new API (weeks of work). |
| Speed | Every page would make round trips Vercel → internet → this PC. |
| Upload limit | Vercel caps request bodies at 4.5 MB; contract PDFs are larger. |

Nothing in this setup blocks moving later — see section 6.

---

## 2. Security measures in place

All checks run **on the server**. Editing the HTML, removing `required`/`maxlength`,
or sending hand-made requests changes nothing: the browser is never trusted.

### Sign-in (`lib/auth.ts`, `lib/login-guard.ts`)

| Measure | How |
|---|---|
| Passwords | bcrypt, cost 12. Never stored or logged in plain text. |
| Brute force — per account | 5 wrong passwords → account locked 15 min. After the lock the counter stays, so each further wrong guess re-locks: one guess per 15 min. While locked even the **correct** password is refused. |
| Brute force — per IP | 30 failures / 15 min from one address → that address is refused. |
| Parallel bursts | Each attempt is **reserved atomically before** the password is checked (one SQL `UPDATE`). Verified: 10 simultaneous guesses → exactly 5 counted, the other 5 refused. |
| No user enumeration | One error message for every failure. Unknown login and wrong password take the same time (~420 ms, a dummy bcrypt check). |
| Input limits | Login ≤ 64 chars, password ≤ 72 bytes (bcrypt limit) — rejected, never truncated. |
| CSRF | NextAuth CSRF token required on sign-in (verified: requests without it are refused). |
| SQL injection | Prisma parameterised queries only (verified with `' OR 1=1 --`). |
| Audit log | Every attempt → table `LoginEvent` (login as typed, IP, result, time). |

### Sessions

| Measure | How |
|---|---|
| Lifetime | 8 h of inactivity, and a hard limit of 12 h after sign-in. |
| Revocation | Changing a password (or deactivating a user) bumps `User.sessionVersion`; every open session of that user dies **on its next request**, on every device. |
| Enforcement point | `middleware.ts` checks every request (pages, client-side navigation, API, file downloads, server actions) against the database. Fails closed: any error = signed out. |
| Cookies | httpOnly, SameSite=Lax; `Secure` + `__Secure-` prefix once `NEXTAUTH_URL` is the https address (required, see section 4). |
| Secret | The app refuses to start in production if `NEXTAUTH_SECRET` is missing, short (< 32 chars) or the placeholder. |

### Files (`app/api/files/[...key]/route.ts`)

| Measure | How |
|---|---|
| Session required | No live session → 401. |
| Only registered attachments | A key must exist in the `Attachment` table — stray files on disk and path tricks (`../../.env`) → 404. |
| No stored XSS | Only PDF/PNG/JPG open in the browser. Everything else (`.htm`, `.mht`, `.msg`, Office …) is forced to download as `application/octet-stream` — an HTML attachment can no longer run scripts inside the app. |
| Safe file names | RFC 5987 encoding; Polish characters preserved, header injection impossible. |
| No caching | `Cache-Control: private, no-store` — documents are not left in shared caches. |

### Whole site (`next.config.js`)

Content-Security-Policy (no framing, no plugins, no foreign forms), `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, strict Referrer-Policy, Permissions-Policy, HSTS,
`X-Powered-By` removed.

---

## 3. Accounts

The legacy dump contains **no usable logins** (452 users, all placeholders without
passwords — the corporate directory was not part of the export). Accounts that exist:

| Login | Role | Note |
|---|---|---|
| `admin` | administrator | created by `yarn db:seed` |
| `test1` … `test5` | user | names "Test Test1" … "Test Test5"; random 16-char passwords |

- **Change own name / password:** click your name in the top bar → **Moje konto**
  (`/konto`). New passwords: ≥ 12 characters, letters plus a digit or symbol, must not
  contain the login. Changing the password signs the account out everywhere.
- **Create the test accounts** (skips existing): `yarn users:create-test`
- **Reset anyone's password** (prints a new one once, signs them out):
  `yarn users:reset-password <login>`
- Passwords are printed **once** in the terminal and stored only as bcrypt hashes.
  Hand them to testers over a private channel; never commit or e-mail them in bulk.

---

## 4. Runbook (this PC)

### One-time setup

1. **`.env`** (in `nextjs_space/`, never committed):
   - `NEXTAUTH_SECRET` — keep the generated 44-char value.
   - `NEXTAUTH_URL` — leave as `http://localhost:3100` (local dev). In production
     `run-prod.ps1` passes the current tunnel address as an environment variable,
     which takes precedence over `.env`.
   - Delete the `SEED_ADMIN_PASSWORD` line after rotating the admin password with
     `yarn users:reset-password admin` — a plain-text password should not sit on disk.
2. **Power:** Settings → System → Power → Sleep: *Never*. Windows Update → set
   active hours so restarts happen at night.
3. **cloudflared:** `C:\Users\mmazur\cloudflared\cloudflared.exe`, downloaded from
   Cloudflare's GitHub releases (Authenticode signature: Cloudflare, Inc.). Update by
   replacing the file while the app is stopped.

### Start / stop

```powershell
cd C:\Users\mmazur\source\repos\CRU2026\nextjs_space
.\scripts\prod\run-prod.ps1            # add -Build after a code change
```

`run-prod.ps1` starts Postgres if needed, applies pending migrations
(`prisma migrate deploy` — never resets data), builds if there is no build, then
starts the tunnel and the app (`127.0.0.1:3100`) and **watches both** every 15 s:
a dead app is restarted; a dead tunnel is restarted together with the app (new address).
The window prints the address to send to testers. **Closing the window stops everything.**

Logs in `nextjs_space/logs/`: `prod-<date>.log` (script), `app.log` / `app-error.log`
(Next.js), `tunnel.log` (cloudflared), `public-url.txt` (current address).

### Autostart (no admin rights needed)

A shortcut in the user's Startup folder runs the script at **logon**. Without admin
rights a task cannot start before someone signs in, so after a reboot **sign in to
Windows** (locking the screen afterwards is fine).

```powershell
$app = "C:\Users\mmazur\source\repos\CRU2026\nextjs_space"
$lnk = (New-Object -ComObject WScript.Shell).CreateShortcut("$([Environment]::GetFolderPath('Startup'))\CRU2026.lnk")
$lnk.TargetPath = "powershell.exe"
$lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$app\scripts\prod\run-prod.ps1`""
$lnk.WorkingDirectory = $app
$lnk.WindowStyle = 7   # minimized
$lnk.Save()
```

Remove autostart: delete `CRU2026.lnk` from `shell:startup`.

### Backups

```powershell
schtasks /Create /TN "CRU2026 backup" /SC DAILY /ST 02:30 `
  /TR "powershell -NoProfile -ExecutionPolicy Bypass -File `"$app\scripts\prod\backup.ps1`" -Target `"D:\cru-backup`""
```

Without `/RU`/`/RP` the task runs as you while you are signed in (screen locked is
fine) — no admin rights needed. The target **must be another disk or a NAS**. Database: full `pg_dump` nightly, kept
14 days. Files: incremental mirror (only changes are copied after the first 49 GB run).
Restore: `pg_restore --clean --if-exists -U cru -h localhost -d cru2026 <file.dump>`.

### Deploying a code change

```powershell
cd C:\Users\mmazur\source\repos\CRU2026\nextjs_space
git pull
# close the running CRU2026 window first, then:
.\scripts\prod\run-prod.ps1 -Build
```

The tunnel address changes on every restart — send testers the new one from
`logs\public-url.txt`.

**"Site not found" on this PC right after a restart?** Windows cached the brand-new
hostname as non-existent for a few minutes. Wait, run `ipconfig /flushdns`, or test
from a phone. Testers are not affected (they get the link after it exists).

### Useful checks

```sql
-- recent sign-in attempts
select "createdAt", login, ip, reason from "LoginEvent" order by id desc limit 20;
-- locked accounts
select login, "lockedUntil" from "User" where "lockedUntil" > (now() at time zone 'UTC');
```

Unlock someone early: `yarn users:reset-password <login>` (new password), or in SQL
`update "User" set "failedLoginCount"=0, "lockedUntil"=null where login='…';`

---

## 5. Known gaps (accepted for the test phase)

| Gap | Why accepted now | Fix later |
|---|---|---|
| **Read authorization per contract (spec 03) not implemented** — every signed-in user sees every contract and file, and `/dostepy` lists all accounts. | Testers are trusted people who may see everything. | Spec 03, **before any non-trusted user gets an account**. The file route already has the hook point. |
| A locked account can be abused to lock a tester out (DoS). | 5 known testers; unlock with `users:reset-password`. | Cloudflare Access in front (phase 2) removes anonymous access to the login entirely. |
| CSP allows inline scripts (Next 14 hydration). | Other directives still block framing, plugins, foreign forms. | Nonce-based CSP. |
| Postgres trusts local connections without a password (`pg_hba: trust` on 127.0.0.1). | Listens on localhost only; only processes on this PC can connect. | Switch to `scram-sha-256` and update `start.ps1`/`.env`. |
| `LoginEvent` grows without limit. | Tiny volume with 5 testers. | Retention job (delete > 90 days). |
| Single machine = single point of failure. | Test phase. | Phase 2 / 3 below. |
| Quick tunnel: random address that changes on restart, no uptime guarantee (Cloudflare: "for testing"). | Free, no admin, no domain; fine for 5 testers. | Named Cloudflare Tunnel on our domain (phase 2). |
| Runs only while someone is signed in to Windows (no admin rights → no boot-time task). | PC stays on 24/7, signed in and locked. | Phase 2: `cloudflared` + app as Windows services (needs IT/admin once). |
| Anyone with the link reaches the login page. | Login is hardened (lockout, IP limit, audit). | Cloudflare Access (phase 2). |

---

## 6. Plan for the future

### Phase 2 — after the company approves (needs a domain, ~$10/year)

1. Buy a domain (e.g. on Cloudflare) and put its DNS on Cloudflare (free plan).
2. Replace the quick tunnel with a **named Cloudflare Tunnel** on the domain
   (`cloudflared tunnel login` / `create` / `route dns`) — a fixed address. Ideally run
   it and the app as Windows services (one-time admin from IT). Still no open ports.
3. Add **Cloudflare Access** (free up to 50 users): only approved e-mail addresses
   receive a one-time code and only then see the login page — two independent locks.
   Add a Cloudflare rate-limit rule on `/api/auth/*`.
4. Change `NEXTAUTH_URL` to the new domain. **No application code changes.**
5. Implement **spec 03** (read authorization) and an **admin screen for users**
   (create, deactivate, reset password) to replace the CLI scripts.
6. Import real users once the corporate directory (`am_admin`) export is available.

### Phase 3 — if it should run off this PC (optional)

| Option | Shape | Cost |
|---|---|---|
| A. Company server / VM | Same as today, moved to a server: app + Postgres + files, Cloudflare Tunnel. Least work. | company hardware |
| B. Vercel + cloud DB | Next.js on Vercel Pro, Postgres in the EU (Neon / Supabase, Frankfurt), files stay on a company machine behind Cloudflare Tunnel, served via short-lived signed links. | ~$20–45/month |
| C. Full cloud | As B, with files in object storage (S3 / R2) through the existing `StorageAdapter` (`lib/storage`). | + storage |

The storage layer (`STORAGE_DRIVER`) and the session design were built so each option
is a configuration/adapter change, not a rewrite.

---

## 7. Files involved

| File | Role |
|---|---|
| `nextjs_space/lib/auth.ts` | NextAuth config, sign-in flow, session revocation, timeouts, secret guard |
| `nextjs_space/lib/login-guard.ts` | Lockout, IP limit, atomic attempt reservation, audit log |
| `nextjs_space/lib/password-policy.ts` | Password rules, random password generator |
| `nextjs_space/middleware.ts` | Per-request session + revocation gate |
| `nextjs_space/app/api/files/[...key]/route.ts` | Secure attachment download |
| `nextjs_space/next.config.js` | Security headers |
| `nextjs_space/app/(app)/konto/` + `features/konto/` | "Moje konto" — name and password change |
| `nextjs_space/scripts/accounts.ts` | `users:create-test`, `users:reset-password` |
| `nextjs_space/scripts/prod/run-prod.ps1` | Production start (Postgres, migrations, build, serve) |
| `nextjs_space/scripts/prod/backup.ps1` | Nightly DB dump + file mirror |
| `nextjs_space/prisma/migrations/20261005120000_auth_hardening` | Security columns + `LoginEvent` |

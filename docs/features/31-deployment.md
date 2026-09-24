---
id: 31
title: Wdrożenie i utrzymanie
group: F-delivery
status: todo
depends-on: []
legacy-tables: []
prisma-models: []
routes: []
---

# 31 — Wdrożenie i utrzymanie

> **Where we stand (2026-09-24): not started.** Nothing in this spec is built yet.
>
> - **Waiting on:** **Q4** (where production runs), Q75 (Docker or a plain Node service), Q76 (who operates it) and Q77 (staging).
> - **Next step:** Q4.

## Why

Nothing in this repository can be deployed today. There is no Dockerfile, no reverse
proxy configuration, no process manager, no environment contract and no host.
There is a `docker-compose.yml` that starts a **development** Postgres and a
`start.ps1` that sets up a developer's machine.

Two of those existing pieces are actively wrong in ways that will bite on the first
real deployment:

- **`start.ps1` runs `prisma db push`, so `prisma/migrations/` is never applied** —
  including the migration without which the application cannot insert a single row.
- **`npm run lint` does not run at all.** ESLint 9 with `eslint-config-next` 15
  against Next 14, configured by an `.eslintrc.json` that flat-config ESLint
  ignores. CI cannot gate on a command that errors out.

Everything else in this spec waits on **Q4 — where production runs** — which is
still unanswered.

## What exists today

| Path | What it is | Verdict |
|---|---|---|
| `nextjs_space/docker-compose.yml` | Postgres 16 alpine, user/pass `cru`/`cru`, port 5432, volume `cru_pgdata` | **Dev only.** Default credentials, no TLS, published on all interfaces |
| `nextjs_space/start.ps1` | Developer bootstrap: install, `db:push`, conditional `db:seed`, `dev` | Fine for a laptop, wrong for a server |
| `nextjs_space/prisma/migrations/` | Three migrations | Correct, and **not applied by `start.ps1`** |
| `nextjs_space/.eslintrc.json` | Legacy-format config | **Ignored** by ESLint 9 |
| `nextjs_space/package.json` | `dev`/`build`/`start` on port 3100, seven `db:*` scripts | No `test`, no `lint` that works, no job runner |

### The three migrations

```
20260831070351_init
20260831070642_contract_identifier_not_unique
20260918100000_write_support_sequences
```

The third is the one that matters. Its own comment explains why:

> *"The legacy import supplies primary keys explicitly … so these tables were
> created without a default. That makes every INSERT from the application itself
> fail. Each sequence is therefore created and then restarted above the highest
> imported id."*

`prisma db push` synchronises the **schema** from `schema.prisma`. It does not
execute migration SQL. So an environment brought up by `start.ps1` has correct
tables, correct indexes — and **no id sequences**. The first attempt to create a
contract fails.

On a developer's machine this has been invisible because the sequences were applied
once, by hand, to the existing database. A fresh environment — a new laptop, a
staging server, production — will not have them.

## Legacy quirks

### Quirk: `start.ps1` uses `db:push` where it needs `db:migrate deploy`

- **Current:** `start.ps1:154-155` — `Step "Schemat bazy (prisma db push)"` then
  `Invoke-Yarn db:push`.
- **Why it is wrong:** see above. It also means the migration history is never
  recorded, so a later `prisma migrate deploy` finds a schema it did not create and
  refuses, or worse, tries to re-apply everything.
- **We do:** `prisma migrate deploy` in every non-developer context, and a
  `db:deploy` script to make that the obvious call:

  ```json
  "db:deploy": "prisma migrate deploy"
  ```

  `start.ps1` keeps `db:push` **only** if it is documented as a scratch-database
  tool; the safer change is to switch it too, since a developer benefits from the
  sequences as much as a server does.
  CLAUDE.md already warns that *"`db:migrate` writes a migration; `db:push` does
  not"* — this is the case that warning exists for.
- **Sign-off:** not needed.
- **Priority:** highest in this spec. Without it no fresh environment can write.

### Quirk: linting is broken

- **Current:** `eslint@9.24.0` + `eslint-config-next@15.3.0` + Next 14.2.28 +
  `.eslintrc.json`. Running `npx next lint` produces:

  ```
  - 'extensions' has been removed.
  - 'resolvePluginsRelativeTo' has been removed.
  - 'ignorePath' has been removed.
  - 'rulePaths' has been removed. Please define your rules using plugins.
  - 'reportUnusedDisableDirectives' has been removed.
  ```

  ESLint 9 defaults to flat config and rejects the options `next lint` passes.
- **Why it matters:** the repo's own rules require `react-hooks/rules-of-hooks` as
  an error and treat `exhaustive-deps` as CI-blocking for new code. None of it runs.
- **We do:** pin the combination that works with Next 14 — **`eslint@8.57.x` and
  `eslint-config-next@14.2.28`**, matching the Next version — and keep
  `.eslintrc.json`. Upgrading to flat config is the other option and it is a bigger
  change for no benefit while the framework is on 14.
- **Sign-off:** not needed.

### Quirk: the compose file ships default credentials

- **Current:** `POSTGRES_USER: cru`, `POSTGRES_PASSWORD: cru`, port published as
  `5432:5432`.
- **We do:** keep it exactly as it is **for development** and add a header comment
  saying so in one line. Production gets its own compose file or none at all,
  depending on Q4, with credentials from the environment and the port bound to
  `127.0.0.1`.
- **Sign-off:** not needed.

## The deployment

### Environment contract

Everything the application reads, in one place, because there is no such list today:

| Variable | Purpose | Notes |
|---|---|---|
| `DATABASE_URL` | Postgres | Must include `sslmode=require` off-box |
| `NEXTAUTH_URL` | Absolute base URL | Must match what the browser sees through the proxy |
| `NEXTAUTH_SECRET` | Session signing | **32+ random bytes.** Rotating it logs everyone out |
| `STORAGE_ROOT` | Attachment root | Spec 32; 49 GB and growing |
| `STORAGE_ADAPTER` | `local` \| … | Spec 32 |
| `TZ` | `Europe/Warsaw` | The auto-close job (spec 19) is date-based; UTC shifts it by a day |

`.env` is gitignored and untracked — verified with `git check-ignore -v`. It stays
that way. Production values come from the host, never from a file in the repo.

`TZ` deserves the emphasis. Spec 19's job closes contracts whose `dateEnd` is
before "today". On a UTC host between midnight and 01:00 CET, "today" is yesterday,
and a contract closes a day late every winter.

### Topology

Whatever Q4 answers, the shape is the same:

```
[browser] → https → [reverse proxy] → http://127.0.0.1:3100 → [next start]
                                                              → [postgres]
                                                              → [storage]
                    ↑ the only port exposed
```

The proxy terminates TLS, sets the security headers the repo's own rules require
(`Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`) and
raises `client_max_body_size` to **100 MB**, matching the upload limit in
`app/api/attachments/route.ts:16`. A default nginx cap of 1 MB would reject the
528 attachments over that size (spec 18).

**One public endpoint only**, and only if spec 27 goes ahead: the Adobe Sign
webhook. Everything else is internal.

### Process

`next start -p 3100` under something that restarts it — a systemd unit on Linux, a
Windows service or Task Scheduler on Windows, `restart: unless-stopped` under
Docker. Plus the scheduled job from spec 19, which is a separate process and needs
its own supervision and its own "has not run in 48 h" alarm.

### Release

1. `git pull`
2. `corepack yarn install --frozen-lockfile`
3. **`yarn db:deploy`** — migrations, not push
4. `corepack yarn build`
5. Restart the process
6. Smoke check: sign in, open `/umowy`, open one record, download one attachment

Steps 3 and 4 in that order: a migration that adds a column must run before code
that selects it.

## Implementation

| Path | Action | Note |
|---|---|---|
| `package.json` | modify | Add `db:deploy`; pin `eslint@8.57`, `eslint-config-next@14.2.28` |
| `start.ps1` | modify | `db:deploy` instead of `db:push` |
| `docker-compose.yml` | modify | One comment line marking it development-only |
| `Dockerfile` | create | Multi-stage: deps → build → runner on `node:20-alpine`, non-root |
| `docs/deploy.md` | create | The environment table, the release steps, the rollback |
| `.env.example` | create | Every variable above, **keys only, no values** |
| `next.config.js` | modify | `output: "standalone"` if the Docker path is chosen |

### Rollback

`git checkout <previous tag>`, rebuild, restart. **Migrations do not roll back** —
Prisma has no down migrations — so any migration that drops or narrows a column
needs an expand/contract split across two releases. Spec 01's re-import is the
first one where this matters.

## Verification

```bash
# 1. The migration gap — the defect this spec exists to fix.
grep -n "db:push" nextjs_space/start.ps1
# currently line 155; must become db:deploy

# 2. Linting is broken today.
cd nextjs_space && npx next lint 2>&1 | head -3
# currently: "'extensions' has been removed." etc.
# after the pin: real lint output, or clean

# 3. The build still works.
corepack yarn build          # expect "Done in …", 28 routes

# 4. Secrets are not tracked.
git check-ignore -v nextjs_space/.env     # expect a .gitignore hit
git ls-files --error-unmatch nextjs_space/.env 2>&1 | grep -q "did not match"

# 5. Nothing in the repo carries a production credential.
grep -rn "POSTGRES_PASSWORD\|NEXTAUTH_SECRET" --include=*.yml --include=*.json \
     --include=*.ts nextjs_space | grep -v node_modules
# expect: only docker-compose.yml's dev value and .env.example's empty key
```

Fresh-environment test — the one that actually proves the fix:

- [ ] On a machine that has never run this project: clone, `yarn install`,
      `docker compose up -d`, `yarn db:deploy`, `yarn db:seed`
- [ ] **Create a contract through the UI.** It must save. Before the fix this fails
      because no id sequence exists
- [ ] `select last_value from "Contract_id_seq";` returns a value above the highest
      imported id
- [ ] `prisma migrate status` reports all three migrations applied

Deployment checks:

- [ ] Only the proxy's port is reachable from outside; 3100 and 5432 are not
- [ ] Uploading a 40 MB PDF succeeds through the proxy
- [ ] `TZ` is `Europe/Warsaw` and `date` inside the container agrees with Poland
- [ ] The application restarts by itself after `kill -9`
- [ ] Spec 19's job runs on schedule and alarms when it does not
- [ ] The four security headers are present on a response
- [ ] Rotating `NEXTAUTH_SECRET` logs everyone out and nothing else breaks

## Open questions

1. **Q4 (blocking) — where does production run?** Internal Katowice server or the
   Bytom server. It determines the OS, the process manager, the scheduler for
   spec 19, where 49 GB of attachments live (spec 32, Q30), and whether the Adobe
   webhook (spec 27) can be reached at all. **Nothing in group F can be finished
   without it.**
2. **Q75 — Docker or a plain Node service?** Docker is reproducible and adds an
   operational dependency an internal team may not want. Recommend Docker if the
   host is Linux, a Windows service if it is not.
3. **Q76 — who operates it after handover?** Restarts, certificate renewal, disk
   space for a store that grows ~3,500 files a year, and the job alarm all need an
   owner. Related to Q66 (who administers access).
4. **Q77 — is there a staging environment?** Spec 34's parallel run assumes one.
   Without it, cutover is tested in production.

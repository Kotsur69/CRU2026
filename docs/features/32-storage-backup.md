---
id: 32
title: Magazyn plików i kopie zapasowe
group: F-delivery
status: todo
depends-on: [18]
legacy-tables: [attachment]
prisma-models: [Attachment]
routes: ["/api/files/[...key]"]
---

# 32 — Magazyn plików i kopie zapasowe

## Why

**49 GB across 39,281 files**, and the database that describes them is 45 MB. By
volume this system is 99.9% documents; the register is a thin index over them.

Losing the database is recoverable — `cru.sql` exists, the import is idempotent and
it takes an afternoon. Losing the file store is not. There is no second copy of a
signed contract scan.

Today there is no backup of either. The files sit in one directory on one developer
laptop, and `nextjs_space/storage-local/` is gitignored, which is correct and also
means nothing is versioning them.

## What exists

`lib/storage/` is a clean abstraction and the best-designed piece of infrastructure
in the repository. Its own header states the intent:

> *"Abstrakcja magazynu plików. UI/routing zależą TYLKO od tego interfejsu — nigdy
> od konkretnego backendu. Docelowo: fizyczny serwer (Bytom) / SharePoint / S3."*

| File | What |
|---|---|
| `types.ts` | `StorageAdapter` — `exists`, `stat`, `list`, `getBuffer`, `getDownloadUrl`, `put`, `remove` |
| `local-adapter.ts` | The filesystem implementation |
| `index.ts` | `getStorage()` — the single entry point |

Seven methods, no leakage of paths into the UI, and `put()` owns key generation so
the `attachments/<md5>.<ext>` scheme cannot drift. Nothing in this spec needs to
change that interface; the work is choosing a backend and backing it up.

## Data

### Size

| | Value |
|---|---|
| Files | **39,281** |
| Total | **49 GB** |
| Database rows | 39,272 |
| Mean file | ~1.3 MB |
| Largest | 40.2 MB |
| Growth | ~3,500 files/year → **~4.5 GB/year** |

Distribution (spec 18):

| Bucket | Files |
|---|---|
| 0 bytes | 24 |
| < 100 KB | 6,551 |
| 100 KB – 1 MB | 21,004 |
| 1 – 10 MB | 11,174 |
| 10 – 100 MB | 528 |

One flat directory with 39,281 entries. That is fine on ext4 and NTFS, awkward to
`ls`, and irrelevant to object storage. **Do not reshard it into subdirectories** —
the key is stored in 39,272 database rows and the legacy paths are what
`cru.sql` contains.

### Integrity, from spec 18

| Class | Count |
|---|---|
| Row and file agree | 39,257 |
| Extension mangled, file present | 7 |
| **Row with no file** | **8** |
| **File with no row** | 17 |
| **Zero-byte files with a row** | **23** |

Those numbers are the backup's acceptance criteria: a restore that does not
reproduce them exactly has lost or invented something.

## Legacy quirks

### Quirk: there is no backup of anything

- **Current:** one copy of 49 GB on one machine; no database dump schedule; no
  offsite copy; no restore that has ever been tested.
- **Why it matters:** the register is the legal department's record of what the
  company has signed. A disk failure today loses every document added since the
  Bytom export, and after cutover it loses everything.
- **We do:** the schedule below, and — more importantly — a **restore rehearsal**.
  A backup nobody has restored is a hypothesis.
- **Sign-off:** not needed. Q4 decides where the copies go.

### Quirk: `put()` may deduplicate and the caller cannot tell

- **Current:** the interface says *"Gdy identyczna treść już tam jest, adapter może
  zwrócić klucz istniejącego obiektu zamiast zapisywać duplikat."*
- **Why it matters:** two `Attachment` rows would then share a `storageKey`, and
  spec 18 verifies that duplicates are **zero** today. Deleting one attachment
  would remove the other's file.
- **We do:** keep the dedup option — 49 GB with four byte-identical copies of one
  PDF among the orphans suggests it is worth something — but make `remove()`
  refuse while another row references the key, and add the check to
  `verify-files`. Alternatively disable dedup entirely; it saves little and removes
  a whole class of bug. **Recommend disabling it** until someone measures the
  saving.
- **Sign-off:** not needed.

### Quirk: the local adapter is the only one, and it is not the target

- **Current:** `local-adapter.ts` reads and writes the filesystem. The header names
  three possible futures and picks none.
- **We do:** decide with Q30/Q4, and keep the local adapter as the development
  backend regardless. The interface makes this a one-file change, which is the
  payoff for having written it.
- **Sign-off:** not needed.

## The decision

Three candidates, from the interface's own comment:

| Option | For | Against |
|---|---|---|
| **Local disk on the app server** | Simplest. Works today. No new contract, no new credentials. `getDownloadUrl` stays the proxy route | Backup is somebody's job. 49 GB on the app server's disk. No redundancy without a second copy |
| **Bytom file server** | The files are already there. Institutional backup probably exists | Network dependency for every download. Latency on a 40 MB PDF. Needs a mount or an API |
| **S3 / MinIO** | Presigned URLs remove the proxy from the data path. Versioning and lifecycle rules come free. Restores are a documented operation | A new dependency and a new cost. Presigned URLs bypass spec 18's per-attachment authorization unless they are minted **after** the check |

**Recommendation: local disk plus scheduled replication**, unless Q4 puts
production somewhere that already has object storage. The volume is not large by
2026 standards, the access pattern is "download one file occasionally", and the
simplest thing that can be backed up beats the most capable thing that is not.

If S3 is chosen, the authorization rule from spec 18 must hold: resolve the key to
an `Attachment`, check the contract, **then** mint a short-lived presigned URL.
Never a public bucket, never a long-lived link.

## Backup

### What has to be copied

| What | Size | Changes | Method |
|---|---|---|---|
| Postgres | ~500 MB | constantly | `pg_dump -Fc`, nightly |
| Attachments | 49 GB | ~10 files/day | file-level sync, nightly |
| `.env` | tiny | rarely | **by hand, to a password manager** — never in an automated backup |

The file store is append-only in practice: 39,281 files, and a delete only happens
when someone removes an attachment. So a nightly incremental sync moves a few
megabytes after the first run.

### Schedule

| Cadence | Action | Retention |
|---|---|---|
| Nightly | `pg_dump -Fc` + incremental file sync to a second host | 30 days |
| Weekly | Full file copy | 8 weeks |
| Monthly | Offsite copy, both | 12 months |
| **Quarterly** | **Restore rehearsal** — see below | — |

The first full copy is 49 GB and will take a while. Every one after it is small.

### The restore rehearsal

The only part of this spec that proves anything:

1. Provision an empty environment.
2. Restore the newest `pg_dump`.
3. Restore the file store.
4. Run `yarn db:verify-files`.
5. **The four integrity classes must match exactly: 8 missing, 7 mangled, 23
   zero-byte, 17 orphan.** Any other numbers mean the backup is lossy.
6. Open five records at random and download every attachment.
7. Record the wall-clock time — that is the recovery time objective, and it should
   be written down rather than discovered during an incident.

Quarterly, and once before cutover (spec 34).

## Implementation

| Path | Action | Note |
|---|---|---|
| `lib/storage/index.ts` | modify | Select the adapter from `STORAGE_ADAPTER` |
| `lib/storage/local-adapter.ts` | modify | Disable dedup in `put()`, or guard `remove()` |
| `lib/storage/s3-adapter.ts` | create *(only if S3 is chosen)* | Presigned URLs minted after the authorization check |
| `scripts/backup/dump-db.sh` \| `.ps1` | create | `pg_dump -Fc`, rotation |
| `scripts/backup/sync-files.sh` \| `.ps1` | create | Incremental, checksum-verified |
| `scripts/legacy/verify-attachments.ts` | modify | The four classes (spec 18) |
| `docs/restore.md` | create | The rehearsal, step by step, with expected numbers |

CLAUDE.md flags `db:verify-files` as touching real data. It stays **read-only** —
it reports and never repairs. The repair script is spec 18's and separate.

## Verification

```bash
# 1. The store, as it stands.
find nextjs_space/storage-local/attachments -maxdepth 1 -type f | wc -l   # 39281
du -sh nextjs_space/storage-local/attachments                             # 49G
find nextjs_space/storage-local/attachments -maxdepth 1 -type f -size 0 | wc -l  # 24

# 2. It is not in git and never will be.
git check-ignore -v nextjs_space/storage-local     # expect a .gitignore hit
git ls-files nextjs_space/storage-local | wc -l    # expect 0

# 3. Integrity — the backup's acceptance criteria.
yarn db:verify-files
# expect: 8 missing | 7 mangled | 23 zero-byte | 17 orphan
```

```sql
-- 4. No two rows share a file. Breaks if put() deduplicates.
select count(*) from (
  select "storageKey" from "Attachment" group by 1 having count(*) > 1) d;
-- expected: 0, now and after every release

-- 5. Growth, for capacity planning.
select extract(year from c."registeredAt")::int yr, count(a.id) files
from "Attachment" a join "Contract" c on c.id = a."contractId"
group by 1 order by 1;
-- roughly 3,500/year → ~4.5 GB/year
```

Manual checks:

- [ ] A full restore into an empty environment reproduces **8 / 7 / 23 / 17** exactly
- [ ] Five randomly chosen records have every attachment downloadable after restore
- [ ] The recovery time is measured and written into `docs/restore.md`
- [ ] The nightly database dump runs and the newest one is under 24 hours old
- [ ] The nightly file sync runs and reports the number of files moved
- [ ] Deleting an attachment through the UI removes its file — and does **not**
      remove a file another row still references
- [ ] `.env` is in no automated backup
- [ ] Disk usage is monitored with an alarm below one year of headroom (~5 GB)
- [ ] If S3 is chosen: a presigned URL is only issued after the spec 18
      authorization check, expires within minutes, and the bucket is not public
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Q30 — where do the files live?** Local disk, the Bytom server, or object
   storage. Recommendation is local disk with replication unless Q4 lands somewhere
   that already has S3. **Depends on Q4.**
2. **Q78 — is there an existing institutional backup at Bytom, and does it cover
   these files?** If the 49 GB are already backed up where they came from, the
   question becomes how to keep that arrangement rather than how to build one.
3. **Q79 — what recovery point and recovery time are acceptable?** Nightly backups
   mean up to 24 hours of lost work. For a register that takes a few records a day
   that is probably fine, and it should be a decision rather than a default.
4. **Q80 — should `put()` deduplicate?** Recommend no. It saves little — four
   identical copies among 39,281 files — and it creates a shared-key delete hazard
   that the current zero-duplicates invariant depends on.

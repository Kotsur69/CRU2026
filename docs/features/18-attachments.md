---
id: 18
title: Załączniki (attachments)
group: C-missing-subsystems
status: in-progress
depends-on: [03]
legacy-tables: [attachment]
prisma-models: [Attachment, Contract, Contractor]
routes: ["/umowy/[id]", "/api/attachments", "/api/files/[...key]"]
---

# 18 — Załączniki (attachments)

## Why

The files *are* the register. 39,272 attachment rows against 20,137 live records —
**19,319 of them, 96%, have at least one file** — and 49 GB on disk. Everything else
in this system is metadata describing these documents.

Upload and download already work (`app/api/attachments/route.ts`,
`app/api/files/[...key]/route.ts`, `features/kontrakty/attachments-field.tsx`).
What this spec covers is everything around them that does not: the download route
serves any stored file to any signed-in session without checking which record it
belongs to; 23 files on live records are **zero bytes**; 8 rows point at files that
do not exist; 17 files sit on disk with no row; 7 more are reachable only by
ignoring their extension; and the "Wersja ostateczna" flag is displayed as a boolean
when the data makes it tri-state.

None of that is visible today, because nothing checks.

## Legacy behaviour

### The table

`cru.sql:87`:

```sql
CREATE TABLE IF NOT EXISTS `attachment` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8_polish_ci DEFAULT NULL,
  `path` varchar(100) COLLATE utf8_polish_ci DEFAULT NULL,
  `filetype` varchar(45) COLLATE utf8_polish_ci DEFAULT NULL,
  `version` int(11) DEFAULT NULL,
  `contract_id` int(11) DEFAULT NULL,
  `formsession` varchar(50) COLLATE utf8_polish_ci DEFAULT NULL,
  `contractor_id` int(11) DEFAULT NULL,
  `finally` int(1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FK_attachment_contract` (`contract_id`),
  CONSTRAINT `FK_attachment_contract` FOREIGN KEY (`contract_id`)
    REFERENCES `contract` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=42200;
```

`AUTO_INCREMENT=42200` against 39,272 surviving rows — roughly 2,900 attachments
were deleted over eleven years.

Note what the table does **not** have: no upload date, no uploader, no file size, no
MIME type, no checksum. `filetype` is a free-text `varchar(45)` holding whatever the
uploader's extension was, and one row has `"umowy zlecenia"` in it.

First data row, `cru.sql:105`:

```sql
(1, '2012-0001 AUTO GALERIA - DEKLARACJA WEKSLOWA DO UMOWY 79.11.2011.OP',
    'attachments/2f6c63704c08a502d76526e79f65e032.pdf', 'pdf', 1, 1, NULL, NULL, NULL),
```

`path` is `attachments/<md5>.<ext>` — the original filename never reaches disk, only
`name`. All 39,272 rows match `^attachments/[0-9a-f]{32}\.` exactly, so the scheme
held for eleven years without exception.

### What the audit saw

`audyt §1.4` records, on the contract preview: a file list, **"dodaj plik"**, and a
per-file **"wyślij jako załącznik"** link (`/files/sendattachment/{id}`) that mails
the document. That mail function is **excluded from this project by explicit
instruction** and is not implemented, not proxied, and not linked. It appears here
once, to record that we know it exists and are deliberately not building it.

### The unsaved-form problem

`formsession` solves an ordering problem: a user attaches files to a record that does
not exist yet. Legacy writes the rows with `contract_id = NULL` and a session token,
then binds them when the form saves. `app/api/attachments/route.ts:7-13` already
reproduces this, and its comment says so.

The column was used **23 times**, all in February 2015 (tokens `1421…`–`1422…`, on
contracts 2254–2373), and never again. Either the mechanism was replaced or those
three weeks were when somebody tested it.

## Data

### Totals

| Property | Value |
|---|---|
| Rows | 39,272 |
| Files on disk | **39,281** |
| Total size | **49 GB** |
| Attached to a contract | 39,182 |
| Attached to a contractor | 48 |
| Attached to **neither** | **42** |
| `name` present | 39,272 (all) |
| `path` present | 39,272 (all) |
| `filetype` present | 39,272 (all) |
| `version` present | **2,415 — and every one is `1`** |
| `finally = 1` | 16,602 |
| `finally = 0` | **0 — never explicitly set** |
| `finally` null | 22,670 |
| `formsession` present | **23** |
| Duplicate `path` values | 0 |
| Contracts with ≥1 file | 19,319 of 20,137 |
| Most files on one record | 40 |

`addedAt` is **2026-09-18 on every single row** — the import date. The legacy table
has no upload timestamp, so this is unrecoverable and must never be presented as
"when the file was added" (spec 01 records the same).

### File types

`filetype` is free text, so the distribution is the raw thing users typed:

| Type | Rows | | Type | Rows |
|---|---|---|---|---|
| pdf | 27,249 | | zip | 21 |
| msg | 6,352 | | jpg | 19 |
| docx | 3,158 | | **01** | **15** |
| doc | 1,773 | | DOC | 15 |
| xls | 307 | | rtf | 12 |
| xlsx | 162 | | htm | 12 |
| PDF | 43 | | txt | 8 |
| 7z | 36 | | JPG | 6 |
| odt | 34 | | docm | 5 |
| DOCX | 25 | | oft | 2 |

Plus a long tail: `xlsb` 2, and one each of `MSG`, `PNG`, `XLSX`, `dotx`, `exe`,
`mht`, `12`, and `umowy zlecenia`.

Two observations. **Case is not normalised** — 43 `PDF` next to 27,249 `pdf`, and the
same for DOC/DOCX/JPG/MSG/PNG/XLSX; any grouping or filtering must lowercase.
And **`msg` is the second most common type**: 6,352 Outlook messages. People attach
the e-mail thread as the evidence. A viewer cannot render those, so the UI must make
"download" the obvious action for them rather than "open".

### Size distribution

| Bucket | Files |
|---|---|
| **0 bytes** | **24** |
| < 100 KB | 6,551 |
| 100 KB – 1 MB | 21,004 |
| 1 – 10 MB | 11,174 |
| 10 – 100 MB | 528 |
| > 100 MB | 0 |

Largest: 40.2 MB, 37.9 MB, 35.8 MB, 18.4 MB, 17.1 MB — all PDFs. The current upload
limit is `MAX_BYTES = 100 * 1024 * 1024` (`api/attachments/route.ts:16`), which is
above every historical file, so it needs no change.

### Reconciliation: rows against files

39,272 rows, 39,281 files. Matching by exact path gives 15 rows with no file and 24
files with no row. Matching by md5 stem instead resolves seven of those pairs, and
what is left is the real discrepancy:

| Category | Count |
|---|---|
| Row and file agree exactly | 39,257 |
| **Extension mangled — the file exists under a different suffix** | **7** |
| **Row with no file at all** | **8** |
| **File with no row** | **17** |

**The seven mangled ones**, as they sit on disk against a database that expects
`.pdf`:

| On disk | Row expects |
|---|---|
| `2b85a9772f85670744b8f0da34a29025. prawnej montstal-20151019135437` | `.pdf` |
| `d51713382af4eba711808b43d8bb2fa2. prawnej montstal-20151019135437` | `.pdf` |
| `474fe191681f7cd6784eacf5270b5d3d.A` | `.pdf` |
| `51c33ec4ad9ee4b6bf197745a75b00ee.12` | `.pdf` |
| `68ea926772752536b37b2d30dc737495.UK` | `.pdf` |
| `f1d9c0a7854e980a7e78f21ba1246eb6.10` | `.pdf` |
| `a0c6a8133b0dd823eafde49b5a66f6e5.pdf.filepart` | `.pdf` |

Six are a filename that contained a dot and got split wrongly by whatever produced
the export. The seventh, `.filepart`, is an **interrupted download** — that file is
very likely truncated and needs its bytes checked, not just its name.

**The eight rows with no file** — every one a PDF, clustered in 2021:

| id | name | contract |
|---|---|---|
| 24593 | 2021-0363 MIRBUD | 13193 |
| 24595 | 2021-0365 MIRBUD | 13195 |
| 24744 | Załącznik nr 1 - FUU umowa dostawy konstukcji | 13271 |
| 24745 | KP 062_2021 | 13271 |
| 26557 | setmil-20122021094049 | 14041 |
| 26558 | setmil-20122021094049 | 14041 |
| 26559 | setmil-20122021094049 | 14041 |
| 26562 | AMDS - J_ Czekalski WAT umowa obsługa energet | 14001 |

Three identical names on contract 14041 suggest one upload attempted three times and
failing each time. These eight are either lost in Bytom or lost in the export, and
the difference matters — spec 34 has to ask before cutover.

**The seventeen files with no row**, with sizes:

`11abfba3…pdf` 3.1 MB · `2579205e…pdf` 2.9 MB · `3a762543…pdf` 159 KB ·
`400cdafa…docx` 1.1 MB · `542c6792…msg` 1.8 MB · `628408888…pdf` 159 KB ·
`937b4c87…xlsx` 19 KB · `999d3c1d…pdf` 159 KB · `b09d7dcd…pdf` 573 KB ·
`b0f734dc…pdf` 347 KB · `bb2c7081…pdf` 295 KB · `c1e1462d….11` 448 B ·
`c61b4bc7…pdf` 229 KB · `cbd2261f…pdf` 159 KB · `d1db0792…pdf` 156 KB ·
`d3c219ea…msg` 416 KB · **`test.txt` 0 B**

Four files are exactly 159,493 bytes — the same document stored four times. And
`test.txt` is not an md5 name at all; somebody dropped a file into the directory by
hand.

### The 23 empty files on live records

**24 files are zero bytes, and 23 of them have a database row.** They appear in the
UI as normal attachments, on real contracts, and download as nothing.

Extensions: 10 pdf, 4 doc/docx, 3 txt, 3 msg, plus `test.txt` (the orphan).

This is silent data loss that predates us — legacy accepted a zero-byte upload and
neither system has ever told anyone. It must be surfaced, and `api/attachments`
already refuses `file.size === 0` on new uploads (`route.ts:58`), so only the
historical rows are affected.

### The 42 rows attached to nothing

Neither `contract_id` nor `contractor_id`. Two clusters:

- ids 3727–3731 — `"Nowy dokument tekstowy"`, `"normalna nazwa pliku"`: test uploads
  from 2015, the same batch as the two contractor-level test rows on "TEST MARCN".
- ids 21735–21742 and beyond — real-looking documents: `POLAQUA_zamówienie`,
  `Liberty_3100452231`, `Mosty Łódź`, `Porozumienie INTOP_ArcelorMittal`. These are
  abandoned form sessions: files uploaded into a record that was never saved.

The upload route's comment predicts exactly this (`api/attachments/route.ts:7-13`)
and puts the figure at 90; the live count is 42. Both counts are right for what they
measured — 90 includes the contractor-attached rows and the pre-binding states in the
dump; 42 is the strict "no parent at all" figure in Postgres today. Use 42.

### Contractor-level attachments

48 rows hang off a `Contractor` rather than a contract — mostly `RP_<number>_…pdf`,
which is the filename pattern of a **KRS/CEIDG extract** (*odpis z rejestru
przedsiębiorców*). Two are the 2015 test rows on "TEST MARCN" (contractor 1200).

So the feature is real and narrow: registry documents proving who the counterparty
is, filed against the counterparty. Spec 20 owns the Kontrahenci screen; this spec
owns the storage and access rules that apply to those 48 files too.

### `finally` / "Wersja ostateczna"

| State | Rows |
|---|---|
| 1 | 16,602 |
| null | 22,670 |
| **0** | **0** |

Never once set to 0. So the column has two used states, not three, and "null" means
"nobody marked it", not "explicitly not final".

By type, the flag is overwhelmingly about PDFs:

| Type | Rows | Final |
|---|---|---|
| pdf | 27,249 | 15,392 (56%) |
| msg | 6,352 | 257 (4%) |
| docx | 3,158 | 500 (16%) |
| doc | 1,773 | 366 (21%) |
| xls | 307 | 10 |
| xlsx | 162 | 26 |

Which is what one would expect: the signed scan is final; the e-mail thread and the
working draft are not.

## Legacy quirks

### Quirk: the download route does not check which record the file belongs to

- **Current:** `app/api/files/[...key]/route.ts:11-14` checks only that a session
  exists, then serves any key the storage adapter resolves. There is no lookup of the
  `Attachment` row and no check of the contract behind it.
- **Why it is wrong:** an md5 key is unguessable, so this is not trivially
  exploitable — but it is an authorization hole by construction, and once spec 03
  lands, a user with no right to see contract X can still fetch its files given a key
  from anywhere (a copied link, a shared screenshot, a log line, the `/api/attachments`
  response of an earlier session).
- **We do:** resolve the key to an `Attachment` first, `404` when there is no row,
  then check the parent — `canReadContract(actor, att.contractId)` for a contract
  file, and read access to Kontrahenci for a contractor file. The 42 parentless rows
  are admin-only. **404, never 403**, matching spec 03: a 403 confirms the file
  exists.
- **Sign-off:** not needed. This is a security fix.

### Quirk: 23 attachments on live records are zero bytes

- **Data:** 24 zero-byte files, 23 of them with a row.
- **Why it matters:** the document is gone and the register says it is there. In a
  legal register that is the worst failure mode available — worse than a missing row,
  because nobody goes looking.
- **We do:** `yarn db:verify-files` grows a size check and reports them. In the UI a
  zero-byte attachment renders with a `danger` badge **"plik pusty (0 B)"** and its
  download link is disabled. Do not delete the rows: the name records what the
  document was supposed to be, which is the only surviving evidence.
- **Sign-off:** not needed for surfacing. Recovering the files is a question for
  Bytom (Q27).

### Quirk: seven files are reachable only by ignoring their extension

- **Data:** the seven stems listed above.
- **Why it matters:** `storage.exists(key)` is false for all seven, so those seven
  attachments 404 today while the bytes sit on disk.
- **We do:** a one-off repair script that, for each row whose exact path is missing,
  looks for `<stem>.*` in the storage root; when exactly one candidate exists, renames
  it to the path the database expects. Seven renames, logged. The `.filepart` one is
  additionally checked for a valid PDF header before being accepted — an interrupted
  download may be truncated, and a half file that opens is worse than one that does
  not.
- **Sign-off:** not needed. It is a rename to match the database, with a log.

### Quirk: `version` is set on 2,415 rows and is always 1

- **Legacy:** `version int(11) DEFAULT NULL`. 36,857 nulls, 2,415 ones, no other
  value in eleven years.
- **Why it matters:** the column promises file versioning. There is none, and there
  never was. Nobody should build a version history UI on it.
- **We do:** keep the column for fidelity, never display it, never write it. The
  Prisma doc comment says it is dead.
- **Sign-off:** not needed.

### Quirk: `finally` is displayed as a boolean but means three things

- **Legacy:** 16,602 ones, 22,670 nulls, **zero** explicit zeroes.
- **Current:** `Attachment.isFinal Boolean @default(false)` collapses null into
  false, so 22,670 files read as "explicitly not the final version" when the truth is
  "nobody said".
- **Why it matters:** "Wersja ostateczna: NIE" on a signed contract scan that simply
  predates the checkbox is a factual claim the data does not support.
- **We do:** render only the positive. A final file gets a **"Wersja ostateczna"**
  badge; everything else gets nothing. New uploads set the flag explicitly, so the
  ambiguity stops growing. Changing the column to `Boolean?` is cleaner but touches
  the importer and buys little — revisit only if a filter on "explicitly not final"
  is ever asked for.
- **Sign-off:** not needed.

### Quirk: `filetype` is free text and one row holds an executable

- **Data:** 14 values outside the expected set, including `"umowy zlecenia"`,
  `"01"` (15 rows), `"12"`, and **`exe`** — attachment 10554, `"firefox"`, on
  contract 6787, stored as `attachments/eca2ea56…exe`.
- **Why it matters:** one user attached a browser installer to a contract. The
  current upload route already refuses it — `ALLOWED_EXTENSIONS`
  (`api/attachments/route.ts:22-26`) is an allowlist and `exe` is not on it — so no
  new one can arrive. But the historical row is downloadable, and
  `/api/files/[...key]` serves it with a `Content-Disposition: inline`
  (`route.ts:35`) and a MIME type from `storage.stat`.
- **We do:** three things. Serve **every** attachment as
  `Content-Disposition: attachment`, not `inline`, except for `pdf` and images, which
  are the only types a browser should render in place. Send
  `X-Content-Type-Options: nosniff`. And exclude `exe`, `mht`, `htm` and `html` from
  inline rendering explicitly — the 15 `.htm`/`.html`/`.mht` rows are saved e-mail
  threads and rendering someone's saved HTML inline on our origin is a stored-XSS
  path.
- **Sign-off:** not needed. Security fix.

### Quirk: the case of the extension is not normalised

- **Data:** `PDF` 43, `DOCX` 25, `DOC` 15, `JPG` 6, `MSG` 1, `PNG` 1, `XLSX` 1.
- **We do:** lowercase `fileType` on read for every grouping, filter and icon
  lookup; do not rewrite the stored values, because they are what legacy holds and
  the reconciliation in spec 34 compares them.
- **Sign-off:** not needed.

### Quirk: `addedAt` is the import date on all 39,272 rows

- **Legacy:** the table has no timestamp column at all.
- **We do:** never label it "dodano". Spec 01 adds `addedAtEstimated Boolean` and
  this spec honours it: imported files show **"data nieznana (import)"** and only
  files we receive show a real date. Never sort a file list by `addedAt` — sort by
  `isFinal DESC, id ASC`, which at least reflects upload order within a record.
- **Sign-off:** not needed.

### Quirk: "wyślij jako załącznik" is excluded

- **Legacy:** `/files/sendattachment/{id}` mails the document from the record
  (`audyt §1.4`).
- **We do:** **nothing.** Excluded by explicit instruction. Not implemented, not
  linked, not proxied. Recorded here only so a future reader does not find it in the
  audit and assume it was overlooked.
- **Sign-off:** already given — it is the instruction.

## UI

### The file list on a record

Inside the shared `Section` (spec 05), title **"Załączniki"** with the count.
Ordered `isFinal DESC, id ASC`. Each row:

| Element | Content |
|---|---|
| Icon | By lowercased `fileType` — pdf / word / excel / mail / archive / image / generic |
| Name | `name`, the download link |
| Type · size | e.g. "PDF · 1,2 MB"; size read from storage, not stored |
| Final | `Badge` "Wersja ostateczna" when set; nothing otherwise |
| State | `Badge danger` "plik pusty (0 B)" or "brak pliku" when verification failed |
| Actions | "Pobierz"; "Usuń" for someone who can edit the record |

Empty state: **"Brak załączników."** Above the list, when the actor can edit:
**"dodaj plik"** — legacy's exact wording (`audyt §1.4`).

### Upload

`features/kontrakty/attachments-field.tsx` already handles it, including the
form-session case. Two additions:

- A **"Wersja ostateczna"** checkbox per file, so `isFinal` starts being set
  deliberately rather than inherited from an import.
- Client-side rejection of a zero-byte file with a message, before the request — the
  server already refuses it, but the round trip on a 40 MB timeout is unpleasant.

### Download

`GET /api/files/[...key]` keeps its shape and gains the authorization check, the
`attachment` disposition and `nosniff`. Inline stays only for `pdf`, `jpg`, `jpeg`
and `png`.

### Contractor attachments

The same list component on `/kontrahenci/[id]`, title "Dokumenty rejestrowe" —
that is what the 48 files are. Spec 20 mounts it.

## Implementation

### Files

| Path | Action | Note |
|---|---|---|
| `app/api/files/[...key]/route.ts` | modify | Resolve the row, check the parent, 404 on refusal, `attachment` disposition, `nosniff` |
| `app/api/attachments/route.ts` | modify | Accept and store `isFinal` |
| `components/ui/attachment-list.tsx` | create | Shared by the record and the contractor screens |
| `features/kontrakty/attachments-field.tsx` | modify | "Wersja ostateczna" checkbox, zero-byte guard |
| `lib/attachments.ts` | create | `fileKind(fileType)`, `isInlineRenderable(fileType)`, `formatBytes` |
| `scripts/legacy/repair-attachment-paths.ts` | create | The seven renames, with a PDF-header check on `.filepart` |
| `scripts/verify-files.ts` | modify | Report zero-byte, missing and orphan files as three separate classes |

### Authorization

| Operation | Rule |
|---|---|
| List on a record | Whoever can read the record (spec 03) |
| Download | Same, resolved through the `Attachment` row |
| Upload to a record | `canEditContract` |
| Upload with a form session (no record yet) | `requireActor` — nothing exists to check |
| Delete | `canEditContract`, or admin |
| Parentless rows (42) | Admin only |

### `verify-files`

The script is named in CLAUDE.md as touching real data, so it stays read-only and
reports. Four classes, each with a count and a list:

1. Rows whose file is missing entirely — expect **8**
2. Rows whose file exists under a mangled name — expect **7**, and **0** after the
   repair script runs
3. Rows whose file is zero bytes — expect **23**
4. Files on disk with no row — expect **17**

It becomes a cutover gate in spec 34: the numbers must match, or the export is
incomplete.

## Verification

```sql
-- 1. Baseline.
select count(*) rows, count("contractId") on_contract, count("contractorId") on_contractor,
       count(*) filter (where "contractId" is null and "contractorId" is null) parentless,
       count("version") versioned, max(version) maxv,
       count(*) filter (where "isFinal") final, count("formSession") sessions
from "Attachment";
-- expected: 39272 | 39182 | 48 | 42 | 2415 | 1 | 16602 | 23

-- 2. Every path follows the md5 scheme.
select count(*) from "Attachment" where "storageKey" !~ '^attachments/[0-9a-f]{32}\.';
-- expected: 0

-- 3. No two rows share a file.
select count(*) from (select "storageKey" from "Attachment" group by 1 having count(*) > 1) q;
-- expected: 0

-- 4. Coverage.
select count(distinct "contractId") from "Attachment" where "contractId" is not null;
-- expected: 19319   (of 20137 live contracts)

-- 5. `finally` was never set to 0 — the tri-state claim.
select count(*) filter (where "isFinal") final, count(*) filter (where not "isFinal") rest
from "Attachment";
-- expected: 16602 | 22670   and in the legacy dump: 16602 ones, 22670 NULLs, zero 0s

-- 6. The executable is the only one of its kind.
select count(*) from "Attachment" where lower("fileType") = 'exe';
-- expected: 1   (id 10554, contract 6787)
```

Shell reconciliation, run from the repo root:

```bash
psql -U cru -d cru2026 -A -t \
  -c "select replace(\"storageKey\",'attachments/','') from \"Attachment\"" \
  | tr -d '\r' | sed '/^$/d' | LC_ALL=C sort > /tmp/db.txt
ls -1 nextjs_space/storage-local/attachments | LC_ALL=C sort > /tmp/disk.txt

wc -l /tmp/db.txt /tmp/disk.txt          # expect 39272 and 39281
comm -23 /tmp/db.txt /tmp/disk.txt | wc -l   # rows with no file at this path: 15
comm -13 /tmp/db.txt /tmp/disk.txt | wc -l   # files with no row at this path: 24

# Stem-level: 7 mangled, 8 truly missing, 17 truly orphan
find nextjs_space/storage-local/attachments -maxdepth 1 -type f -size 0 | wc -l   # 24
```

Manual checks:

- [ ] Sign in as a user with no access to contract X (spec 03) and request one of its
      file keys directly — **404**, not the file and not a 403
- [ ] Request a key that matches no row — 404
- [ ] Download attachment 10554 (`firefox`, `exe`) — arrives as a download, never
      rendered, with `nosniff`
- [ ] Open one of the 15 `.htm`/`.mht` rows — downloads, does not render on our origin
- [ ] A PDF still opens inline
- [ ] One of the 23 zero-byte attachments shows "plik pusty (0 B)" with the download
      disabled
- [ ] After `repair-attachment-paths`, all seven mangled files download correctly and
      `verify-files` reports class 2 as 0
- [ ] The `.filepart` file is checked for a PDF header and either repaired or reported,
      not silently renamed
- [ ] Upload a file with "Wersja ostateczna" ticked — the badge appears immediately
- [ ] Upload a zero-byte file — rejected client-side, no request sent
- [ ] Upload to an unsaved form, then save — the file binds to the new record; abandon
      instead and it stays parentless, visible to admins only
- [ ] No file list is sorted by `addedAt`, and no screen labels it "dodano"
- [ ] `grep -rn "sendattachment" nextjs_space` returns nothing
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Q27 — can Bytom recover the 8 missing files and the 23 empty ones?** 31
   documents on 27 real contracts. If the originals exist on the legacy server, one
   re-export fixes them. If they were already empty there, the loss predates us and
   should be recorded in the cutover report rather than chased.
2. **Q28 — what are the 17 orphan files?** Four are byte-identical at 159,493 bytes.
   One is `test.txt`, 0 bytes, not even an md5 name. If they are deleted attachments
   whose rows went with them (2,900 ids are missing from the sequence), they are
   recoverable evidence; if they are upload residue, they are 10 MB of rubbish to
   sweep. Recommend keeping them until cutover is signed off.
3. **Q29 — should `isFinal` become `Boolean?`** Proposal is no, on the grounds that
   no legacy row is explicitly 0 so nothing is lost by treating null as false, and
   the UI only ever shows the positive. Revisit if anyone wants to filter on
   "explicitly not final".
4. **Q30 — where do the files live in production?** 49 GB, growing by roughly 3,500
   files a year. Local disk, the Bytom server, SharePoint or S3 — that is spec 32,
   and it blocks on Q4 (where production runs).

## Implementation notes (2026-09-24)

**Status: in progress** — committed mid-work.

Built and typechecked:

- `lib/attachments.ts` (+ tests): `fileKind`, `isInlineRenderable` (PDF and images
  only), `formatBytes`, `contentDisposition` (UTF-8 filename with an ASCII fallback).
- `lib/authz.ts` → `canReadContract`: the single hook spec 03 will tighten. Today any
  signed-in user reads live records; soft-deleted records are admin-only.
- `GET /api/files/[...key]`: resolves key → `Attachment` row(s) → parent. Contract
  files need `canReadContract`, contractor files need a session, draft uploads need
  their `formSession` token, parentless rows are admin-only. Refusal is 404. Served
  as `attachment` except PDF and images, with `X-Content-Type-Options: nosniff`.
- `POST /api/attachments` stores `isFinal`, and a draft's link carries its token.
- `components/ui/attachment-list.tsx`: icon, type and size from storage, a
  "Wersja ostateczna" badge, "plik pusty (0 B)" / "brak pliku" badges with the
  download disabled, "data nieznana (import)" for imported rows. Mounted on the
  record preview with "dodaj plik" (+ "Wersja ostateczna") and "Usuń" for editors
  (`features/kontrakty/attachment-controls.tsx`).
- A zero-byte guard in the form's upload field.

Not done yet:

- `scripts/legacy/repair-attachment-paths.ts` (the seven renames).
- The zero-byte class in `yarn db:verify-files`.
- Browser verification of the new list, upload and delete.
- Mounting the list on `/kontrahenci/[id]` as "Dokumenty rejestrowe" (after spec 20
  merges).

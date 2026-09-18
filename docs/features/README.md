# CRU2026 — Feature specifications

One document per feature. Each is written to be implemented in a single session
without going back to `cru.sql` or the legacy audit to re-derive anything.

- **Language:** English prose. Polish UI labels, field names and status names are
  quoted verbatim, including legacy misspellings.
- **Status:** tracked in each file's `status:` frontmatter and mirrored in the table
  below. Files are never renamed. `grep -rl "status: done" docs/features/` lists
  finished work.
- **Template:** [`00-TEMPLATE.md`](00-TEMPLATE.md). Copy it; keep the section order.

Strategy lives elsewhere and is not replaced by these documents:
[`../../plan.md`](../../plan.md) (direction and architecture),
[`../../status_projektu.md`](../../status_projektu.md) (chronology),
[`../../historia_wersji/audyt_legacy_strony.md`](../../historia_wersji/audyt_legacy_strony.md)
(the only record of the legacy UI).

## Status legend

`todo` · `in-progress` · `done`

## A. Foundations

Everything else depends on these. Build in order.

| # | Spec | Status | Depends on |
|---|---|---|---|
| 01 | [Data-model gaps and re-import](01-data-model-gaps.md) | todo | — |
| 02 | [Identifier grammar and numbering](02-identifier-grammar.md) | todo | 01 |
| 03 | [Read authorization](03-read-authorization.md) | todo | 01 |
| 04 | [Identity and directory](04-identity-directory.md) | todo | — |
| 05 | [Shared UI consolidation](05-shared-ui.md) | todo | — |

## B. Registers and the contract record

| # | Spec | Status | Depends on |
|---|---|---|---|
| 06 | [Umowy register](06-umowy-register.md) | todo | 03, 05 |
| 07 | [Projekty register](07-projekty-register.md) | todo | 03, 05 |
| 08 | [Dział ryzyka register](08-ryzyko-register.md) | todo | 03, 05 |
| 09 | [Contract detail](09-contract-detail.md) | todo | 05 |
| 10 | [Contract form](10-contract-form.md) | todo | 01, 02 |
| 11 | [Annexes](11-annexes.md) | todo | 02, 10 |
| 12 | [Multi-location](12-multi-location.md) | todo | 03, 10 |

## C. Missing subsystems

Data is imported and complete; there is no UI at all.

| # | Spec | Status | Depends on |
|---|---|---|---|
| 13 | [Historia zmian (change log)](13-change-history.md) | todo | 01 |
| 14 | [Notatki (notes)](14-notes.md) | todo | — |
| 15 | [Powiadomienia (inbox)](15-notifications.md) | todo | 14 |
| 16 | [Obieg opinii (FAU workflow)](16-opinion-workflow.md) | todo | 01, 15 |
| 17 | [Formularz akceptacji / MDR](17-acceptance-form.md) | todo | 16 |
| 18 | [Załączniki (attachments)](18-attachments.md) | todo | 03 |
| 19 | [Auto-close and expiry](19-auto-close.md) | todo | 01 |

## D. Supporting modules

| # | Spec | Status | Depends on |
|---|---|---|---|
| 20 | [Kontrahenci](20-kontrahenci.md) | todo | 05 |
| 21 | [Grupy](21-grupy.md) | todo | 03, 04 |
| 22 | [Lokalizacje](22-lokalizacje.md) | todo | 03 |
| 23 | [Dostępy](23-dostepy.md) | todo | 03, 04 |
| 24 | [Raporty](24-raporty.md) | todo | 28 |
| 25 | [Mailing](25-mailing.md) | todo | 29 |
| 26 | [Supply chain (discovery)](26-supply-chain.md) | todo | — |

## E. Planned new features

Not in legacy. Scheduled after parity is proven.

| # | Spec | Status | Depends on |
|---|---|---|---|
| 27 | [Adobe Acrobat Sign](27-adobe-sign.md) | todo | 18, 31 |
| 28 | [Exports](28-exports.md) | todo | 05 |
| 29 | [Deadline reminders](29-reminders.md) | todo | 19 |
| 30 | [REGON/GUS lookup](30-regon-gus.md) | todo | 20 |

## F. Delivery

| # | Spec | Status | Depends on |
|---|---|---|---|
| 31 | [Deployment and ops](31-deployment.md) | todo | — |
| 32 | [Storage and backup](32-storage-backup.md) | todo | 18 |
| 33 | [Testing and CI](33-testing.md) | todo | 31 |
| 34 | [Cutover](34-cutover.md) | todo | all |

---

## Evidence rules

Every factual claim in a spec cites one of five sources:

| Source | How to read it | Citation form |
|---|---|---|
| `cru.sql` (45.7 MB) | `grep -n` for offsets, then `sed -n 'A,Bp'`. **Never read whole.** | `cru.sql:447511` |
| Live `cru2026` database | `psql` via the Bash tool, `PGCLIENTENCODING=UTF8` | query included in Verification |
| `audyt_legacy_strony.md` | The only record of the legacy UI, and only for Umowy and Projekty | `audyt §1.4` |
| `nextjs_space/storage-local/attachments/` | 39,281 files, 49 GB | file counts |
| Current codebase | | `path:line` |

Anything else is labelled `[INFERRED]` or `[UNKNOWN — ask Mati]`.

**Eight of the ten legacy modules were never observed running.** The auditor's
account was denied access to Dział ryzyka, Supply chain, Kontrahenci, Grupy,
Lokalizacje, Dostępy, Raporty and Mailing. Their specs are schema-derived and say so
at the top. Only Umowy and Projekty have observed UI behaviour behind them.

## Legacy spellings preserved verbatim

These are not typos in our documents. They are what the old system shows, and the
legal department reads them every day.

| As legacy writes it | Where | Correct Polish would be |
|---|---|---|
| `Buissnesline` / `buissnesline` | column header, filter name, legacy table name | Businessline |
| `Informatyka/Telenformatyka` | `Domain` id 5 | Teleinformatyka |
| `tylko OBSSC` | filter checkbox on the Umowy list | OBSC |
| `Podmiot powiązane` | detail field and filter | Podmioty powiązane |
| `Project` | detail field label inside an otherwise Polish screen | Projekt |
| `Zakupy - materiały handlowych` | `Domain` id 27 | materiałów |

Not preserved: the legacy PL/EN language switch sends both links to `?lang=en`.
That bug is explicitly not reproduced.

---

## Consolidated open questions

Every `[UNKNOWN]` and every quirk needing sign-off, collected so there is one list
to answer. Kept in sync as specs are written.

### Blocking

| # | Question | Blocks | Who answers |
|---|---|---|---|
| Q1 | Export of the `am_admin` user directory (id, login, first name, surname, e-mail, status). Without it every user is a placeholder named `legacy-<id>` and only the service account can sign in. | 04, 21, 23 and all of cutover | Bytom admins |
| Q2 | Adobe Acrobat Sign account with API access (business/enterprise, OAuth S2S) plus a sandbox — a paid prerequisite, still unconfirmed. | 27 | Mati / procurement |
| Q3 | Signature level with the legal department: ordinary eIDAS e-signature or qualified (QES). | 27 | Legal department |
| Q4 | Where production runs — internal Katowice server or the Bytom server. | 31, 32 | Mati |

### Behaviour changes needing sign-off

| # | Question | Spec |
|---|---|---|
| Q5 | Notifications: legacy fans every one out to **all admins** regardless of the contract (`cru.sql:447494`). Proposal is to notify contract owners and reviewers instead. | 15 |
| Q6 | Access dimension 6 ("document type") filters by `notice_period_id` in legacy — a live bug, currently dormant because nobody holds that grant. Fix or reproduce? | 03 |
| Q7 | The creator of a new record is auto-added as owner with edit rights. Legacy's form has no owner field, but without this the record is admin-only after save. | 10 |
| Q18 | **Is `contract_users` a visibility list, or only an ownership and edit-rights list?** One user holds an editor grant on 17,035 of 20,626 contracts, which looks like a workaround for a "you only see what you are assigned to" rule. The answer changes the whole read-authorization design. | 03 |

### Semantics to confirm with a legacy user

| # | Question | Spec |
|---|---|---|
| Q8 | `contract.bill` — 544 records set, 472 audited toggles, so it is a live checkbox. Meaning unconfirmed ("faktura"? "rozliczane fakturą"?). | 10 |
| Q9 | `contract.OBSC` / `descOBSC` — 499 records, an ArcelorMittal internal acronym. What compliance check is it? | 10 |
| Q10 | `contract.temp_form` — 9,113 set, 10,948 audited changes. "Umowa tymczasowa"? | 10 |
| Q11 | The 39 records with `project = 3`, no status, businessline 9 (which does not exist) and the only four `accept = 1` values. An abandoned 2021 experiment, all soft-deleted. Keep, purge or migrate? | 01 |
| Q12 | Access dimensions 6 (document type), 7 (trade) and 8 (related entity) have **zero** grants in the data. Build them at all? | 03, 23 |
| Q13 | `identifier2` on the Projekty search form — the audit could not determine what it filters. | 07 |
| Q14 | The notes iframe is titled "System Zarządzania Ofertami", suggesting `remarks` is shared with a separate quotation system. Is it? | 14 |
| Q15 | Did the MySQL event scheduler actually run? If not, the 2,372 contracts still "Obowiązująca" include expired ones that legacy should have closed. | 19 |
| Q16 | Supply chain: no table in the dump, no observed UI, three groups reference it. What is it? | 26 |
| Q17 | Where does "zadaj pytanie" send the question in legacy — e-mail or an internal thread? | 14 |

### Deliberate exclusions, confirmed

- **"wyślij jako załącznik"** (`/files/sendattachment/{id}`) — mails the contract
  file. Mati asked explicitly that it not be touched. Excluded everywhere.
- **`/admin` ("W.B. Projekt")** — the vendor's own application with its own login.
  Out of scope.
- **The Polish government Centralny Rejestr Umów** — unrelated to this system,
  repeatedly out of scope.

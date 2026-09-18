# CRU2026 — Feature specifications

One document per feature. Each is written to be implemented in a single session
without going back to `cru.sql` or the legacy audit to re-derive anything.

- **Language:** English prose. Polish UI labels, field names and status names are
  quoted verbatim, including legacy misspellings.
- **Status:** tracked in each file's `status:` frontmatter and mirrored in the table
  below. Files are never renamed. `grep -rl "status: done" docs/features/` lists
  finished work.
- **Template:** [`00-TEMPLATE.md`](00-TEMPLATE.md). Copy it; keep the section order.
- **Written so far:** 01–08 and 13–19. A link below that does not
  resolve is a spec not yet written. `status:` tracks *implementation*, not whether
  the document exists.

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
| Q4 | Where production runs — internal Katowice server or the Bytom server. Two later questions hang off it: **Q30** where the 49 GB of files live (spec 32) and **Q32** what runs the nightly auto-close job, which needs a "has not run in 48 h" alarm because its failure mode is silence (spec 19). | 19, 31, 32 | Mati |

### Behaviour changes needing sign-off

| # | Question | Spec |
|---|---|---|
| Q5 | Notifications: legacy fans every one out to **all admins** regardless of the contract (`cru.sql:447494`). Proposal is to notify contract owners and reviewers instead. | 15 |
| Q6 | Access dimension 6 ("document type") filters by `notice_period_id` in legacy — a live bug, currently dormant because nobody holds that grant. Fix or reproduce? | 03 |
| Q7 | The creator of a new record is auto-added as owner with edit rights. Legacy's form has no owner field, but without this the record is admin-only after save. | 10 |
| Q19 | Who may **start** an opinion round? Proposal is `canEditContract`. In legacy a handful of people ran every round — the top three coordinators account for 6,545 of 8,192 recorded assignments — so an explicit entitlement is the alternative. | 16 |
| Q18 | **Is `contract_users` a visibility list, or only an ownership and edit-rights list?** One user holds an editor grant on 17,035 of 20,626 contracts, which looks like a workaround for a "you only see what you are assigned to" rule. The answer changes the whole read-authorization design. | 03 |
| Q20 | Should closing a record close its open opinion requests? Legacy left **2,891** hanging on finished projects. Proposal: no, matching legacy, with the ageing report defaulting to open records only. | 16 |
| Q23 | **Is `acceptance_form` genuinely dead?** Two rows ever inserted, one surviving, April 2020, replaced within the month by flags on the owner's opinion. Proposal is to freeze the screen read-only. If the legal department wants the four-step checklist revived, that is a new build. | 17 |
| Q24 | Should the MDR declaration become **mandatory** on the contract owner's answer? Today 485 owner opinions cannot distinguish "MDR applies" from "nobody looked". Making it required changes the form for 343 contract owners. | 17 |
| Q31 | **May we close the 173-contract auto-close backlog?** 32 expired before the legacy job existed, 141 were missed by it; three have been reported as in force since 2015. A reviewed, one-off bulk change to legal records. | 19 |

### Semantics to confirm with a legacy user

| # | Question | Spec |
|---|---|---|
| Q8 | `contract.bill` — 544 records set, 472 audited toggles, so it is a live checkbox. Meaning unconfirmed ("faktura"? "rozliczane fakturą"?). | 10 |
| Q9 | `contract.OBSC` / `descOBSC` — 499 records, an ArcelorMittal internal acronym. What compliance check is it? | 10 |
| Q10 | `contract.temp_form` — 9,113 set, 10,948 audited changes. "Umowa tymczasowa"? | 10 |
| Q11 | The 39 records with `project = 3`, no status, businessline 9 (which does not exist) and the only four `accept = 1` values. An abandoned 2021 experiment, all soft-deleted. Keep, purge or migrate? | 01 |
| Q12 | Access dimensions 6 (document type), 7 (trade) and 8 (related entity) have **zero** grants in the data. Build them at all? | 03, 23 |
| Q13 | `identifier2` on the Projekty search form. **Spec 07 has a hypothesis:** it matches the *resulting contract's* identifier — 7,013 projects have a differently-numbered contract as their parent, and nothing else explains a second identifier box on this register alone. One search by a legacy user confirms or denies it. | 07 |
| Q34 | What does the legacy "Data zakończenia" filter do — upper bound, exact match or lower bound? We implement an upper bound. | 06 |
| Q35 | Were the legacy list headers sortable, and what was the default order? We sort newest first. Matters most on Projekty, where 78% is in one terminal status. | 06, 07, 08 |
| Q36 | **Is there a real legacy column chooser?** `lib/umowy-columns.ts` claims one behind a right-click; the audit records twelve columns and no panel, and ten of the extra thirteen are *preview* fields. | 06 |
| Q37 | The **31 status-less projects** (ids 13522–17486, 2021-09 → 2023-09) — should they be given a status? Related to Q11. | 06, 07 |
| Q38 | Should a project show the contract it became? 7,013 of 9,027 have one, and legacy only shows the reverse direction. | 07 |
| Q39 | `plan.md` says "half the register is annexes, 10,167 of 20,137". **It is wrong** — 3,043 are annexes, 7,124 are project→contract links. Correct it at the source? | 07 |
| Q40 | **What does `debtor_id` mean on a contract?** 8,964 contracts and 5,037 projects carry a debtor distinct from the counterparty — 20× the risk module's usage — and it is displayed nowhere outside `/ryzyko`. The largest unexplained column left in the schema. | 08 |
| Q41 | Should risk records have a "Przedmiot"? None of the 406 does; we propose dropping the column and the filter. | 08 |
| Q42 | **A screenshot of the legacy `/risk` list** would convert spec 08 from inferred to observed — real columns, real filters, real sort. Same request covers Supply chain. | 08, 26 |
| Q43 | Three risk records contradict their own identifier (`2020/C/0003`, `2022/C/0002`, one `P`, all filed as Ugoda), and the Cesja domain has zero records. Is the letter the domain? | 08 |
| Q44 | Should the risk amount be sortable? It is the organising fact of that module; no other register has sorting. | 08 |
| Q14 | The notes iframe is titled "System Zarządzania Ofertami", suggesting `remarks` is shared with a separate quotation system. Is it? | 14 |
| ~~Q15~~ | ~~Did the MySQL event scheduler actually run?~~ **Answered by spec 19.** Yes — the event was `ENABLE` at export and 4,596 contracts reached "Zakończona" with no audit trail. The leak is 141 records the job missed, plus 32 that predate it, not thousands. | 19 |
| Q21 | Is opinion type 3 "Dyrektor Klastra" broken? 2,264 of 2,615 requests unanswered, and 2,545 of them addressed to non-members of the two-person group. It will dominate any ageing report. | 16 |
| Q22 | Does "wysłane do podpisu" (`date_send`, 3,750 records; status 7) belong to the opinion workflow or to the e-signature integration? | 16, 27 |
| Q25 | What happens after an owner declares that MDR **does** apply? 44 records reached `form_ver` and 52 `send_ver`, and nothing in the schema records an NSP number, a filing date or a document. | 17 |
| Q26 | Can anyone in Bytom produce a **printed FAU** from the legacy system? One photograph turns our invented print layout into a faithful reproduction. | 17 |
| Q27 | Can Bytom recover the **8 missing attachment files and the 23 zero-byte ones**? 31 documents on 27 real contracts. If they were already empty in legacy, the loss predates us and belongs in the cutover report. | 18 |
| Q28 | What are the **17 orphan files** on disk? Four are byte-identical at 159,493 bytes; one is a hand-dropped `test.txt`. Deleted attachments or upload residue? | 18 |
| Q16 | Supply chain: no table in the dump, no observed UI, three groups reference it. What is it? | 26 |
| Q17 | Where does "zadaj pytanie" send the question in legacy — e-mail or an internal thread? | 14 |
| Q29 | Should `Attachment.isFinal` become `Boolean?` Legacy has 16,602 ones, 22,670 nulls and **zero** explicit zeroes, so nothing is lost by treating null as false as long as the UI only shows the positive. Proposal: leave it. | 18 |
| Q33 | Should an expiring contract notify anyone? Legacy never did. 41 contracts fall inside a 90-day window today, and the data supports it (`dateEnd` + `NoticePeriod`). Needs SMTP, which does not exist anywhere in the codebase. | 19, 29 |

### Deliberate exclusions, confirmed

- **"wyślij jako załącznik"** (`/files/sendattachment/{id}`) — mails the contract
  file. Mati asked explicitly that it not be touched. Excluded everywhere.
- **`/admin` ("W.B. Projekt")** — the vendor's own application with its own login.
  Out of scope.
- **The Polish government Centralny Rejestr Umów** — unrelated to this system,
  repeatedly out of scope.

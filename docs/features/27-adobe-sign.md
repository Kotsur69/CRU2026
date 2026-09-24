---
id: 27
title: Adobe Acrobat Sign
group: E-planned
status: todo
depends-on: [18, 31]
legacy-tables: []
prisma-models: [Contract, Attachment, SignatureRequest, SignatureRecipient]
routes: ["/umowy/[id]/podpis", "/api/adobe/webhook"]
---

# 27 — Adobe Acrobat Sign

> **Where we stand (2026-09-24): not started.** Nothing in this spec is built yet.
>
> - **Waiting on:**
>   - **Q2**: a paid Acrobat Sign account with API access and a sandbox;
>   - **Q3**: which signature level;
>   - Q22.
> - **Depends on:** spec 18 (attachments, partly done) and spec 31 (deployment).
> - **Next step:** Q2 and Q3.

## Why

This is not a parity feature. `plan.md:17` makes it the project's **second,
co-equal goal**:

> *"masowe elektroniczne podpisywanie umów przez Adobe Acrobat Sign. Umowa idzie w
> chmurze do podpisu przez kolejne «ważne osoby» (multi-signer, podpis prawnie
> honorowany), bez pobierania pliku na komputer podpisującego — podpis na stronie w
> przeglądarce. Po skompletowaniu podpisów podpisany PDF wraca do naszego storage."*

Legacy has nothing comparable. Spec 16 establishes the point precisely: the
`opinions` table has a `signature` column and it is **0 on all 16,531 rows** — the
capability was modelled and never used. Signing happened on paper, and the scan
came back as an attachment.

Three of the four items in the project's blocking-prerequisite list belong to this
spec, and none of them is ours to resolve.

## Prerequisites — none of them met

| # | Prerequisite | Status |
|---|---|---|
| **Q2** | An Acrobat Sign account with **API access** — business or enterprise tier, OAuth server-to-server — plus a developer sandbox. `plan.md:53` flags it: *"Płatny prereq — potwierdzić, czy firma ma."* | **Unconfirmed** |
| **Q3** | Signature level agreed with the legal department: ordinary eIDAS electronic signature, or **qualified** (QES) | **Unanswered** |
| **Q4** | Where production runs — this feature needs **one publicly reachable HTTPS endpoint** for the webhook (`plan.md:31`) | **Unanswered** |
| — | Security and compliance sign-off. With our own Postgres the data-residency question narrows to the Adobe cloud alone (`plan.md:55`) | Outstanding |

**Nothing in this spec can be built until Q2 is answered.** Write no integration
code against a sandbox that does not exist. What *can* be done now is the data
model and the record-side UI, because those are ours and they are useful even if
the integration slips.

Q3 is the one that changes the design rather than the schedule. A qualified
signature requires a qualified certificate held by each signer and is a different
Adobe product configuration; an ordinary eIDAS signature is what "hosted link, sign
in the browser" delivers. **Ask before building.**

## The design, as `plan.md` fixes it

`plan.md:28`:

> *"Adobe Acrobat Sign — hosted link (odbiorcy dostają maila, podpisują w
> przeglądarce Adobe), odbiorcy w kolejności, webhook oddaje podpisany PDF.
> Embedded signing = opcjonalny polish na później, NIE na start."*

Three decisions already made, and this spec does not reopen them:

- **Hosted link**, not embedded signing. Recipients get an e-mail from Adobe and
  sign on Adobe's page. We never render a signing surface.
- **Ordered recipients.** Signer 2 is invited when signer 1 finishes.
- **Webhook**, not polling, returns the completed PDF.

### Bulk

`plan.md:17` says *masowe* — bulk. The important consequence, and the thing most
likely to be got wrong: **bulk means N separate agreements, not one agreement with
N documents.** Each contract is its own legal instrument with its own recipients
and its own audit trail. A batch is a UI convenience over N independent sends, and
a failure on one must not affect the others.

## Where it attaches to the register

The existing data already has the shape.

| Element | Existing | Spec |
|---|---|---|
| The document to sign | `Attachment`, `isFinal = true` — 16,602 rows | 18 |
| "sent for signature" | `Contract.sentOn` (3,750 records) and status **7 "Projekt - wysłane do podpisu"** (189 live) | 07, 08 |
| Who signs | `ContractUser` owners, and the opinion round's participants | 10, 16 |
| Where the signed PDF lands | `StorageAdapter.put()` | 32 |

Status 7 is the natural trigger, and spec 08's **Q22** asks exactly this: does
"wysłane do podpisu" belong to the opinion workflow or to this integration? If
this feature ships, status 7 becomes its state and `sentOn` becomes its timestamp
— which is tidy, and needs saying out loud before two mechanisms write the same
column.

## Data model

Two new models. Nothing legacy maps onto them.

```prisma
/// One Adobe agreement for one contract. Bulk sending creates N of these.
model SignatureRequest {
  id           Int       @id @default(autoincrement())
  contractId   Int
  contract     Contract  @relation(fields: [contractId], references: [id])
  /// The document sent — always an existing attachment, never a fresh upload.
  attachmentId Int
  attachment   Attachment @relation(fields: [attachmentId], references: [id])

  agreementId  String?   @unique   // Adobe's id; null until the send succeeds
  status       SignatureStatus @default(DRAFT)
  createdById  Int
  createdAt    DateTime  @default(now())
  sentAt       DateTime?
  completedAt  DateTime?
  /// The signed PDF, once it comes back. A new Attachment, never an overwrite.
  signedAttachmentId Int?

  recipients   SignatureRecipient[]

  @@index([contractId])
  @@index([status])
}

model SignatureRecipient {
  id        Int      @id @default(autoincrement())
  requestId Int
  request   SignatureRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  order     Int      // 1-based; Adobe invites in this sequence
  email     String
  name      String?
  userId    Int?     // when the signer is one of ours
  signedAt  DateTime?

  @@unique([requestId, order])
}

enum SignatureStatus {
  DRAFT SENT PARTIALLY_SIGNED COMPLETED DECLINED EXPIRED CANCELLED FAILED
}
```

`agreementId` is unique so a replayed webhook cannot create a second request.

## The signed PDF must not overwrite anything

`plan.md:17` says the signed PDF returns to our storage. The critical detail is
**how**.

The unsigned document is an `Attachment` row with a `storageKey` referenced in a
legal register. Overwriting its bytes would silently replace the document 39,272
rows point at, destroy the pre-signature version, and — if `put()` deduplicates
(spec 32's Q80) — potentially affect another row entirely.

So: the signed PDF becomes a **new `Attachment`** on the same contract, marked
`isFinal`, with the original left exactly as it is. `SignatureRequest` links the
two. The register then shows both, which is what a legal department wants:
the draft that went out and the executed copy that came back.

Additionally, take a **storage-level backup of the source attachment before
sending** — a second copy under a `pre-signature/` prefix — so a botched
integration cannot lose the input either.

## Security

This feature adds the only publicly reachable endpoint in the entire system
(`plan.md:31`). It gets the scrutiny that implies.

| Concern | Requirement |
|---|---|
| Webhook authenticity | Verify Adobe's signature on **every** request. An unverified webhook is an unauthenticated write path into a legal register |
| Replay | `agreementId` is unique; a repeated event is idempotent, never a second attachment |
| Surface | The webhook route is the **only** public path. Everything else stays internal |
| Payload | Treat the body as untrusted input: validate with zod, never trust a filename or a URL it carries |
| Credentials | OAuth server-to-server client id and secret in `.env`, never in code, never in git — as `plan.md:32` already requires |
| Token handling | Cache the access token in memory with its expiry; never log it |
| Who may send | `canEditContract` plus, probably, a narrower entitlement — sending a contract for signature is a heavier act than editing a field (Q89) |
| Rate | Adobe's API is rate-limited; a bulk send of 50 must queue rather than burst |

## UI

### On the record

A **"Wyślij do podpisu"** action on a contract with at least one `isFinal`
attachment, and a **"Podpis elektroniczny"** section once a request exists:

| Row | Content |
|---|---|
| Stan | `Badge` — Wysłano / Częściowo podpisano / Podpisano / Odrzucono / Wygasło |
| Dokument | The attachment sent |
| Odbiorcy | In order, each with its own state and timestamp |
| Podpisany PDF | A link, once it returns |
| Historia | Sent at, completed at, who initiated |

### The send screen

`/umowy/[id]/podpis`. Choose the document (default: the newest `isFinal`), add
recipients in order — from the contract's owners, the opinion round's participants,
or typed in for an external counterparty — and confirm. The confirmation names
every recipient and the document, because this sends e-mail to people outside the
company and it cannot be taken back.

### The dashboard

`/podpisy` — everything in flight, which is the screen somebody will want on the
day a batch goes out: grouped by state, oldest first, with the stalled ones
(sent more than N days ago, nobody signed) at the top.

## Implementation

| Path | Action | Note |
|---|---|---|
| `prisma/schema.prisma` | modify | The two models and the enum |
| `lib/adobe/client.ts` | create | OAuth S2S, token cache, `createAgreement`, `getAgreement`, `downloadSigned` |
| `lib/adobe/webhook.ts` | create | Signature verification, zod validation, idempotent handling |
| `app/api/adobe/webhook/route.ts` | create | **The only public route** |
| `features/podpisy/send-page.tsx` | create | Document and recipients |
| `features/podpisy/actions.ts` | create | `createSignatureRequest`, `cancelSignatureRequest` |
| `app/(app)/podpisy/page.tsx` | create | The dashboard |
| `features/kontrakty/contract-preview.tsx` | modify | The section and the action |

### Order of work

1. **Answer Q2.** Without an account there is nothing to build against.
2. The schema and the record-side UI in a "manual" mode — a request can be created
   and marked complete by hand. Useful on its own, and it makes the model real
   before any network call.
3. The sandbox integration.
4. The webhook, with verification from the first line.
5. Bulk.
6. Production credentials — a separate step, with its own review (`plan.md:85`).

## Verification

```sql
-- 1. Nothing was ever signed in legacy — this feature has no precedent.
select count(*) filter (where signed) from "Opinion";
-- expected: 0 of 16531

-- 2. What could be sent today: contracts with a final attachment.
select count(distinct a."contractId") from "Attachment" a
join "Contract" c on c.id = a."contractId"
where a."isFinal" and not c."isDeleted";
-- the addressable set

-- 3. The candidate trigger — "wysłane do podpisu".
select count(*) filter (where "statusId" = 7) status_7,
       count("sentOn")                        with_sent_on
from "Contract" where not "isDeleted";
-- expected: 189 | 3750   → see Q22

-- 4. After go-live: no request may share an Adobe id.
select count(*) from (
  select "agreementId" from "SignatureRequest"
  where "agreementId" is not null group by 1 having count(*) > 1) d;
-- expected: 0, always

-- 5. No signed PDF ever replaced its source.
select count(*) from "SignatureRequest"
where "signedAttachmentId" = "attachmentId";
-- expected: 0, always
```

Manual checks (sandbox):

- [ ] An agreement is created, the recipient receives Adobe's e-mail, signs in the
      browser, and **never downloads the file**
- [ ] With three ordered recipients, the second is invited only after the first signs
- [ ] The webhook returns the signed PDF and it lands as a **new** attachment; the
      original is byte-identical to before
- [ ] Replaying the same webhook payload creates nothing and changes nothing
- [ ] A webhook with an invalid signature is **rejected**, logged, and writes nothing
- [ ] A declined agreement shows as declined and does not block a resend
- [ ] Cancelling a sent agreement cancels it at Adobe too
- [ ] A bulk send of 10 creates 10 independent agreements; failing one leaves nine
      unaffected
- [ ] No Adobe credential appears in the repository, the logs, or a client bundle
- [ ] Only `/api/adobe/webhook` is reachable from the public internet
- [ ] `npx tsc --noEmit` clean, `corepack yarn build` green

## Open questions

1. **Q2 (blocking) — does the company have an Acrobat Sign account with API
   access and a sandbox?** Business or enterprise tier, OAuth server-to-server.
   A paid prerequisite, still unconfirmed. **Nothing here starts without it.**
2. **Q3 (blocking) — ordinary eIDAS signature or qualified (QES)?** This changes
   the product configuration and the per-signature cost, and it is the legal
   department's decision, not a technical one.
3. **Q4 (blocking) — the public endpoint.** One HTTPS host with a certificate,
   reachable by Adobe, for the webhook and nothing else.
4. **Q89 — who may send a contract for signature?** `canEditContract` covers
   thousands of people. Sending is outward-facing and irreversible; it probably
   wants its own entitlement, like the opinion-round question in Q19.
5. **Q22 carries over** — does status 7 "Projekt - wysłane do podpisu" and
   `sentOn` (3,750 records) become this feature's state, or do they keep their
   existing meaning and this feature gets its own?
6. **Q90 — what happens to a contract when its signature completes?** Status to
   "Obowiązująca" automatically, or left to a human? Automatic is tempting and it
   would be the second job in the system that changes a legal status without
   anybody asking (spec 19 is the first).

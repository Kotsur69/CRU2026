/**
 * Proposes `User.login` ↔ `MailingContact` pairs using the two conventions the
 * data shows: logins are first-initial + surname (`mborowiecka`), addresses are
 * imie.nazwisko@arcelormittal.com with diacritics folded. Writes nothing.
 * See docs/features/25 and spec 04's Q1.
 *
 * Pure — no database. The script (`scripts/legacy/match-mailing-to-users.ts`) and the
 * contact page (`/mailing/[id]`) feed it the same rows (`lib/mailing/sources.ts`), so the
 * report and the screen always agree. Applying a proposal is a separate, reviewed step
 * (Q67): attaching a wrong name and address to an account is worse than a placeholder.
 */

/** Logins the import minted for users it knows only by id (`legacy-<id>`) — no name in them. */
export const PLACEHOLDER_LOGIN_PREFIX = "legacy-";

export type Confidence = "high" | "medium" | "low";

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "wysoka",
  medium: "średnia",
  low: "niska",
};

/**
 * Why a login goes to a person's decision rather than to the group approved wholesale:
 * - `shared` — two or more contacts give the login (namesakes with the same initial);
 * - `contested` — its one contact is also proposed for another login;
 * - `partial` — only one part of a double surname agrees.
 */
export type AmbiguityReason = "shared" | "contested" | "partial";

export const AMBIGUITY_LABEL: Record<AmbiguityReason, string> = {
  shared: "ten sam inicjał i nazwisko ma kilka kontaktów",
  contested: "kontakt pasuje też do innego loginu",
  partial: "zgodna tylko część podwójnego nazwiska",
};

export interface ContactNames {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

export interface LoginEntry {
  login: string;
  /** Null for a login given on the command line rather than read from `User`. */
  userId: number | null;
}

export interface Candidate<C extends ContactNames> {
  contact: C;
  confidence: Confidence;
}

export interface Proposal<C extends ContactNames, L extends LoginEntry> {
  login: L;
  /** Best first. */
  candidates: Candidate<C>[];
}

export interface AmbiguousProposal<C extends ContactNames, L extends LoginEntry>
  extends Proposal<C, L> {
  reason: AmbiguityReason;
}

export interface MatchReport<C extends ContactNames, L extends LoginEntry> {
  /** One candidate, wanted by no other login, full surname — approved as a group. */
  unambiguous: Proposal<C, L>[];
  /** Approved one by one. */
  ambiguous: AmbiguousProposal<C, L>[];
  unmatched: L[];
}

/** Lower case with diacritics folded — how both conventions spell a name. */
export function foldName(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/ł/g, "l") // the one Polish letter NFD does not decompose
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

interface DerivedLogins {
  /** Initial + the whole surname; a double one hyphenated (as the addresses write it) and run together. */
  full: string[];
  /** Initial + one part of a double surname — a maiden or a married name alone. */
  partial: string[];
}

/** "Małgorzata" + "Borowiecka" → "mborowiecka". */
function deriveLogins(first: string, surname: string): DerivedLogins | null {
  const initial = foldName(first).replace(/[^a-z]/g, "").charAt(0);
  // Letters only — which also drops the digit an address adds to tell namesakes apart.
  const parts = foldName(surname)
    .split(/[\s-]+/)
    .map((part) => part.replace(/[^a-z]/g, ""))
    .filter(Boolean);
  if (!initial || parts.length === 0) return null;
  return {
    full: [...new Set([initial + parts.join("-"), initial + parts.join("")])],
    partial: parts.length > 1 ? parts.map((part) => initial + part) : [],
  };
}

/** `imie.nazwisko@…` gives the same logins as the name; any other shape gives none. */
function loginsFromAddress(email: string | null): DerivedLogins | null {
  const at = email ? email.indexOf("@") : -1;
  if (!email || at <= 0) return null;
  const segments = foldName(email.slice(0, at)).split(".");
  if (segments.length < 2) return null;
  return deriveLogins(segments[0], segments[segments.length - 1]);
}

export interface ConventionKeys {
  /** From the name fields. */
  name: string[];
  /** From the address. */
  address: string[];
  /** One part of a double surname, from either source — never enough on its own. */
  partial: string[];
}

/** The logins a contact would have under the convention. */
export function conventionKeys(contact: ContactNames): ConventionKeys {
  const fromName =
    contact.firstName && contact.lastName ? deriveLogins(contact.firstName, contact.lastName) : null;
  const fromAddress = loginsFromAddress(contact.email);
  return {
    name: fromName?.full ?? [],
    address: fromAddress?.full ?? [],
    partial: [...new Set([...(fromName?.partial ?? []), ...(fromAddress?.partial ?? [])])],
  };
}

/**
 * High when the name and the address both give the login, medium when one does (no
 * address, or the two disagree), low when only a part of a double surname does.
 */
function confidenceOf(login: string, keys: ConventionKeys): Confidence | null {
  const byName = keys.name.includes(login);
  const byAddress = keys.address.includes(login);
  if (byName && byAddress) return "high";
  if (byName || byAddress) return "medium";
  return keys.partial.includes(login) ? "low" : null;
}

const RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };

const byLogin = (a: LoginEntry, b: LoginEntry) => a.login.localeCompare(b.login, "pl");

export function proposeMatches<C extends ContactNames, L extends LoginEntry>(
  logins: readonly L[],
  contacts: readonly C[],
): MatchReport<C, L> {
  const byKey = new Map<string, { contact: C; keys: ConventionKeys }[]>();
  for (const contact of contacts) {
    const keys = conventionKeys(contact);
    for (const key of new Set([...keys.name, ...keys.address, ...keys.partial])) {
      const bucket = byKey.get(key);
      if (bucket) bucket.push({ contact, keys });
      else byKey.set(key, [{ contact, keys }]);
    }
  }

  const proposals: Proposal<C, L>[] = [];
  const unmatched: L[] = [];
  for (const entry of logins) {
    const login = foldName(entry.login);
    if (!login || login.startsWith(PLACEHOLDER_LOGIN_PREFIX)) continue;
    const hits = byKey.get(login) ?? [];
    if (hits.length === 0) {
      unmatched.push(entry);
      continue;
    }
    const candidates = hits
      // Every hit came out of the index under this very login, so it has a confidence.
      .map(({ contact, keys }) => ({ contact, confidence: confidenceOf(login, keys) ?? "low" }))
      .sort((a, b) => RANK[a.confidence] - RANK[b.confidence] || a.contact.id - b.contact.id);
    proposals.push({ login: entry, candidates });
  }

  // A contact two logins want is settled by neither of them.
  const wanted = new Map<number, number>();
  for (const { candidates } of proposals) {
    for (const { contact } of candidates) wanted.set(contact.id, (wanted.get(contact.id) ?? 0) + 1);
  }

  const report: MatchReport<C, L> = { unambiguous: [], ambiguous: [], unmatched };
  for (const proposal of proposals) {
    const [best] = proposal.candidates;
    const reason: AmbiguityReason | null =
      proposal.candidates.length > 1
        ? "shared"
        : (wanted.get(best.contact.id) ?? 0) > 1
          ? "contested"
          : best.confidence === "low"
            ? "partial"
            : null;
    if (reason) report.ambiguous.push({ ...proposal, reason });
    else report.unambiguous.push(proposal);
  }

  report.unambiguous.sort(
    (a, b) =>
      RANK[a.candidates[0].confidence] - RANK[b.candidates[0].confidence] ||
      byLogin(a.login, b.login),
  );
  report.ambiguous.sort((a, b) => byLogin(a.login, b.login));
  report.unmatched.sort(byLogin);
  return report;
}

export interface ContactProposal<L extends LoginEntry> {
  login: L;
  confidence: Confidence;
  /** Null when the pair is in the unambiguous group. */
  reason: AmbiguityReason | null;
}

/** The proposals that name one contact — what its page shows. */
export function proposalsForContact<C extends ContactNames, L extends LoginEntry>(
  report: MatchReport<C, L>,
  contactId: number,
): ContactProposal<L>[] {
  const found: ContactProposal<L>[] = [];
  for (const { login, candidates } of report.unambiguous) {
    const [only] = candidates;
    if (only.contact.id === contactId) {
      found.push({ login, confidence: only.confidence, reason: null });
    }
  }
  for (const { login, candidates, reason } of report.ambiguous) {
    const hit = candidates.find((c) => c.contact.id === contactId);
    if (hit) found.push({ login, confidence: hit.confidence, reason });
  }
  return found;
}

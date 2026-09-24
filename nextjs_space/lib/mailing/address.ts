/**
 * Legacy `mailing_lists.email` is `char(50)`. MySQL cut anything longer without a word,
 * so an address that fills the column exactly was probably truncated, and so was one
 * that no longer ends in a domain (docs/features/25). Six contacts have no address at
 * all; they stay in the list — a name is still directory data.
 */
export const LEGACY_EMAIL_WIDTH = 50;

export type AddressIssue = "missing" | "suspect";

/** Something, `@`, a domain with a dot and a top-level part of at least two letters. */
const ADDRESS_SHAPE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function addressIssue(email: string | null | undefined): AddressIssue | null {
  const value = email?.trim();
  if (!value) return "missing";
  if (value.length === LEGACY_EMAIL_WIDTH || !ADDRESS_SHAPE.test(value)) return "suspect";
  return null;
}

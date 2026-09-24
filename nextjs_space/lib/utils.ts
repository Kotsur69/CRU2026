import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Łączy klasy Tailwind z rozstrzyganiem konfliktów (wzorzec shadcn/ui). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const MAX_PAGE_SIZE = 500;
const MIN_PAGE_SIZE = 10;

/** Query-string values are untrusted: only a clean positive integer is accepted. */
export function intParam(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function pageParam(value: string | undefined): number {
  return Math.max(1, intParam(value) ?? 1);
}

export function pageSizeParam(value: string | undefined, fallback: number): number {
  return Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, intParam(value) ?? fallback));
}

/** A `YYYY-MM-DD` query value as UTC midnight — `@db.Date` columns compare against that. */
export function dateParam(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** A non-negative amount from the query string; a Polish decimal comma is accepted. */
export function amountParam(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { RISK_DOMAIN_LETTER, riskIdentifierFor } from "./risk-grammar";

/**
 * Dział ryzyka — numeracja i kafelki rejestru (docs/features/08). Sama gramatyka
 * numeru jest w `risk-grammar.ts`, bo korzysta z niej także formularz w przeglądarce.
 */

/**
 * Kolejny numer rekordu ryzyka: maksimum w roku i literze + 1. Rekordy usunięte liczą się
 * do maksimum, żeby ich numery nie wracały (jak w seriach umów, docs/features/02).
 * Null, gdy rodzaj nie ma litery — wtedy formularz musi najpierw poznać rodzaj.
 */
export async function nextRiskIdentifier(
  domainId: number | null,
  year: number = new Date().getFullYear(),
): Promise<string | null> {
  const letter = domainId === null ? undefined : RISK_DOMAIN_LETTER[domainId];
  if (!letter) return null;

  const pattern = `^${year}/${letter}/[0-9]{1,6}$`;
  const [row] = await prisma.$queryRaw<{ highest: number | null }[]>`
    SELECT max(substring(btrim(c."identifier") from '([0-9]{1,6})$')::int) AS highest
    FROM "Contract" AS c
    WHERE c."module" = 'RISK'::"ContractModule"
      AND btrim(c."identifier") ~ ${pattern}`;

  return riskIdentifierFor(letter, year, (row?.highest ?? 0) + 1);
}

export interface RiskSummary {
  records: number;
  /** Suma kwot per waluta — kwot w różnych walutach nie dodajemy do siebie. */
  totals: { currency: string | null; amount: string }[];
  active: number;
  inCourt: number;
}

/** Kafelki nad tabelą — liczone na zbiorze PO filtrach, nie na całym rejestrze. */
export async function riskSummary(where: Prisma.ContractWhereInput): Promise<RiskSummary> {
  const [records, sums, active, inCourt, currencies] = await Promise.all([
    prisma.contract.count({ where }),
    prisma.contract.groupBy({ by: ["currencyId"], where, _sum: { salary: true } }),
    prisma.contract.count({ where: { AND: [where, { status: { name: { contains: "aktywny" } } }] } }),
    prisma.contract.count({ where: { AND: [where, { status: { name: { contains: "w sądzie" } } }] } }),
    prisma.currency.findMany({ select: { id: true, code: true } }),
  ]);

  const codeOf = new Map(currencies.map((c) => [c.id, c.code.toUpperCase()]));
  return {
    records,
    totals: sums
      .filter((s) => s._sum.salary !== null)
      .map((s) => ({
        currency: s.currencyId === null ? null : (codeOf.get(s.currencyId) ?? null),
        amount: s._sum.salary!.toString(),
      })),
    active,
    inCourt,
  };
}

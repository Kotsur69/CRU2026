import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { userLabel } from "@/lib/format";
import { registerWhere } from "@/lib/contracts/scope";
import { REGISTER_MODULES } from "@/lib/contracts/modules";
import { toUsageRows, type LocationUsageRow } from "./usage";

/** Osoba na liście dostępu — te same pola co członek grupy na stronie grupy. */
const GRANTEE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  login: true,
  active: true,
  isAdmin: true,
  isPlaceholder: true,
} as const;

/**
 * Cały słownik z liczbami użycia: jedno zapytanie grupujące na źródło zamiast liczenia
 * dla każdego wiersza osobno. Razem ze słownikiem — cztery zapytania na stronę.
 */
export async function loadLocationUsage(): Promise<LocationUsageRow[]> {
  const [locations, primary, linked, grants] = await Promise.all([
    prisma.location.findMany({ select: { id: true, name: true, active: true } }),
    // Rekord usunięty (legacy soft delete) nie liczy się jako użycie lokalizacji głównej.
    prisma.contract.groupBy({
      by: ["primaryLocationId"],
      where: { isDeleted: false },
      _count: true,
    }),
    // Tabela powiązań liczona w całości, jak w zapytaniu weryfikacyjnym spec 22.
    prisma.contractLocationLink.groupBy({ by: ["locationId"], _count: true }),
    prisma.userLocation.groupBy({ by: ["locationId"], _count: true }),
  ]);

  return toUsageRows(locations, {
    primary: new Map(primary.map((g) => [g.primaryLocationId, g._count])),
    linked: new Map(linked.map((g) => [g.locationId, g._count])),
    grants: new Map(grants.map((g) => [g.locationId, g._count])),
  });
}

/** Ten sam warunek co filtr „Lokalizacja" w rejestrach: lokalizacja główna albo dodatkowa. */
function atLocation(id: number): Prisma.ContractWhereInput {
  return { OR: [{ primaryLocationId: id }, { locations: { some: { locationId: id } } }] };
}

/** „Nazwisko Imię" po polsku; loginy zastępcze liczbowo — `legacy-539` przed `legacy-50209`. */
const byLabel = new Intl.Collator("pl", { numeric: true });

function sortPeople<T extends Parameters<typeof userLabel>[0]>(people: T[]): T[] {
  return people.sort((a, b) => byLabel.compare(userLabel(a), userLabel(b)));
}

export async function loadLocationDetail(id: number) {
  const [location, primary, linked, both, registers, userGrants, scopeGrants, candidates] =
    await Promise.all([
      prisma.location.findUnique({
        where: { id },
        select: { id: true, name: true, active: true },
      }),
      prisma.contract.count({ where: { isDeleted: false, primaryLocationId: id } }),
      prisma.contractLocationLink.count({ where: { locationId: id } }),
      prisma.contract.count({
        where: { isDeleted: false, primaryLocationId: id, locations: { some: { locationId: id } } },
      }),
      // Tyle pokaże filtr „Lokalizacja" każdego rejestru — i tyle obejmie przypisanie
      // tej lokalizacji, gdy autoryzacja odczytu (spec 03) zacznie je stosować.
      Promise.all(
        REGISTER_MODULES.map(async (module) => ({
          module,
          count: await prisma.contract.count({
            where: { AND: [...registerWhere(module), atLocation(id)] },
          }),
        })),
      ),
      prisma.userLocation.findMany({
        where: { locationId: id },
        select: { user: { select: GRANTEE_SELECT } },
      }),
      prisma.userAccessScope.findMany({
        where: { dimension: "LOCATION", valueId: id },
        select: { user: { select: GRANTEE_SELECT } },
      }),
      // Kandydaci do „Przyznaj dostęp" — każdy, kto tej lokalizacji jeszcze nie ma.
      prisma.user.findMany({
        where: { locations: { none: { locationId: id } } },
        select: GRANTEE_SELECT,
      }),
    ]);

  if (!location) return null;

  return {
    location,
    usage: { primary, linked, both, registers },
    userGrants: sortPeople(userGrants.map((g) => g.user)),
    scopeGrants: sortPeople(scopeGrants.map((g) => g.user)),
    candidates: sortPeople(candidates),
  };
}

export type LocationDetail = NonNullable<Awaited<ReturnType<typeof loadLocationDetail>>>;
export type Grantee = LocationDetail["userGrants"][number];

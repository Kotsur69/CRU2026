import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { pageParam, pageSizeParam } from "@/lib/utils";
import { nipDigits } from "@/lib/contractors";
import {
  LIVE_RECORD,
  duplicateGroups,
  idsWithNipFragment,
  type DuplicateGroup,
} from "@/lib/contractors-db";
import { ContractorsTable, type ContractorRow } from "@/components/kontrahenci/contractors-table";
import { buttonClass } from "@/components/ui/button";
import { FilterBar, type FilterField } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

/** 3 580 wpisów — przy 50 na stronę to 72 strony (docs/features/20). */
const DEFAULT_PAGE_SIZE = 50;

// Legacy soft-deletes contractors (`deleted`), and the dump still carries those rows.
// They stay hidden unless explicitly requested, so the register matches what the
// contractor dropdown in Umowy offers.
async function buildWhere(
  sp: SP,
  duplicateIds: readonly number[],
): Promise<Prisma.ContractorWhereInput> {
  const and: Prisma.ContractorWhereInput[] = [];

  if (sp.deleted !== "1") and.push({ isDeleted: false });

  if (sp.name) {
    and.push({
      OR: [
        { shortName: { contains: sp.name, mode: "insensitive" } },
        { fullName: { contains: sp.name, mode: "insensitive" } },
      ],
    });
  }
  // NIP po cyfrach: „526-025" znajduje i „5260250995", i „526-025-09-95".
  if (sp.nip) {
    const digits = nipDigits(sp.nip);
    and.push(
      digits
        ? { id: { in: await idsWithNipFragment(digits) } }
        : { vatId: { contains: sp.nip.trim(), mode: "insensitive" } },
    );
  }
  if (sp.register) and.push({ register: { contains: sp.register, mode: "insensitive" } });
  // Miejscowość nie ma własnej kolumny — legacy trzyma cały adres w jednym polu.
  if (sp.address) and.push({ address: { contains: sp.address, mode: "insensitive" } });
  if (sp.ceidg === "1") and.push({ isCeidg: true });
  if (sp.duplikaty === "1") and.push({ id: { in: [...duplicateIds] } });
  // Nieużywany = ani strona, ani dłużnik na żadnym rekordzie, także usuniętym (208 w dumpie).
  // Zostaje w podpowiedziach — dziś nieużywany jutro bywa potrzebny.
  if (sp.nieuzywane === "1") and.push({ contracts: { none: {} }, debtorFor: { none: {} } });

  return { AND: and };
}

const FILTERS: FilterField[] = [
  { name: "name", label: "Nazwa", hint: "Skrócona albo pełna" },
  { name: "nip", label: "NIP", hint: "Kreski i spacje są pomijane" },
  { name: "register", label: "KRS" },
  { name: "address", label: "Miejscowość", hint: "Szuka w adresie" },
  { name: "ceidg", label: "tylko CEIDG", checkbox: true },
  { name: "deleted", label: "pokaż usunięte", checkbox: true },
  { name: "duplikaty", label: "tylko duplikaty NIP", checkbox: true },
  { name: "nieuzywane", label: "tylko nieużywane", checkbox: true },
];

/** Liczniki kolumn „Umowy" i „Załączniki" — umowy bez usuniętych, jak na karcie kontrahenta. */
const COUNTS = {
  _count: { select: { contracts: { where: LIVE_RECORD }, attachments: true } },
} satisfies Prisma.ContractorInclude;

type ContractorWithCounts = Prisma.ContractorGetPayload<{ include: typeof COUNTS }>;

export default async function KontrahenciPage({ searchParams }: { searchParams: SP }) {
  const page = pageParam(searchParams.page);
  const pageSize = pageSizeParam(searchParams.pageSize, DEFAULT_PAGE_SIZE);
  const skip = (page - 1) * pageSize;

  // Grupy liczymy zawsze: znacznik duplikatu stoi przy każdym wierszu, nie tylko w filtrze.
  const groups = await duplicateGroups();
  const groupOf = new Map<number, DuplicateGroup>();
  for (const group of groups) for (const id of group.ids) groupOf.set(id, group);

  const where = await buildWhere(searchParams, [...groupOf.keys()]);

  let total: number;
  let contractors: ContractorWithCounts[];
  let groupsShown: number | null = null;

  if (searchParams.duplikaty === "1") {
    // Kopie jednej firmy muszą stać obok siebie: kolejność grup po NIP-ie, w grupie po id.
    const matching = new Set(
      (await prisma.contractor.findMany({ where, select: { id: true } })).map((r) => r.id),
    );
    const ordered = groups.flatMap((g) => g.ids).filter((id) => matching.has(id));
    const pageIds = ordered.slice(skip, skip + pageSize);
    const rows = await prisma.contractor.findMany({
      where: { id: { in: pageIds } },
      include: COUNTS,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));

    total = ordered.length;
    contractors = pageIds.flatMap((id) => byId.get(id) ?? []);
    groupsShown = new Set(ordered.map((id) => groupOf.get(id)?.nip)).size;
  } else {
    [total, contractors] = await Promise.all([
      prisma.contractor.count({ where }),
      prisma.contractor.findMany({
        where,
        include: COUNTS,
        // Nigdy po dacie rejestracji — ma ją niespełna jedna trzecia wpisów.
        orderBy: [{ shortName: "asc" }, { fullName: "asc" }, { id: "asc" }],
        skip,
        take: pageSize,
      }),
    ]);
  }

  const rows: ContractorRow[] = contractors.map((k) => ({
    id: k.id,
    shortName: k.shortName,
    fullName: k.fullName,
    address: k.address,
    vatId: k.vatId,
    register: k.register,
    isCeidg: k.isCeidg,
    isConnected: k.isConnected,
    isDeleted: k.isDeleted,
    contractCount: k._count.contracts,
    attachmentCount: k._count.attachments,
    duplicateCount: groupOf.get(k.id)?.ids.length ?? null,
  }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">Kontrahenci</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            Znaleziono: <strong className="text-foreground">{total}</strong>
            {groupsShown !== null && (
              <>
                {" "}
                · grup NIP: <strong className="text-foreground">{groupsShown}</strong>
              </>
            )}
          </span>
          <Link href="/kontrahenci/nowy" className={buttonClass("primary")}>
            Dodaj nowy wpis
          </Link>
        </div>
      </div>

      <FilterBar
        action="/kontrahenci"
        fields={FILTERS}
        values={searchParams}
        defaultPageSize={DEFAULT_PAGE_SIZE}
      />

      <ContractorsTable contractors={rows} />

      <Pagination
        basePath="/kontrahenci"
        searchParams={searchParams}
        page={page}
        pageSize={pageSize}
        total={total}
      />
    </div>
  );
}

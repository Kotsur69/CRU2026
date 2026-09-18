import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { pageParam, pageSizeParam } from "@/lib/utils";
import { ContractorsTable, type ContractorRow } from "@/components/kontrahenci/contractors-table";
import { FilterBar } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

const DEFAULT_PAGE_SIZE = 50;

// Legacy soft-deletes contractors (`deleted`), and the dump still carries those rows.
// They stay hidden unless explicitly requested, so the register matches what the
// contractor dropdown in Umowy offers.
function buildWhere(sp: SP): Prisma.ContractorWhereInput {
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
  if (sp.nip) and.push({ vatId: { contains: sp.nip } });
  if (sp.register) and.push({ register: { contains: sp.register, mode: "insensitive" } });
  if (sp.cru) and.push({ cruIdentifier: { contains: sp.cru, mode: "insensitive" } });
  if (sp.address) and.push({ address: { contains: sp.address, mode: "insensitive" } });
  if (sp.connected === "1") and.push({ isConnected: true });
  if (sp.ceidg === "1") and.push({ isCeidg: true });
  if (sp.withContracts === "1") and.push({ contracts: { some: {} } });

  return and.length > 0 ? { AND: and } : {};
}

export default async function KontrahenciPage({ searchParams }: { searchParams: SP }) {
  const page = pageParam(searchParams.page);
  const pageSize = pageSizeParam(searchParams.pageSize, DEFAULT_PAGE_SIZE);
  const where = buildWhere(searchParams);

  const [total, contractors] = await Promise.all([
    prisma.contractor.count({ where }),
    prisma.contractor.findMany({
      where,
      include: { _count: { select: { contracts: true, attachments: true } } },
      orderBy: [{ shortName: "asc" }, { fullName: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const rows: ContractorRow[] = contractors.map((k) => ({
    id: k.id,
    shortName: k.shortName,
    fullName: k.fullName,
    address: k.address,
    vatId: k.vatId,
    register: k.register,
    cruIdentifier: k.cruIdentifier,
    isCeidg: k.isCeidg,
    isConnected: k.isConnected,
    isDeleted: k.isDeleted,
    contractCount: k._count.contracts,
    attachmentCount: k._count.attachments,
  }));

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <h1 className="font-heading text-2xl font-semibold">Kontrahenci</h1>
        <span className="text-sm text-muted-foreground">
          Znaleziono: <strong className="text-foreground">{total}</strong>
        </span>
      </div>

      <FilterBar
        action="/kontrahenci"
        defaultPageSize={DEFAULT_PAGE_SIZE}
        values={searchParams}
        fields={[
          { name: "name", label: "Nazwa" },
          { name: "nip", label: "NIP" },
          { name: "register", label: "Rejestr / KRS" },
          { name: "cru", label: "Identyfikator CRU" },
          { name: "address", label: "Adres" },
          { name: "connected", label: "Podmiot powiązany", checkbox: true },
          { name: "ceidg", label: "CEIDG", checkbox: true },
          { name: "withContracts", label: "Tylko z umowami", checkbox: true },
          { name: "deleted", label: "Pokaż usunięte", checkbox: true },
        ]}
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

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { userLabel } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

// Legacy „Lokalizacja dostępy" łączy dwie rzeczy: słownik lokalizacji (`contract_location`)
// i przypisanie użytkowników do lokalizacji (`users_locations`), które zawęża widoczność.
// Umowa wiąże się z lokalizacją dwiema drogami — kolumną `location_id` ORAZ tabelą
// `contract_has_location` — więc obie liczymy osobno, żeby nic nie znikło.
export default async function LokalizacjePage() {
  const locations = await prisma.location.findMany({
    include: {
      userLinks: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, login: true } },
        },
        orderBy: { userId: "asc" },
      },
      _count: { select: { primaryForContracts: true, contractLinks: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const assignedUsers = locations.reduce((sum, l) => sum + l.userLinks.length, 0);

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <h1 className="font-heading text-2xl font-semibold">Lokalizacje i dostępy</h1>
        <span className="text-sm text-muted-foreground">
          Lokalizacji: <strong className="text-foreground">{locations.length}</strong> · przypisań
          użytkowników: <strong className="text-foreground">{assignedUsers}</strong>
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border shadow-sm">
        <table className="w-full text-xs">
          <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 font-semibold">Lokalizacja</th>
              <th className="px-2 py-1.5 font-semibold">Opis</th>
              <th className="px-2 py-1.5 font-semibold">Stan</th>
              <th className="px-2 py-1.5 text-right font-semibold">Umowy (główna)</th>
              <th className="px-2 py-1.5 text-right font-semibold">Umowy (powiązane)</th>
              <th className="px-2 py-1.5 font-semibold">Użytkownicy z dostępem</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="whitespace-normal break-words px-2 py-1.5 align-top font-medium">
                  {l.name}
                </td>
                <td className="whitespace-normal break-words px-2 py-1.5 align-top">
                  {l.description ?? "—"}
                </td>
                <td className="px-2 py-1.5 align-top">
                  <Badge tone={l.active ? "success" : "neutral"}>
                    {l.active ? "Aktywna" : "Wyłączona"}
                  </Badge>
                </td>
                <td className="px-2 py-1.5 text-right align-top tabular-nums">
                  <Link href={`/umowy?location=${l.id}`} className="text-primary hover:underline">
                    {l._count.primaryForContracts}
                  </Link>
                </td>
                <td className="px-2 py-1.5 text-right align-top tabular-nums">
                  {l._count.contractLinks}
                </td>
                <td className="whitespace-normal break-words px-2 py-1.5 align-top">
                  {l.userLinks.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className="flex flex-wrap gap-x-2 gap-y-1">
                      {l.userLinks.map((u) => (
                        <Link
                          key={u.userId}
                          href={`/dostepy/${u.userId}`}
                          className="text-primary hover:underline"
                        >
                          {userLabel(u.user)}
                        </Link>
                      ))}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

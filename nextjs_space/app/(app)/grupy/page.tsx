import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { userLabel } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { ClickableRow } from "@/components/ui/clickable-row";

export const dynamic = "force-dynamic";

// Legacy `group` — role funkcjonalne (Dział prawny, Właściciele umów, Opiniujący, …).
// Zbiór jest mały i zamknięty, więc rejestr nie potrzebuje filtrów ani paginacji;
// wartość jest w liczności członków i w tym, które grupy karmią obieg opinii.
export default async function GrupyPage() {
  const groups = await prisma.group.findMany({
    include: {
      owner: { select: { id: true, firstName: true, lastName: true, login: true } },
      businessline: true,
      opinionTypes: { orderBy: { id: "asc" } },
      _count: { select: { members: true, history: true } },
    },
    orderBy: { id: "asc" },
  });

  const totalMembers = groups.reduce((sum, g) => sum + g._count.members, 0);

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <h1 className="font-heading text-2xl font-semibold">Grupy</h1>
        <span className="text-sm text-muted-foreground">
          Grup: <strong className="text-foreground">{groups.length}</strong> · przypisań:{" "}
          <strong className="text-foreground">{totalMembers}</strong>
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border shadow-sm">
        <table className="w-full text-xs">
          <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 font-semibold">Nazwa</th>
              <th className="px-2 py-1.5 font-semibold">Stan</th>
              <th className="px-2 py-1.5 font-semibold">Właściciel</th>
              <th className="px-2 py-1.5 font-semibold">Businessline</th>
              <th className="px-2 py-1.5 font-semibold">Typy opinii</th>
              <th className="px-2 py-1.5 text-right font-semibold">Członków</th>
              <th className="px-2 py-1.5 text-right font-semibold">Historia</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <ClickableRow key={g.id} href={`/grupy/${g.id}`}>
                <td className="whitespace-normal break-words px-2 py-1.5 align-top">
                  <Link href={`/grupy/${g.id}`} className="font-medium text-primary hover:underline">
                    {g.name}
                  </Link>
                </td>
                <td className="px-2 py-1.5 align-top">
                  <Badge tone={g.active ? "success" : "neutral"}>
                    {g.active ? "Aktywna" : "Wyłączona"}
                  </Badge>
                </td>
                <td className="px-2 py-1.5 align-top">{g.owner ? userLabel(g.owner) : "—"}</td>
                <td className="px-2 py-1.5 align-top">{g.businessline?.name ?? "—"}</td>
                <td className="whitespace-normal break-words px-2 py-1.5 align-top">
                  {g.opinionTypes.length === 0
                    ? "—"
                    : g.opinionTypes.map((t) => t.name).join(", ")}
                </td>
                <td className="px-2 py-1.5 text-right align-top tabular-nums">
                  {g._count.members}
                </td>
                <td className="px-2 py-1.5 text-right align-top tabular-nums">
                  {g._count.history}
                </td>
              </ClickableRow>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

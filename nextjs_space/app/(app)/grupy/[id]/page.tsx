import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { userLabel } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";

export const dynamic = "force-dynamic";

const MEMBER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  login: true,
  active: true,
  isAdmin: true,
  isPlaceholder: true,
} as const;

export default async function GrupaPage({ params }: { params: { id: string } }) {
  // Route params are untrusted: the legacy primary key is an integer, nothing else.
  const id = Number.parseInt(params.id, 10);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const g = await prisma.group.findUnique({
    where: { id },
    include: {
      owner: { select: MEMBER_SELECT },
      businessline: true,
      opinionTypes: { orderBy: { id: "asc" } },
      members: {
        include: { user: { select: MEMBER_SELECT } },
        orderBy: { userId: "asc" },
      },
      history: {
        include: { user: { select: MEMBER_SELECT } },
        orderBy: { id: "desc" },
      },
    },
  });

  if (!g) notFound();

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <Link href="/grupy" className="text-sm text-muted-foreground hover:text-foreground">
          ← Grupy
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold">{g.name}</h1>
          <Badge tone={g.active ? "success" : "neutral"}>
            {g.active ? "Aktywna" : "Wyłączona"}
          </Badge>
          {g.businessline && <Badge tone="brand">{g.businessline.name}</Badge>}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Właściciel grupy: {g.owner ? userLabel(g.owner) : "—"}
        </p>
      </div>

      <Section title={`Członkowie (${g.members.length})`}>
        {g.members.length === 0 ? (
          <p className="text-sm text-muted-foreground">Grupa nie ma przypisanych osób.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {g.members.map((m) => (
              <li key={m.userId} className="flex items-center gap-2">
                <Link href={`/dostepy/${m.userId}`} className="text-primary hover:underline">
                  {userLabel(m.user)}
                </Link>
                {m.user.isAdmin && <Badge tone="warning">admin</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Typy opinii obsługiwane przez grupę">
        {g.opinionTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Grupa nie jest podpięta pod żaden typ opinii.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {g.opinionTypes.map((t) => (
              <li key={t.id}>{t.name}</li>
            ))}
          </ul>
        )}
      </Section>

      {/* Legacy `users_groups_history` jest dopisywane bez znacznika czasu — pokazujemy
          wyłącznie fakt wcześniejszego członkostwa, bez udawania chronologii. */}
      <Section title={`Historia członkostw (${g.history.length})`}>
        {g.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak wpisów historycznych.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {g.history.map((h) => (
              <li key={h.id}>
                <Link href={`/dostepy/${h.userId}`} className="text-primary hover:underline">
                  {userLabel(h.user)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

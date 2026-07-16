import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProjektyPage() {
  const projects = await prisma.project.findMany({
    include: { status: true, owners: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <h1 className="mb-4 font-heading text-2xl font-semibold">Projekty</h1>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Identyfikator</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Właściciel</th>
              <th className="px-3 py-2 font-medium">Przedmiot</th>
              <th className="px-3 py-2 font-medium">Opiniujący</th>
              <th className="px-3 py-2 font-medium">Wysł. do podpisu</th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  Brak projektów. (szkielet — dane pojawią się po odtworzeniu modułu)
                </td>
              </tr>
            )}
            {projects.map((p) => (
              <tr key={p.id} className="border-t hover:bg-muted/40">
                <td className="px-3 py-2 font-medium">{p.identifier}</td>
                <td className="px-3 py-2">{p.status?.name ?? "—"}</td>
                <td className="px-3 py-2">{p.owners.map((o) => o.fullName).join(", ") || "—"}</td>
                <td className="max-w-xs truncate px-3 py-2">{p.subject ?? "—"}</td>
                <td className="px-3 py-2">{p.reviewer ?? "—"}</td>
                <td className="px-3 py-2">{formatDate(p.sentToSign)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

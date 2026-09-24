import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { contractorLabel } from "@/lib/format";
import { ContractorForm } from "@/features/kontrahenci/contractor-form";

export const dynamic = "force-dynamic";

/** Edycja wpisu słownika — tylko administrator (docs/features/20); pozostali dostają 404. */
export default async function EdycjaKontrahentaPage({ params }: { params: { id: string } }) {
  await requireAdmin();

  const id = Number.parseInt(params.id, 10);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const k = await prisma.contractor.findUnique({ where: { id } });
  if (!k) notFound();

  return (
    <ContractorForm
      mode="edit"
      recordId={k.id}
      title={`Edycja: ${contractorLabel(k)}`}
      subtitle={
        k.isDeleted
          ? "Kontrahent jest usunięty — zapis zmian nie przywraca go do podpowiedzi."
          : undefined
      }
      backHref={`/kontrahenci/${k.id}`}
      initial={{
        shortName: k.shortName ?? "",
        fullName: k.fullName ?? "",
        vatId: k.vatId ?? "",
        register: k.register ?? "",
        address: k.address ?? "",
        isCeidg: k.isCeidg,
        isConnected: k.isConnected,
      }}
    />
  );
}

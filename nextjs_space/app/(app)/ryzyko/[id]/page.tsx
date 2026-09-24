import { notFound } from "next/navigation";
import { ContractPreview } from "@/features/kontrakty/contract-preview";

export const dynamic = "force-dynamic";

export default function RyzykoPreviewPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Record<string, string | undefined>;
}) {
  // Route params are untrusted: the legacy primary key is an integer, nothing else.
  const id = Number.parseInt(params.id, 10);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  return (
    <ContractPreview
      id={id}
      module="RISK"
      showAllAnnexes={searchParams.aneksy === "wszystkie"}
      showAllNotes={searchParams.notatki === "wszystkie"}
    />
  );
}

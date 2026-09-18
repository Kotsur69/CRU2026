import { notFound } from "next/navigation";
import { ContractPreview } from "@/features/kontrakty/contract-preview";

export const dynamic = "force-dynamic";

export default function UmowaPreviewPage({ params }: { params: { id: string } }) {
  // Route params are untrusted: the legacy primary key is an integer, nothing else.
  const id = Number.parseInt(params.id, 10);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  return <ContractPreview id={id} backHref="/umowy" backLabel="Umowy" />;
}

import { ContractorForm } from "@/features/kontrahenci/contractor-form";

export const dynamic = "force-dynamic";

/**
 * „Dodaj nowy wpis" w słowniku kontrahentów — otwarte dla każdego zalogowanego (Q57),
 * z tym samym sprawdzeniem kolizji NIP-u co „dodaj" w formularzu umowy.
 */
export default function NowyKontrahentPage() {
  return (
    <ContractorForm
      mode="create"
      title="Nowy kontrahent"
      subtitle="Zanim dodasz firmę, sprawdź na liście, czy jej już nie ma — najpewniej po NIP-ie."
      backHref="/kontrahenci"
    />
  );
}

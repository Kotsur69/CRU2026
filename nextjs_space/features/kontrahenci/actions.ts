"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor, requireAdmin } from "@/lib/authz";
import { intParam } from "@/lib/utils";
import { nipFormatError, parseContractorInput, type ContractorFormErrors } from "@/lib/contractors";
import {
  createContractorRecord,
  setContractorDeleted,
  updateContractorRecord,
  type NipCollision,
} from "@/lib/contractors-db";

/**
 * Zapis słownika kontrahentów (docs/features/20).
 *
 * Dopisać firmę może każdy zalogowany (Q57): rejestrujący umowę musi móc dodać brakującą
 * firmę, a odsyłanie go do administratora byłoby gorsze. NIP zajęty przez żywy wpis
 * odmawia zapisu i pokazuje ten wpis. Edycja, usunięcie i przywrócenie zmieniają wpis, na
 * którym wiszą cudze umowy — to robi administrator (`requireAdmin`, reszta dostaje 404).
 * Scalania duplikatów tu nie ma: przenosi rekordy między kontrahentami, więc czeka na
 * decyzję działu prawnego (Q58).
 */

export interface ContractorFormState {
  errors: ContractorFormErrors;
  /** Kolizja NIP-u — formularz pyta człowieka, zamiast podmieniać kontrahenta po cichu. */
  conflict?: NipCollision;
}

/** Odczyt pól formularza — `FormData` zawsze daje tekst, resztę robi schemat. */
function readForm(formData: FormData): Record<string, unknown> {
  const one = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v : undefined;
  };
  return {
    shortName: one("shortName"),
    fullName: one("fullName"),
    vatId: one("vatId"),
    register: one("register"),
    address: one("address"),
    isCeidg: one("isCeidg"),
    isConnected: one("isConnected"),
  };
}

function contractorId(formData: FormData): number | undefined {
  return intParam(String(formData.get("id") ?? ""));
}

export async function createContractor(
  _state: ContractorFormState,
  formData: FormData,
): Promise<ContractorFormState> {
  const actor = await requireActor();

  const parsed = parseContractorInput(readForm(formData));
  if (!parsed.ok) return { errors: parsed.errors };
  const formatError = nipFormatError(parsed.values.vatId);
  if (formatError) return { errors: { vatId: formatError } };

  const result = await createContractorRecord(parsed.values, actor.id);
  if (!result.ok) return { errors: {}, conflict: result.conflict };

  revalidatePath("/kontrahenci");
  redirect(`/kontrahenci/${result.contractor.id}`);
}

export async function updateContractor(
  _state: ContractorFormState,
  formData: FormData,
): Promise<ContractorFormState> {
  const actor = await requireAdmin();

  const id = contractorId(formData);
  if (id === undefined) return { errors: { _form: "Nieprawidłowe żądanie zapisu." } };

  const parsed = parseContractorInput(readForm(formData));
  if (!parsed.ok) return { errors: parsed.errors };

  // „Zapisz mimo to" odsyła numer, o który się zderzyliśmy — potwierdza tylko ten jeden.
  const confirmed = formData.get("confirmVatId");
  const result = await updateContractorRecord(
    id,
    parsed.values,
    actor.id,
    typeof confirmed === "string" ? confirmed : null,
  );
  if (!result.ok) {
    return "conflict" in result
      ? { errors: {}, conflict: result.conflict }
      : { errors: result.errors };
  }

  revalidatePath("/kontrahenci");
  revalidatePath(`/kontrahenci/${id}`);
  redirect(`/kontrahenci/${id}`);
}

/**
 * Usunięcie jest wyłącznie miękkie, jak `deleted` w legacy: wpis znika z podpowiedzi,
 * ale zostaje na swoich umowach, a jego id żyje w 14 latach historii.
 */
async function setDeleted(formData: FormData, deleted: boolean): Promise<void> {
  const actor = await requireAdmin();

  const id = contractorId(formData);
  if (id === undefined) throw new Error("Nieprawidłowy kontrahent.");

  await setContractorDeleted(id, deleted, actor.id);

  revalidatePath("/kontrahenci");
  revalidatePath(`/kontrahenci/${id}`);
  redirect(`/kontrahenci/${id}`);
}

export async function deleteContractor(formData: FormData): Promise<void> {
  await setDeleted(formData, true);
}

export async function restoreContractor(formData: FormData): Promise<void> {
  await setDeleted(formData, false);
}

import type { ContractModule, Prisma } from "@prisma/client";

/**
 * Który rejestr pokazuje rekord. Decyduje `Contract.module` (legacy `project`,
 * docs/features/01), a nie `status.kind` — rekord, który stracił status, trafia dzięki
 * temu do właściwego rejestru. Tak znika 31 projektów bez statusu, które lista Umów
 * pokazywała jako umowy (docs/features/06).
 */
export function moduleWhere(module: ContractModule): Prisma.ContractWhereInput {
  return { module };
}

/** Twardy zakres rejestru: rekordy modułu, bez usuniętych (legacy soft delete). */
export function registerWhere(module: ContractModule): Prisma.ContractWhereInput[] {
  return [{ isDeleted: false }, moduleWhere(module)];
}

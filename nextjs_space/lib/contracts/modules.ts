import type { ContractModule, ContractStatusKind } from "@prisma/client";
import type { Tone } from "@/components/ui/badge";
import { projectStatusTone, riskStatusTone, statusTone } from "@/lib/contract-status";

/**
 * The three registers that share the `Contract` table.
 *
 * `Contract.module` (legacy `project`, docs/features/01) says which register a record
 * belongs to. It mirrors `ContractStatus.kind`, but lives on the record itself, so a
 * record that lost its status still lands in the right register. `LEGACY_2021` is the
 * fourth legacy value — 39 soft-deleted records shown nowhere — and has no register.
 */

/** A module that has a register of its own. Same three values as ContractStatusKind. */
export type RegisterModule = ContractStatusKind;

export const REGISTER_MODULES: readonly RegisterModule[] = ["CONTRACT", "PROJECT", "RISK"];

export const MODULE_PATH: Record<RegisterModule, string> = {
  CONTRACT: "/umowy",
  PROJECT: "/projekty",
  RISK: "/ryzyko",
};

/** The register's name as the legacy menu shows it. */
export const REGISTER_LABEL: Record<RegisterModule, string> = {
  CONTRACT: "Umowy",
  PROJECT: "Projekty",
  RISK: "Dział ryzyka",
};

export function isRegisterModule(value: string): value is RegisterModule {
  return (REGISTER_MODULES as readonly string[]).includes(value);
}

/** The register a record is listed in. `LEGACY_2021` falls back to Umowy. */
export function registerOf(module: ContractModule): RegisterModule {
  return module === "LEGACY_2021" ? "CONTRACT" : module;
}

export function modulePath(module: ContractModule): string {
  return MODULE_PATH[registerOf(module)];
}

/** Status badge palette. Each register has its own lifecycle, so its own colours. */
export function moduleStatusTone(module: ContractModule, statusName?: string | null): Tone {
  switch (registerOf(module)) {
    case "PROJECT":
      return projectStatusTone(statusName);
    case "RISK":
      return riskStatusTone(statusName);
    default:
      return statusTone(statusName);
  }
}

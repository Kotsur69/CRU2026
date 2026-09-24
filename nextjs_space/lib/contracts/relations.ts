import type { ContractModule, Prisma } from "@prisma/client";

/**
 * `parentId` znaczy w legacy dwie rzeczy (docs/features/07). Na umowie: „jestem aneksem
 * tamtej umowy". Na projekcie: „stałem się tamtą umową" — poprzednik w czasie zapisany
 * jako dziecko. Danych nie rozdzielamy; każde przejście po relacji pyta najpierw, w jakim
 * module jest drugi koniec, i dopiero wtedy wie, co link znaczy.
 */

/** Dzieci rekordu, które są jego aneksami — ten sam moduł co rodzic. */
export function annexesOf(parent: { id: number; module: ContractModule }): Prisma.ContractWhereInput {
  return { parentId: parent.id, module: parent.module, isDeleted: false };
}

/** Dzieci umowy, które są projektami, z których powstała (pole „Project" w legacy). */
export function projectsFor(contract: { id: number }): Prisma.ContractWhereInput {
  return { parentId: contract.id, module: "PROJECT", isDeleted: false };
}

interface LinkedRecord {
  id: number;
  identifier: string | null;
  module: ContractModule;
}

/** Dla projektu: umowa, którą się stał. Null, dopóki projekt jest w toku. */
export function resultingContract<T extends LinkedRecord>(project: {
  module: ContractModule;
  parent: T | null;
}): T | null {
  if (project.module !== "PROJECT") return null;
  return project.parent?.module === "CONTRACT" ? project.parent : null;
}

export interface Relations<P extends LinkedRecord, C extends LinkedRecord> {
  /** Umowa, której ten rekord jest aneksem („Aneks do umowy"). */
  annexOf: P | null;
  /** Umowa, którą projekt się stał. */
  resultingContract: P | null;
  /** Projekt nadrzędny projektu aneksu. */
  parentProject: P | null;
  /** Aneksy — dzieci z tego samego modułu. */
  annexes: C[];
  /** Projekty, z których umowa powstała („Project"). */
  projects: C[];
}

/**
 * Jedno wczytanie dzieci, podział w pamięci (docs/features/09): rekord ma co najwyżej
 * kilkadziesiąt dzieci, więc to taniej niż dwie przefiltrowane relacje.
 */
export function partitionRelations<P extends LinkedRecord, C extends LinkedRecord>(record: {
  module: ContractModule;
  parent: P | null;
  children: C[];
}): Relations<P, C> {
  const parent = record.parent;
  const isProject = record.module === "PROJECT";
  return {
    annexOf: !isProject && parent?.module === record.module ? parent : null,
    resultingContract: isProject && parent?.module === "CONTRACT" ? parent : null,
    parentProject: isProject && parent?.module === "PROJECT" ? parent : null,
    annexes: record.children.filter((c) => c.module === record.module),
    projects: isProject ? [] : record.children.filter((c) => c.module === "PROJECT"),
  };
}

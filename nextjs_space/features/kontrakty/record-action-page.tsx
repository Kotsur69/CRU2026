import { notFound } from "next/navigation";
import { ContractFormPage } from "./form-page";
import { AcceptanceFormPage } from "./acceptance-form-page";
import { QuestionPage } from "./question-page";

/**
 * Jedno wejście dla wszystkich akcji rekordu, żeby każdy z trzech rejestrów
 * (Umowy, Projekty, Dział ryzyka) miał je pod tymi samymi adresami bez powielania
 * pięciu identycznych plików tras na moduł.
 */

const ACTIONS = ["edycja", "aneks", "projekt-aneksu", "formularz-akceptacji", "pytanie"] as const;
export type RecordAction = (typeof ACTIONS)[number];

function isAction(value: string): value is RecordAction {
  return (ACTIONS as readonly string[]).includes(value);
}

export interface RecordActionPageProps {
  params: { id: string; akcja: string };
  searchParams: Record<string, string | undefined>;
  basePath: string;
}

export function RecordActionPage({ params, searchParams, basePath }: RecordActionPageProps) {
  // Oba segmenty są niezaufane: id musi być liczbą, akcja — jedną z wyliczonych.
  const id = Number.parseInt(params.id, 10);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  if (!isAction(params.akcja)) notFound();

  switch (params.akcja) {
    case "edycja":
      return <ContractFormPage id={id} mode="edit" basePath={basePath} />;
    case "aneks":
      return <ContractFormPage id={id} mode="annex" basePath={basePath} />;
    case "projekt-aneksu":
      return <ContractFormPage id={id} mode="annex-project" basePath={basePath} />;
    case "formularz-akceptacji":
      return <AcceptanceFormPage id={id} basePath={basePath} print={searchParams.druk === "1"} />;
    case "pytanie":
      return <QuestionPage id={id} basePath={basePath} />;
  }
}

import { z } from "zod";

/**
 * Kontrakt danych formularza umowy/projektu (zrzuty legacy + audyt sekcja 1.4).
 *
 * Ten sam zestaw pól obsługuje edycję umowy, „Dodaj aneks" i „Stwórz projekt aneksu" —
 * w legacy to jeden formularz, różniący się tylko tym, co jest w nim wstępnie wpisane.
 *
 * Walidacja żyje po stronie serwera, bo akcja serwerowa jest publicznym wejściem
 * dokładnie tak jak endpoint HTTP; klient nie jest tu żadnym zabezpieczeniem.
 */

const MAX_TEXT = 4000;
const MAX_SHORT_TEXT = 500;
const MAX_IDENTIFIER = 190;
const MAX_OWNERS = 100;
/** 14,2 w bazie — 12 cyfr części całkowitej. */
const MAX_SALARY = 999_999_999_999.99;

/** Puste pole formularza to brak wartości, nie pusty tekst. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maksymalnie ${max} znaków.`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .catch(null);

/** Select bez wyboru przysyła "" — traktujemy to jak brak wskazania. */
const optionalId = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number.parseInt(v, 10);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  });

const optionalDate = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v === null || v === undefined || v === "" ? null : v))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data musi mieć format RRRR-MM-DD.")
  .refine(
    (v) => v === null || !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()),
    "Nieistniejąca data.",
  );

/**
 * Kwota. Legacy przyjmuje i przecinek, i kropkę, a spacje w tysiącach pojawiają się
 * przy wklejaniu z Excela — wszystkie trzy trzeba znieść, zanim trafi to do DECIMAL.
 */
const optionalDecimal = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number") return String(v);
    return v.replace(/\s| /g, "").replace(",", ".");
  })
  .refine((v) => v === null || !Number.isNaN(Number(v)), "Kwota musi być liczbą.")
  .refine((v) => v === null || Math.abs(Number(v)) <= MAX_SALARY, "Kwota poza zakresem.");

const checkbox = z
  .union([z.boolean(), z.string(), z.undefined()])
  .transform((v) => v === true || v === "1" || v === "on" || v === "true");

/** Legacy `temp_form`: Tak / Nie / (niewskazane) — -1 w dumpie, null u nas. */
const triState = z
  .union([z.boolean(), z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === true || v === "1") return true;
    if (v === false || v === "0") return false;
    return null;
  });

const idList = z
  .array(z.union([z.string(), z.number()]))
  .max(MAX_OWNERS, `Maksymalnie ${MAX_OWNERS} osób.`)
  .transform((list) => {
    const out = new Set<number>();
    for (const raw of list) {
      const n = typeof raw === "number" ? raw : Number.parseInt(raw, 10);
      if (Number.isSafeInteger(n) && n > 0) out.add(n);
    }
    return [...out];
  })
  .catch([]);

export const contractFormSchema = z
  .object({
    // Klasyfikacja
    identifier: optionalText(MAX_IDENTIFIER),
    documentTypeId: optionalId,
    statusId: optionalId,
    companyId: optionalId,
    businesslineId: optionalId,
    primaryLocationId: optionalId,
    domainId: optionalId,
    natureId: optionalId,
    tradeId: optionalId,
    deliveryMethodId: optionalId,
    noticePeriodId: optionalId,
    contractReference: optionalText(MAX_IDENTIFIER),
    description: optionalText(MAX_TEXT),

    // Terminy
    dateBegin: optionalDate,
    dateEnd: optionalDate,
    /** „na czas nieokreślony" — zeruje datę zakończenia, bo tak brak końca zapisuje dump. */
    indefinite: checkbox,
    sentOn: optionalDate,

    // Finanse
    salary: optionalDecimal,
    currencyId: optionalId,
    specificSalaryTerms: optionalText(MAX_SHORT_TEXT),
    paymentTerm: optionalText(MAX_SHORT_TEXT),

    // Strony
    contractorId: optionalId,
    debtorId: optionalId,
    companiesConnected: checkbox,

    // Cechy
    tempForm: triState,
    obsc: checkbox,
    obscDescription: optionalText(MAX_SHORT_TEXT),
    insuranceGuarantee: checkbox,
    bill: checkbox,

    // Relacje
    ownerIds: idList,
    /** Podzbiór `ownerIds` — właściciele z prawem edycji (`contract_users.onlyRead = 0`). */
    editorIds: idList,
    reviewerIds: idList,
    remarks: optionalText(MAX_TEXT),

    /** Token sesji formularza — wiąże pliki wgrane przed pierwszym zapisem. */
    formSession: z.string().uuid().nullable().catch(null),
  })
  .superRefine((values, ctx) => {
    if (!values.indefinite && values.dateBegin && values.dateEnd) {
      if (values.dateEnd < values.dateBegin) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dateEnd"],
          message: "Data zakończenia nie może być wcześniejsza niż data zawarcia.",
        });
      }
    }
    for (const editorId of values.editorIds) {
      if (!values.ownerIds.includes(editorId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["editorIds"],
          message: "Prawo edycji może mieć tylko osoba z listy właścicieli.",
        });
        break;
      }
    }
  })
  .transform((values) => ({
    ...values,
    // „na czas nieokreślony" wygrywa nad wpisaną datą — tak działa checkbox w legacy.
    dateEnd: values.indefinite ? null : values.dateEnd,
  }));

export type ContractFormValues = z.infer<typeof contractFormSchema>;
export type ContractFormInput = z.input<typeof contractFormSchema>;

/** Błędy per pole, w kształcie, którego oczekuje formularz. */
export type ContractFormErrors = Partial<Record<string, string>>;

export function flattenIssues(error: z.ZodError): ContractFormErrors {
  const out: ContractFormErrors = {};
  for (const issue of error.issues) {
    const key = (issue.path[0] as string) ?? "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

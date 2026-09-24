import { describe, expect, it } from "vitest";
import { riskIdentifierFor, riskLetterMismatch, riskLetterOf } from "./risk-grammar";

describe("risk identifier grammar (YYYY/L/NNNN)", () => {
  it("pads the sequence to four digits", () => {
    expect(riskIdentifierFor("P", 2026, 17)).toBe("2026/P/0017");
  });

  it("reads the letter from a canonical identifier only", () => {
    expect(riskLetterOf("2020/C/0003")).toBe("C");
    expect(riskLetterOf("AMDSP/DYS/2026/0006")).toBeNull();
    expect(riskLetterOf(null)).toBeNull();
  });

  it("warns when the letter disagrees with the domain — the three legacy slips", () => {
    expect(riskLetterMismatch("2020/C/0003", { id: 33, name: "Ugoda" })).toBe(
      "Litera identyfikatora (C) nie zgadza się z rodzajem (Ugoda)",
    );
  });

  it("stays silent when they agree, or when there is nothing to compare", () => {
    expect(riskLetterMismatch("2026/U/0013", { id: 33, name: "Ugoda" })).toBeNull();
    expect(riskLetterMismatch("2026/U/0013", null)).toBeNull();
    expect(riskLetterMismatch("2026/U/0013", { id: 2, name: "Dostawa" })).toBeNull();
  });
});

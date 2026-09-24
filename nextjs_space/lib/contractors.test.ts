import { describe, expect, it } from "vitest";
import {
  contractorLabelWithNip,
  nipCollisionQuestion,
  nipDigits,
  nipFormatError,
  normaliseVatId,
  parseContractorInput,
} from "./contractors";

describe("NIP normalisation (docs/features/20)", () => {
  it("treats 123-456-78-90 and 1234567890 as the same number", () => {
    expect(normaliseVatId("123-456-78-90")).toBe("1234567890");
    expect(normaliseVatId("1234567890")).toBe("1234567890");
    expect(normaliseVatId(" 123 456 78 90 ")).toBe("1234567890");
  });

  it("drops the PL prefix of the EU VAT form, dots and non-breaking spaces", () => {
    expect(normaliseVatId("PL 526-025-09-95")).toBe("5260250995");
    expect(normaliseVatId("pl5260250995")).toBe("5260250995");
    expect(normaliseVatId("526.025.09.95")).toBe("5260250995");
    expect(normaliseVatId("526 025 09 95")).toBe("5260250995");
  });

  it("keeps a foreign number recognisable instead of inventing digits", () => {
    expect(normaliseVatId("DE 123 456 789")).toBe("DE123456789");
  });

  it("returns null for an empty field", () => {
    expect(normaliseVatId("")).toBeNull();
    expect(normaliseVatId("  - ")).toBeNull();
    expect(normaliseVatId(null)).toBeNull();
    expect(normaliseVatId(undefined)).toBeNull();
  });

  it("compares stored legacy values by digits, as the database does", () => {
    expect(nipDigits("526-025-09-95")).toBe("5260250995");
    expect(nipDigits(null)).toBe("");
  });
});

describe("NIP validation", () => {
  it("accepts ten digits and an empty field", () => {
    expect(nipFormatError("5260250995")).toBeNull();
    expect(nipFormatError(null)).toBeNull();
  });

  it("rejects anything else after normalisation", () => {
    expect(nipFormatError("526025099")).toMatch(/10 cyfr/);
    expect(nipFormatError("52602509951")).toMatch(/10 cyfr/);
    expect(nipFormatError("DE123456789")).toMatch(/10 cyfr/);
  });
});

describe("contractor form schema", () => {
  it("requires the short name and normalises the NIP", () => {
    const parsed = parseContractorInput({ shortName: "  Transpol ", vatId: "526-025-09-95" });
    expect(parsed).toEqual({
      ok: true,
      values: {
        shortName: "Transpol",
        fullName: null,
        vatId: "5260250995",
        register: null,
        address: null,
        isCeidg: false,
        isConnected: false,
      },
    });
    expect(parseContractorInput({ shortName: "   " })).toEqual({
      ok: false,
      errors: { shortName: "Nazwa skrócona jest wymagana." },
    });
  });

  it("rejects over-long fields instead of truncating them", () => {
    const parsed = parseContractorInput({ shortName: "x".repeat(191), address: "y".repeat(501) });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errors.shortName).toBe("Maksymalnie 190 znaków.");
      expect(parsed.errors.address).toBe("Maksymalnie 500 znaków.");
    }
  });

  it("reads checkboxes from a form and booleans from JSON", () => {
    const fromForm = parseContractorInput({ shortName: "A", isCeidg: "1", isConnected: undefined });
    const fromJson = parseContractorInput({ shortName: "A", isCeidg: false, isConnected: true });
    expect(fromForm.ok && fromForm.values.isCeidg).toBe(true);
    expect(fromForm.ok && fromForm.values.isConnected).toBe(false);
    expect(fromJson.ok && fromJson.values.isConnected).toBe(true);
  });

  it("ignores values of the wrong type from a JSON body", () => {
    const parsed = parseContractorInput({ shortName: "A", vatId: 5260250995, fullName: {} });
    expect(parsed.ok && parsed.values.vatId).toBeNull();
    expect(parsed.ok && parsed.values.fullName).toBeNull();
  });
});

describe("labels and messages", () => {
  it("labels a counterparty the way the legacy preview does", () => {
    const k = { id: 7, shortName: "Hotel Lamberton Sp. z o.o.", fullName: null, vatId: "1182274493" };
    expect(contractorLabelWithNip(k)).toBe("Hotel Lamberton Sp. z o.o. NIP: 1182274493");
    expect(contractorLabelWithNip({ ...k, vatId: null })).toBe("Hotel Lamberton Sp. z o.o.");
  });

  it("asks before reusing an existing counterparty", () => {
    expect(nipCollisionQuestion("Transpol")).toBe(
      "Kontrahent o tym NIP już istnieje: Transpol. Użyć go?",
    );
  });
});

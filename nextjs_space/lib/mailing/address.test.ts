import { describe, expect, it } from "vitest";
import { LEGACY_EMAIL_WIDTH, addressIssue } from "./address";

describe("addressIssue", () => {
  it("flags a contact with no address", () => {
    expect(addressIssue(null)).toBe("missing");
    expect(addressIssue("   ")).toBe("missing");
  });

  it("accepts the longest address the spec quotes", () => {
    expect(addressIssue("agnieszka.golembka-rosikon@arcelormittal.com")).toBeNull();
  });

  it("suspects an address that fills legacy char(50) exactly", () => {
    const full = `${"a".repeat(LEGACY_EMAIL_WIDTH - "@arcelormittal.com".length)}@arcelormittal.com`;
    expect(full).toHaveLength(50);
    expect(addressIssue(full)).toBe("suspect");
    expect(addressIssue(full.slice(1))).toBeNull();
  });

  it("suspects an address cut before its domain ends", () => {
    expect(addressIssue("jan.kowalski@arcelormittal.c")).toBe("suspect");
    expect(addressIssue("jan.kowalski@arcelormitt")).toBe("suspect");
    expect(addressIssue("jan.kowalski")).toBe("suspect");
  });
});

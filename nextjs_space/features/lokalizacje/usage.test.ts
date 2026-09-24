import { describe, expect, it } from "vitest";
import {
  formatCount,
  isUnused,
  matchesName,
  recordsLabel,
  sortLocations,
  sortParam,
  toUsageRows,
  type LocationUsageRow,
} from "./usage";

const row = (id: number, name: string, primary: number, linked = 0): LocationUsageRow => ({
  id,
  name,
  active: true,
  primary,
  linked,
  grants: 0,
});

describe("location usage rows", () => {
  it("merges the three grouped counts and treats a missing group as zero", () => {
    const rows = toUsageRows(
      [
        { id: 1, name: "(brak danych)", active: true },
        { id: 33, name: "Łódź", active: false },
      ],
      {
        primary: new Map([
          [1, 8161],
          [null, 520],
        ]),
        linked: new Map([[1, 7900]]),
        grants: new Map([[33, 2]]),
      },
    );
    expect(rows).toEqual([
      { id: 1, name: "(brak danych)", active: true, primary: 8161, linked: 7900, grants: 0 },
      { id: 33, name: "Łódź", active: false, primary: 0, linked: 0, grants: 2 },
    ]);
  });

  it("calls a location unused only when no record points at it either way", () => {
    expect(isUnused({ primary: 0, linked: 0 })).toBe(true);
    expect(isUnused({ primary: 0, linked: 3 })).toBe(false);
    expect(isUnused({ primary: 1, linked: 0 })).toBe(false);
  });
});

describe("name filter", () => {
  it("matches a fragment regardless of case, Polish letters included", () => {
    expect(matchesName("Świętochłowice", "święto")).toBe(true);
    expect(matchesName("Łódź", "ŁÓDŹ")).toBe(true);
    expect(matchesName("Dąbrowa Górnicza II", " górnicza ")).toBe(true);
    expect(matchesName("Kraków", "Katowice")).toBe(false);
  });

  it("lets everything through when empty — (brak danych) is never filtered out silently", () => {
    expect(matchesName("(brak danych)", undefined)).toBe(true);
    expect(matchesName("(brak danych)", "   ")).toBe(true);
  });
});

describe("ordering", () => {
  const rows = [
    row(28, "Wrocław", 186),
    row(33, "Łódź", 1),
    row(1, "(brak danych)", 8161),
    row(25, "Szczecin", 11),
    row(24, "Świętochłowice", 1094),
    row(9, "Katowice", 2070),
    row(2, "BCS", 7),
    row(35, "Bydgoszcz", 7),
    row(14, "Łazy", 4),
    row(15, "Olkusz", 4),
    row(13, "Lublin", 113),
    row(40, "Żary", 0),
    row(41, "Zabrze", 0),
  ];

  it("defaults to record count, descending, ties broken by name", () => {
    expect(sortParam(undefined)).toBe("records");
    expect(sortParam("bogus")).toBe("records");
    expect(sortLocations(rows, "records").map((r) => r.name)).toEqual([
      "(brak danych)",
      "Katowice",
      "Świętochłowice",
      "Wrocław",
      "Lublin",
      "Szczecin",
      "BCS",
      "Bydgoszcz",
      "Łazy",
      "Olkusz",
      "Łódź",
      "Zabrze",
      "Żary",
    ]);
  });

  it("sorts by name in Polish order — Ł after L, Ś after S, Ż after Z", () => {
    expect(sortParam("name")).toBe("name");
    expect(sortLocations(rows, "name").map((r) => r.name)).toEqual([
      "(brak danych)",
      "BCS",
      "Bydgoszcz",
      "Katowice",
      "Lublin",
      "Łazy",
      "Łódź",
      "Olkusz",
      "Szczecin",
      "Świętochłowice",
      "Wrocław",
      "Zabrze",
      "Żary",
    ]);
  });

  it("does not reorder the caller's array", () => {
    const before = rows.map((r) => r.id);
    sortLocations(rows, "name");
    expect(rows.map((r) => r.id)).toEqual(before);
  });
});

describe("Polish counts", () => {
  it("groups thousands with a non-breaking space, four digits included", () => {
    expect(formatCount(7)).toBe("7");
    expect(formatCount(582)).toBe("582");
    expect(formatCount(8161)).toBe("8 161");
    expect(formatCount(20106)).toBe("20 106");
    expect(formatCount(1234567)).toBe("1 234 567");
  });

  it("declines the noun: rekord / rekordy / rekordów, kept on one line with the number", () => {
    const label = (n: number) => recordsLabel(n).replace(/ /g, " ");
    expect(label(0)).toBe("0 rekordów");
    expect(label(1)).toBe("1 rekord");
    expect(label(2)).toBe("2 rekordy");
    expect(label(4)).toBe("4 rekordy");
    expect(label(5)).toBe("5 rekordów");
    expect(label(12)).toBe("12 rekordów");
    expect(label(22)).toBe("22 rekordy");
    expect(label(8161)).toBe("8 161 rekordów");
    expect(recordsLabel(8161)).not.toContain(" ");
  });
});

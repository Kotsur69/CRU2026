import { describe, expect, it } from "vitest";
import {
  compareIdentifiers,
  composeIdentifier,
  composePrefix,
  highestAnnex,
  parseIdentifier,
  type ParsedIdentifier,
} from "./identifier";

/**
 * The 18 shapes of the imported register (docs/features/02, "Observed shapes"), each
 * with the decomposition legacy's `contractview` produces — except that a non-numeric
 * segment yields null where legacy's abs() returned 0.
 */
const SHAPES: [shape: string, example: string, expected: ParsedIdentifier][] = [
  ["9999/9999", "2019/0466", { prefix: null, year: 2019, isProject: false, sequence: 466, annex: 0 }],
  ["9999/P9999", "2018/P0134", { prefix: null, year: 2018, isProject: true, sequence: 134, annex: 0 }],
  [
    "C/C/9999/P9999",
    "AMDSP/DYS/2025/P0481",
    { prefix: "AMDSP/DYS", year: 2025, isProject: true, sequence: 481, annex: 0 },
  ],
  ["9999/9999/A99", "2015/0231/A01", { prefix: null, year: 2015, isProject: false, sequence: 231, annex: 1 }],
  [
    "C/C/9999/9999",
    "AMDSP/DYS/2026/0006",
    { prefix: "AMDSP/DYS", year: 2026, isProject: false, sequence: 6, annex: 0 },
  ],
  [
    "C/C/9999/9999/A99",
    "AMDSP/DYS/2024/0112/A01",
    { prefix: "AMDSP/DYS", year: 2024, isProject: false, sequence: 112, annex: 1 },
  ],
  ["C/9999/P9999", "AMDSP/2023/P0044", { prefix: "AMDSP", year: 2023, isProject: true, sequence: 44, annex: 0 }],
  ["C C/9999/P9999", "HK POM/2025/P0012", { prefix: "HK POM", year: 2025, isProject: true, sequence: 12, annex: 0 }],
  ["C/9999/9999", "AMC/2022/0004", { prefix: "AMC", year: 2022, isProject: false, sequence: 4, annex: 0 }],
  ["9999/U/9999", "2019/U/0466", { prefix: "2019", year: null, isProject: false, sequence: 466, annex: 0 }],
  ["9999/P/9999", "2020/P/0017", { prefix: "2020", year: null, isProject: false, sequence: 17, annex: 0 }],
  ["C C/9999/9999", "HK POM/2026/0020", { prefix: "HK POM", year: 2026, isProject: false, sequence: 20, annex: 0 }],
  ["C/9999/9999/A99", "AMC/2022/0004/A01", { prefix: "AMC", year: 2022, isProject: false, sequence: 4, annex: 1 }],
  [
    "C C/9999/9999/A99",
    "HK POM/2026/0020/A02",
    { prefix: "HK POM", year: 2026, isProject: false, sequence: 20, annex: 2 },
  ],
  ["9999/C/9999", "2020/C/0003", { prefix: "2020", year: null, isProject: false, sequence: 3, annex: 0 }],
  ["/9999/P9999", "/2019/P0134", { prefix: null, year: 2019, isProject: true, sequence: 134, annex: 0 }],
  ["/9999/9999", "/2019/0466", { prefix: null, year: 2019, isProject: false, sequence: 466, annex: 0 }],
  ["9999/S9999", "2019/S0466", { prefix: null, year: 2019, isProject: false, sequence: null, annex: 0 }],
];

describe("parseIdentifier", () => {
  it.each(SHAPES)("parses the %s shape (%s)", (_shape, example, expected) => {
    expect(parseIdentifier(example)).toEqual(expected);
  });

  it("covers all 18 observed shapes", () => {
    expect(new Set(SHAPES.map(([shape]) => shape)).size).toBe(18);
  });

  it("returns null, not 0, for a non-numeric year segment", () => {
    expect(parseIdentifier("2019/U/0466").year).toBeNull();
  });

  it("detects an annex by the string shape, whatever the document type", () => {
    expect(parseIdentifier("2012/0258").annex).toBe(0);
    expect(parseIdentifier("2012/0258/A03").annex).toBe(3);
  });

  it("accepts one to three annex digits", () => {
    expect(parseIdentifier("2015/0231/A1").annex).toBe(1);
    expect(parseIdentifier("2015/0231/A001").annex).toBe(1);
    expect(parseIdentifier("2015/0231/A120").annex).toBe(120);
  });

  it("trims surrounding whitespace", () => {
    expect(parseIdentifier("  AMDSP/DYS/2026/0006 ").sequence).toBe(6);
  });
});

describe("composeIdentifier", () => {
  const canonical = [
    "2019/0466",
    "2018/P0134",
    "AMDSP/DYS/2025/P0481",
    "2015/0231/A01",
    "AMDSP/DYS/2024/0112/A01",
    "HK POM/2025/P0012",
    "HK POM/2026/0020/A02",
  ];

  it.each(canonical)("round-trips %s", (identifier) => {
    const parsed = parseIdentifier(identifier);
    expect(
      composeIdentifier({
        prefix: parsed.prefix,
        year: parsed.year!,
        isProject: parsed.isProject,
        sequence: parsed.sequence!,
        annex: parsed.annex,
      }),
    ).toBe(identifier);
  });

  it("pads the sequence to four digits and keeps the P", () => {
    expect(composeIdentifier({ prefix: "AMDSP/DYS", year: 2026, isProject: true, sequence: 7 })).toBe(
      "AMDSP/DYS/2026/P0007",
    );
  });

  it("widens past 9999 instead of truncating", () => {
    expect(composeIdentifier({ prefix: null, year: 2026, isProject: false, sequence: 10000 })).toBe(
      "2026/10000",
    );
  });
});

describe("composePrefix", () => {
  const amdsp = { shortName: "AMDSP" };

  it("uses the businessline's short name, never the long one", () => {
    expect(composePrefix(amdsp, { name: "DYSTRYBUCJA", shortName: "DYS" })).toBe("AMDSP/DYS");
  });

  it("falls back to the long name only when there is no short name", () => {
    expect(composePrefix(amdsp, { name: "NOWA", shortName: null })).toBe("AMDSP/NOWA");
  });

  it("drops placeholder dictionary rows", () => {
    expect(composePrefix(amdsp, { name: "---", shortName: null })).toBe("AMDSP");
    expect(composePrefix({ shortName: "(brak danych)" }, null)).toBeNull();
  });

  it("keeps a space inside a company short name", () => {
    expect(composePrefix({ shortName: "HK POM" }, null)).toBe("HK POM");
  });
});

describe("highestAnnex", () => {
  it("takes the maximum, not a count — a gap is not refilled", () => {
    expect(highestAnnex(["2015/0231/A01", "2015/0231/A03"])).toBe(3);
  });

  it("ignores children that are not annexes, such as projects", () => {
    expect(highestAnnex(["AMDSP/DYS/2025/P0481", null, "2015/0231/A02"])).toBe(2);
  });

  it("is 0 when there is no annex yet", () => {
    expect(highestAnnex([])).toBe(0);
  });
});

describe("compareIdentifiers", () => {
  it("sorts annexes numerically: /A10 after /A2", () => {
    const sorted = ["2015/0231/A10", "2015/0231/A2", "2015/0231/A01"].sort(compareIdentifiers);
    expect(sorted).toEqual(["2015/0231/A01", "2015/0231/A2", "2015/0231/A10"]);
  });

  it("sorts sequences numerically: P1000 after P999", () => {
    expect(compareIdentifiers("2026/P1000", "2026/P0999")).toBeGreaterThan(0);
  });

  it("puts unparseable years and missing identifiers last", () => {
    const sorted = [null, "2019/U/0466", "2020/0001", "2019/0002"].sort(compareIdentifiers);
    expect(sorted).toEqual(["2019/0002", "2020/0001", "2019/U/0466", null]);
  });
});

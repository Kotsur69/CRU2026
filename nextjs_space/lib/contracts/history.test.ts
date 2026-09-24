import { describe, expect, it } from "vitest";
import {
  diffSnapshots,
  renderHistoryValue,
  withOpinionRound,
  type HistoryLookups,
} from "./history";

const lookups: HistoryLookups = {
  documentTypes: new Map([
    [2, "Umowa"],
    [4, "Kontrakt"], // wygaszony — musi się dalej tłumaczyć
  ]),
  statuses: new Map([[1, "Obowiązująca"]]),
  companies: new Map(),
  businesslines: new Map(),
  locations: new Map(),
  domains: new Map(),
  natures: new Map(),
  trades: new Map(),
  deliveryMethods: new Map(),
  noticePeriods: new Map(),
  currencies: new Map(),
  contractors: new Map([[103, "Transpol"]]),
  users: new Map([[50463, "Borowiecka Maria"]]),
};
const format = { date: (iso: string) => `D:${iso}`, money: (v: string) => `M:${v}` };
const render = (column: string, raw: string | null) =>
  renderHistoryValue(column, raw, lookups, format);

describe("renderHistoryValue", () => {
  it("resolves a legacy dictionary id, including a retired entry", () => {
    expect(render("type_id", "4").text).toBe("Kontrakt");
  });

  it("marks an id the dictionary no longer has instead of rendering blank", () => {
    expect(render("type_id", "9").text).toBe("#9 (usunięty)");
  });

  it("passes our own label-valued entries through", () => {
    expect(render("status_id", "Obowiązująca").text).toBe("Obowiązująca");
  });

  it("resolves giveopinions user ids to names; 0 means nobody", () => {
    expect(render("giveopinions", "50463").text).toBe("Borowiecka Maria");
    expect(render("giveopinions", "0").text).toBeNull();
  });

  it("renders the 0000-00-00 sentinel as empty and real dates through the formatter", () => {
    expect(render("date_end", "0000-00-00").text).toBeNull();
    expect(render("date_end", "2024-01-09").text).toBe("D:2024-01-09");
  });

  it("reads flags, including legacy's -1 on temp_form", () => {
    expect(render("bill", "1").text).toBe("Tak");
    expect(render("OBSC", "0").text).toBe("Nie");
    expect(render("temp_form", "-1").text).toBe("nie wskazano");
  });

  it("flags a text value at exactly the legacy 50-character limit as possibly truncated", () => {
    const fifty = "x".repeat(50);
    expect(render("description", fifty).truncated).toBe(true);
    expect(render("description", "x".repeat(49)).truncated).toBe(false);
    expect(render("salary", "5086.8").text).toBe("M:5086.8");
  });
});

describe("history writes", () => {
  it("records the opinion-round coordinator as a raw user id, 0 for nobody", () => {
    expect(withOpinionRound({}, null)).toEqual({ giveopinions: "0" });
    expect(withOpinionRound({}, 50463)).toEqual({ giveopinions: "50463" });
  });

  it("diffs only the columns that changed", () => {
    expect(diffSnapshots({ a: "1", b: "x" }, { a: "1", b: "y" })).toEqual([
      { columnName: "b", oldValue: "x", newValue: "y" },
    ]);
  });
});

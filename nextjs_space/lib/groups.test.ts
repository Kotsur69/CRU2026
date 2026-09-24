import { describe, expect, it } from "vitest";
import {
  GROUP_NAME_MAX,
  readGroupForm,
  readMembershipForm,
  sortByLabel,
  splitGroupHistory,
  type HistoryEntry,
} from "./groups";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("group edit form", () => {
  it("reads the four fields, trimming the name", () => {
    const parsed = readGroupForm(
      form({ name: "  Supplychain grupa D. Pruszkowski ", active: "1", ownerId: "495", businesslineId: "2" }),
    );
    expect(parsed.success && parsed.data).toEqual({
      name: "Supplychain grupa D. Pruszkowski",
      active: true,
      ownerId: 495,
      businesslineId: 2,
    });
  });

  it("treats an unticked checkbox and empty selects as inactive and unset", () => {
    const parsed = readGroupForm(form({ name: "Tylko do odczytu", ownerId: "", businesslineId: "" }));
    expect(parsed.success && parsed.data).toEqual({
      name: "Tylko do odczytu",
      active: false,
      ownerId: null,
      businesslineId: null,
    });
  });

  it("rejects a blank name and one longer than legacy varchar(50)", () => {
    const blank = readGroupForm(form({ name: "   " }));
    expect(blank.success).toBe(false);
    expect(!blank.success && blank.error.issues[0].path).toEqual(["name"]);

    expect(readGroupForm(form({ name: "x".repeat(GROUP_NAME_MAX) })).success).toBe(true);
    expect(readGroupForm(form({ name: "x".repeat(GROUP_NAME_MAX + 1) })).success).toBe(false);
  });

  it("rejects a malformed id instead of silently clearing the field", () => {
    for (const bad of ["abc", "12abc", "-5", "0", "1.5"]) {
      const parsed = readGroupForm(form({ name: "Grupa", ownerId: bad }));
      expect(parsed.success, bad).toBe(false);
      expect(!parsed.success && parsed.error.issues[0].path, bad).toEqual(["ownerId"]);
    }
  });
});

describe("membership form", () => {
  it("reads the group and the person as positive integers", () => {
    expect(readMembershipForm(form({ groupId: "7", userId: "50463" }))).toEqual({
      groupId: 7,
      userId: 50463,
    });
  });

  it("leaves out whatever is missing or not a positive integer", () => {
    expect(readMembershipForm(form({ groupId: "7", userId: "" }))).toEqual({
      groupId: 7,
      userId: undefined,
    });
    expect(readMembershipForm(form({ groupId: "-1", userId: "x" }))).toEqual({
      groupId: undefined,
      userId: undefined,
    });
  });
});

describe("group history", () => {
  type Row = HistoryEntry & { name: string };
  const at = (iso: string) => new Date(iso);
  const rows: Row[] = [
    { id: 1, action: null, changedAt: null, name: "legacy-50463" },
    { id: 2, action: null, changedAt: null, name: "legacy-495" },
    { id: 400, action: "ADDED", changedAt: at("2026-09-24T10:00:00Z"), name: "Kowalski Jan" },
    { id: 401, action: "REMOVED", changedAt: at("2026-09-24T11:00:00Z"), name: "Kowalski Jan" },
    { id: 402, action: "ADDED", changedAt: at("2026-09-24T11:00:00Z"), name: "Nowak Anna" },
  ];

  it("keeps legacy rows (no action, no date) apart from ours", () => {
    const { changes, legacy } = splitGroupHistory(rows, (r) => r.name);
    expect(changes.map((r) => r.id)).toEqual([402, 401, 400]);
    expect(legacy.every((r) => r.changedAt === null)).toBe(true);
  });

  it("orders legacy rows by name, never by id — there is no chronology to show", () => {
    const { legacy } = splitGroupHistory(rows, (r) => r.name);
    expect(legacy.map((r) => r.name)).toEqual(["legacy-495", "legacy-50463"]);
  });
});

describe("sortByLabel", () => {
  it("sorts the Polish way and numbers numerically", () => {
    const names = ["Łukasiewicz Anna", "Mazur Mateusz", "Lis Piotr", "legacy-50272", "legacy-495"];
    expect(sortByLabel(names, (n) => n)).toEqual([
      "legacy-495",
      "legacy-50272",
      "Lis Piotr",
      "Łukasiewicz Anna",
      "Mazur Mateusz",
    ]);
  });
});

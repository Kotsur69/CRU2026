import { describe, expect, it } from "vitest";
import {
  conventionKeys,
  foldName,
  proposalsForContact,
  proposeMatches,
  type ContactNames,
  type LoginEntry,
} from "./match";

const contact = (
  id: number,
  firstName: string | null,
  lastName: string | null,
  email: string | null = null,
): ContactNames => ({ id, firstName, lastName, email });

const login = (value: string, userId: number | null = null): LoginEntry => ({ login: value, userId });

/** login → [contact id, confidence] for the group approved wholesale. */
const settled = (report: ReturnType<typeof proposeMatches>) =>
  report.unambiguous.map((p) => [p.login.login, p.candidates[0].contact.id, p.candidates[0].confidence]);

describe("foldName", () => {
  it("lower-cases and folds Polish diacritics, ł included", () => {
    expect(foldName("Gołembka-Rosikoń")).toBe("golembka-rosikon");
    expect(foldName("Długosz")).toBe("dlugosz");
    expect(foldName(" ŁUCJA Źdźbło-Ślęzak ")).toBe("lucja zdzblo-slezak");
  });
});

describe("conventionKeys", () => {
  it("gives the same login from the name and from the address", () => {
    expect(
      conventionKeys(contact(1, "Małgorzata", "Borowiecka", "malgorzata.borowiecka@arcelormittal.com")),
    ).toEqual({ name: ["mborowiecka"], address: ["mborowiecka"], partial: [] });
  });

  it("writes a double surname hyphenated and run together, and keeps its parts apart", () => {
    const keys = conventionKeys(
      contact(2, "Agnieszka", "Gołembka-Rosikoń", "agnieszka.golembka-rosikon@arcelormittal.com"),
    );
    expect(keys.name).toEqual(["agolembka-rosikon", "agolembkarosikon"]);
    expect(keys.address).toEqual(keys.name);
    expect(keys.partial).toEqual(["agolembka", "arosikon"]);
  });

  it("reads nothing from a missing or differently shaped address", () => {
    expect(conventionKeys(contact(3, "Adrian", "Długosz")).address).toEqual([]);
    expect(conventionKeys(contact(3, "Adrian", "Długosz", "adrian.dlugosz")).address).toEqual([]);
    expect(conventionKeys(contact(3, "Adrian", "Długosz", "adlugosz@arcelormittal.com")).address).toEqual([]);
  });

  it("drops the digit an address adds to tell namesakes apart", () => {
    expect(conventionKeys(contact(4, "Jan", "Kowalski", "jan.kowalski2@arcelormittal.com")).address).toEqual([
      "jkowalski",
    ]);
  });
});

describe("proposeMatches", () => {
  const contacts = [
    contact(10, "Małgorzata", "Borowiecka", "malgorzata.borowiecka@arcelormittal.com"),
    contact(11, "Marek", "Gołosz", "marek.golosz@arcelormittal.com"),
    contact(12, "Krzysztof", "Andrzejczak", "krzysztof.andrzejczak@arcelormittal.com"),
  ];

  it("proposes the right contacts for the two logins the audit records (audyt §1.4)", () => {
    const report = proposeMatches([login("mgolosz"), login("mborowiecka")], contacts);
    expect(settled(report)).toEqual([
      ["mborowiecka", 10, "high"],
      ["mgolosz", 11, "high"],
    ]);
    expect(report.ambiguous).toEqual([]);
    expect(report.unmatched).toEqual([]);
  });

  it("matches regardless of case and diacritics in the login", () => {
    expect(settled(proposeMatches([login("MGołosz", 7)], contacts))).toEqual([["MGołosz", 11, "high"]]);
  });

  it("sends namesakes with the same initial and surname to the ambiguous group", () => {
    const report = proposeMatches(
      [login("jkowalski")],
      [
        contact(20, "Jan", "Kowalski", "jan.kowalski@arcelormittal.com"),
        contact(21, "Józef", "Kowalski", "jozef.kowalski@arcelormittal.com"),
      ],
    );
    expect(report.unambiguous).toEqual([]);
    expect(report.ambiguous).toHaveLength(1);
    expect(report.ambiguous[0].reason).toBe("shared");
    expect(report.ambiguous[0].candidates.map((c) => c.contact.id)).toEqual([20, 21]);
  });

  it("flags a contact that two logins want", () => {
    // The name says Jachym, the address Nowak — both logins point at the same person.
    const report = proposeMatches(
      [login("bjachym"), login("bnowak")],
      [contact(30, "Beata", "Jachym", "beata.nowak@arcelormittal.com")],
    );
    expect(report.unambiguous).toEqual([]);
    expect(report.ambiguous.map((p) => [p.login.login, p.reason, p.candidates[0].confidence])).toEqual([
      ["bjachym", "contested", "medium"],
      ["bnowak", "contested", "medium"],
    ]);
  });

  it("rates a match medium when only the name or only the address gives the login", () => {
    const report = proposeMatches(
      [login("anowak"), login("pzielinski")],
      [
        contact(40, "Anna", "Nowak"),
        contact(41, "Piotr", "Zieliński-Kmieć", "piotr.zielinski@arcelormittal.com"),
      ],
    );
    expect(settled(report)).toEqual([
      ["anowak", 40, "medium"],
      ["pzielinski", 41, "medium"],
    ]);
  });

  it("never settles a login that only one part of a double surname gives", () => {
    const report = proposeMatches(
      [login("arosikon"), login("agolembkarosikon")],
      [contact(50, "Agnieszka", "Gołembka-Rosikoń", "agnieszka.golembka-rosikon@arcelormittal.com")],
    );
    // Both logins want the one contact, so neither is settled; the part alone is low.
    expect(report.unambiguous).toEqual([]);
    expect(report.ambiguous.map((p) => [p.login.login, p.reason, p.candidates[0].confidence])).toEqual([
      ["agolembkarosikon", "contested", "high"],
      ["arosikon", "contested", "low"],
    ]);

    const alone = proposeMatches([login("arosikon")], [contact(50, "Agnieszka", "Gołembka-Rosikoń")]);
    expect(alone.ambiguous.map((p) => [p.login.login, p.reason])).toEqual([["arosikon", "partial"]]);
  });

  it("skips placeholder logins and reports logins with no contact", () => {
    const report = proposeMatches([login("legacy-50463", 50463), login("admin", 1000000)], contacts);
    expect(report.unambiguous).toEqual([]);
    expect(report.ambiguous).toEqual([]);
    expect(report.unmatched).toEqual([login("admin", 1000000)]);
  });

  it("leaves its input untouched", () => {
    const logins = Object.freeze([Object.freeze(login("mgolosz", 7))]);
    const frozen = Object.freeze(contacts.map((c) => Object.freeze({ ...c })));
    expect(() => proposeMatches(logins, frozen)).not.toThrow();
    expect(frozen).toEqual(contacts);
  });
});

describe("proposalsForContact", () => {
  it("lists every login that names the contact, with its group", () => {
    const contacts = [
      contact(60, "Jan", "Kowalski", "jan.kowalski@arcelormittal.com"),
      contact(61, "Jan", "Kowalski", "jan.kowalski@arcelormittal.com"),
      contact(62, "Anna", "Nowak", "anna.nowak@arcelormittal.com"),
    ];
    const report = proposeMatches([login("jkowalski", 1), login("anowak", 2)], contacts);
    expect(proposalsForContact(report, 61)).toEqual([
      { login: login("jkowalski", 1), confidence: "high", reason: "shared" },
    ]);
    expect(proposalsForContact(report, 62)).toEqual([
      { login: login("anowak", 2), confidence: "high", reason: null },
    ]);
    expect(proposalsForContact(report, 99)).toEqual([]);
  });
});

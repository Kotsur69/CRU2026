import { describe, expect, it } from "vitest";
import { NAV_ITEMS, navItemsFor } from "./nav";

describe("navItemsFor", () => {
  it("hides the administration screens from everyone but administrators", () => {
    const labels = navItemsFor(false).map((item) => item.label);
    expect(labels).not.toContain("Grupy");
    expect(labels).toContain("Umowy");
  });

  it("shows administrators the full legacy menu, in legacy order", () => {
    expect(navItemsFor(true)).toEqual(NAV_ITEMS);
  });
});

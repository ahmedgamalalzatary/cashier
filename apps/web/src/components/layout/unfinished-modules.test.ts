import { describe, expect, it } from "vitest";
import { unfinishedModules } from "./unfinished-modules";

describe("unfinished module routes", () => {
  it("defines an intentional placeholder for every advertised unfinished route", () => {
    expect(Object.keys(unfinishedModules).sort()).toEqual(
      [
        "cafe",
        "employees",
        "expenses",
        "recipes",
        "refunds",
        "reports",
        "salaries",
        "shifts",
        "waste",
      ].sort(),
    );
    for (const details of Object.values(unfinishedModules)) {
      expect(details.title.length).toBeGreaterThan(0);
      expect(details.description.length).toBeGreaterThan(0);
    }
  });
});

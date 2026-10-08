import { testId } from "@cashier/shared/test-support";
import { describe, expect, it } from "vitest";
import type { Category } from "@cashier/shared";
import {
  categoryParentOptions,
  categoryUpdateBody,
} from "../../src/models/category-model";

const categories: Category[] = [
  { id: testId(1), name: "First", parentId: null, isActive: true, createdAt: "" },
  { id: testId(2), name: "Second", parentId: null, isActive: true, createdAt: "" },
  { id: testId(3), name: "Inactive", parentId: null, isActive: false, createdAt: "" },
];

describe("category edit model", () => {
  it("omits an unchanged parent from a name-only edit", () => {
    expect(categoryUpdateBody("Renamed", testId(2), testId(2))).toEqual({
      name: "Renamed",
    });
  });

  it("sends a changed parent, including null when promoting to main", () => {
    expect(categoryUpdateBody("Moved", testId(2), testId(1))).toEqual({
      name: "Moved",
      parentId: testId(2),
    });
    expect(categoryUpdateBody("Main", "", testId(1))).toEqual({
      name: "Main",
      parentId: null,
    });
  });

  it("offers active main categories other than the category itself", () => {
    expect(categoryParentOptions(categories, testId(1)).map((row) => row.id)).toEqual([
      testId(2),
    ]);
  });
});

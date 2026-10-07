import { describe, expect, it } from "vitest";
import { is, Table } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/mysql-core";
import * as schema from "../src/schema.js";

describe("desktop backup schema", () => {
  it("uses matching ASCII UUID columns for every business key and reference", () => {
    for (const table of Object.values(schema)) {
      if (!is(table, Table)) continue;
      const config = getTableConfig(table);
      for (const column of config.columns) {
        const numericBookkeeping =
          ["external_catalog_sync", "sync_state"].includes(config.name) &&
          column.name === "id";
        const businessId =
          column.name === "id" ||
          (column.name.endsWith("_id") &&
            !column.name.startsWith("external_") &&
            column.name !== "client_request_id") ||
          /^(recorded|paid|created|requested|reviewed|approved|prepared)_by$/.test(
            column.name,
          );
        if (businessId && !numericBookkeeping) {
          expect(column.getSQLType(), `${config.name}.${column.name}`).toBe(
            "char(36) CHARACTER SET ascii COLLATE ascii_bin",
          );
        }
      }
    }
  });

  it("enforces one open shift per branch", () => {
    const index = getTableConfig(schema.shifts).indexes.find(
      (entry) => entry.config.name === "shifts_open_slot_uidx",
    );
    expect(index?.config.columns.map((column) => column.name)).toEqual([
      "branch_id",
      "open_slot",
    ]);
    expect(index?.config.unique).toBe(true);
  });

  it("provides stable primary keys for ingredient mapping rows", () => {
    for (const name of [
      "externalProductIngredients",
      "externalSizeIngredients",
      "externalModifierIngredients",
    ] as const) {
      const config = getTableConfig(schema[name]);
      expect(
        config.primaryKeys[0]?.columns.map((column) => column.name),
      ).toEqual([
        "branch_id",
        name === "externalProductIngredients"
          ? "external_product_id"
          : name === "externalSizeIngredients"
            ? "external_size_id"
            : "external_modifier_option_id",
        "item_id",
      ]);
    }
  });

  it("includes account assignments, devices, link codes and backup bookkeeping", () => {
    const names = Object.values(schema)
      .filter((entry) => is(entry, Table))
      .map((table) => getTableConfig(table).name);
    expect(names).toEqual(
      expect.arrayContaining([
        "admin_branches",
        "devices",
        "link_codes",
        "sync_outbox",
        "sync_state",
      ]),
    );
  });
  it("scopes cashier username uniqueness to the branch", () => {
    const index = getTableConfig(schema.users).indexes.find(
      (entry) => entry.config.name === "users_cashier_username_branch_uidx",
    );
    expect(index?.config.columns.map((column) => column.name)).toEqual([
      "role",
      "branch_id",
      "username",
    ]);
  });
});

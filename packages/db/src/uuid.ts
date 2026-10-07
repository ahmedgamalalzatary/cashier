import { customType } from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";

export { uuidv7 };

/** Used by both primary keys and references so MySQL can enforce their FKs. */
export const uuidColumn = customType<{ data: string; driverData: string }>({
  dataType: () => "char(36) CHARACTER SET ascii COLLATE ascii_bin",
});

/** Generate business IDs in the app; MySQL insertId is never an ID source. */
export const id = (name = "id") => uuidColumn(name).$defaultFn(uuidv7);

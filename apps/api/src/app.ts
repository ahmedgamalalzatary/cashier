import express from "express";
import cors from "cors";
import type { Db } from "@cashier/db";
import {
  authenticate,
  createAuthModule,
  createBranchesModule,
  createReportsModule,
  createUsersModule,
  errorHandler,
  requireRole,
  selectBranch,
} from "@cashier/server-core";
import { createSuppliersModule } from "./modules/suppliers/suppliers.module.js";
import { createCategoriesModule } from "./modules/categories/categories.module.js";
import { createItemsModule } from "./modules/items/items.module.js";
import { createInventoryModule } from "./modules/inventory/inventory.module.js";
import { createPurchasesModule } from "./modules/purchases/purchases.module.js";
import { createTransfersModule } from "./modules/transfers/transfers.module.js";
import { createRecipesModule } from "./modules/recipes/recipes.module.js";
import { createOrdersModule } from "./modules/orders/orders.module.js";
import { createEmployeesModule } from "./modules/employees/employees.module.js";
import { createShiftsModule } from "./modules/shifts/shifts.module.js";
import { createRefundsModule } from "./modules/refunds/refunds.module.js";
import { createWasteModule } from "./modules/waste/waste.module.js";
import { createExpensesModule } from "./modules/expenses/expenses.module.js";
import { createProductsModule } from "./modules/products/products.module.js";
import { createStocktakesModule } from "./modules/stocktakes/stocktakes.module.js";
import { createSalariesModule } from "./modules/salaries/salaries.module.js";
import { ShiftsRepository } from "./modules/shifts/shifts.repository.js";
import { ShiftsService } from "./modules/shifts/shifts.service.js";
import { createResendModule, createSyncModule } from "./modules/sync/sync.module.js";

export type AppOptions = {
  jwtSecret: string;
  corsOrigins: string[];
  trustProxy?: boolean;
  /** Desktop pins every authenticated request to its configured branch. */
  branchId?: string;
  /**
   * Desktop only: the background backup uploader behind "Upload now"
   * (plan 10.3). Without it the routes are not mounted.
   */
  uploadNow?: () => Promise<{ uploaded: number; pending: number }>;
  /** Desktop only: the admin recovery tool that queues everything again. */
  resendAll?: () => Promise<{ queued: number }>;
};

export function createApp(
  db: Db,
  {
    jwtSecret,
    corsOrigins,
    trustProxy = false,
    branchId,
    uploadNow,
    resendAll,
  }: AppOptions,
) {
  const app = express();
  app.set("trust proxy", trustProxy ? 1 : false);
  app.use(
    cors({
      origin: (origin, callback) =>
        callback(null, !origin || corsOrigins.includes(origin)),
      credentials: true,
    }),
  );
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", createAuthModule(db, jwtSecret, branchId));
  app.use(
    "/api/branches",
    authenticate(db, jwtSecret, branchId),
    createBranchesModule(db, branchId),
  );
  app.use(
    "/api",
    authenticate(db, jwtSecret, branchId),
    selectBranch(db, branchId),
  );
  // Commit expiry before a cashier write enters its own transaction. A rejected
  // sale/refund/etc. must not roll the system's shift close back with it.
  const shiftExpiry = new ShiftsService(new ShiftsRepository(db));
  app.use("/api", async (req, _res, next) => {
    if (req.user?.role === "cashier" && req.method !== "GET") {
      await shiftExpiry.autoCloseExpired();
    }
    next();
  });
  app.use("/api/orders", authenticate(db, jwtSecret), createOrdersModule(db));
  app.use("/api/shifts", authenticate(db, jwtSecret), createShiftsModule(db));
  app.use("/api/refunds", authenticate(db, jwtSecret), createRefundsModule(db));
  app.use("/api/waste", authenticate(db, jwtSecret), createWasteModule(db));
  app.use(
    "/api/products",
    authenticate(db, jwtSecret),
    createProductsModule(db, requireRole("admin")),
  );
  app.use(
    "/api/expenses",
    authenticate(db, jwtSecret),
    createExpensesModule(db, requireRole("admin")),
  );

  // admin-only sections per spec §2 permission matrix
  const adminOnly = [
    authenticate(db, jwtSecret),
    requireRole("admin"),
  ] as const;
  app.use("/api/suppliers", ...adminOnly, createSuppliersModule(db));
  app.use("/api/purchases", ...adminOnly, createPurchasesModule(db));
  app.use("/api/categories", ...adminOnly, createCategoriesModule(db));
  app.use("/api/recipes", ...adminOnly, createRecipesModule(db));
  app.use(
    "/api/items",
    authenticate(db, jwtSecret),
    createItemsModule(db, requireRole("admin")),
  );
  app.use("/api/users", ...adminOnly, createUsersModule(db));
  app.use("/api/employees", ...adminOnly, createEmployeesModule(db));
  app.use("/api/salaries", ...adminOnly, createSalariesModule(db));
  app.use("/api/reports", ...adminOnly, createReportsModule(db));
  app.use("/api/stocktakes", ...adminOnly, createStocktakesModule(db));
  app.use(
    "/api/inventory",
    authenticate(db, jwtSecret),
    createInventoryModule(db, requireRole("admin")),
  );
  app.use(
    "/api/transfers",
    authenticate(db, jwtSecret),
    createTransfersModule(db, requireRole("admin")),
  );

  if (uploadNow)
    app.use(
      "/api/sync",
      authenticate(db, jwtSecret),
      requireRole("admin"),
      createSyncModule(db, uploadNow),
    );
  if (uploadNow && resendAll)
    app.use(
      "/api/sync",
      authenticate(db, jwtSecret),
      requireRole("admin"),
      createResendModule(resendAll, uploadNow),
    );

  app.use(errorHandler);
  return app;
}

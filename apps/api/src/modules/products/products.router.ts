import { Router, type RequestHandler } from "express";
import type { ProductsController } from "./products.controller.js";

type ProductsRouteController = Pick<
  ProductsController,
  "list" | "local" | "refresh" | "refreshStatus" | "configureStock"
>;

export function productsRouter(
  controller: ProductsRouteController,
  adminOnly: RequestHandler,
) {
  const router = Router();
  router.get("/", controller.list);
  router.get("/local", controller.local);
  router.post("/refresh", adminOnly, controller.refresh);
  router.get("/refresh-status", controller.refreshStatus);
  router.put("/:id/stock-setup", adminOnly, controller.configureStock);
  return router;
}

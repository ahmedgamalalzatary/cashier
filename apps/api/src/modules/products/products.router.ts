import { Router, type RequestHandler } from "express";
import type { ProductsController } from "./products.controller.js";

type ProductsRouteController = Pick<
  ProductsController,
  "list" | "refresh" | "configureStock"
>;

export function productsRouter(
  controller: ProductsRouteController,
  adminOnly: RequestHandler,
) {
  const router = Router();
  router.get("/", controller.list);
  router.post("/refresh", adminOnly, controller.refresh);
  router.put("/:id/stock-setup", adminOnly, controller.configureStock);
  return router;
}

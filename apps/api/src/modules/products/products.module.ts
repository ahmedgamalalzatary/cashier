import type { RequestHandler } from "express";
import type { Db } from "../../db/index.js";
import { ProductsController } from "./products.controller.js";
import { ProductsRepository } from "./products.repository.js";
import { productsRouter } from "./products.router.js";
import { ProductsService } from "./products.service.js";
import { CacheRefreshRepository } from "../external/cache-refresh.repository.js";

export function createProductsModule(db: Db, adminOnly: RequestHandler) {
  const service = createProductsService(db);
  const controller = new ProductsController(
    service,
    new CacheRefreshRepository(db),
  );
  return productsRouter(controller, adminOnly);
}

export function createProductsService(db: Db) {
  return new ProductsService(new ProductsRepository(db));
}

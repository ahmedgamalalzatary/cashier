import type { RequestHandler } from "express";
import type { Db } from "../../db/index.js";
import type { ExternalCatalogClient } from "../external/external-catalog.client.js";
import { ProductsController } from "./products.controller.js";
import { ProductsRepository } from "./products.repository.js";
import { productsRouter } from "./products.router.js";
import { ProductsService } from "./products.service.js";

export function createProductsModule(
  db: Db,
  externalCatalog: ExternalCatalogClient,
  adminOnly: RequestHandler,
) {
  const repository = new ProductsRepository(db);
  const service = new ProductsService(repository, externalCatalog);
  const controller = new ProductsController(service);
  return productsRouter(controller, adminOnly);
}

import type { Db } from "../../db/index.js";
import { StocktakesController } from "./stocktakes.controller.js";
import { StocktakesRepository } from "./stocktakes.repository.js";
import { stocktakesRouter } from "./stocktakes.router.js";
import { StocktakesService } from "./stocktakes.service.js";
export function createStocktakesModule(db: Db) {
  return stocktakesRouter(
    new StocktakesController(
      new StocktakesService(new StocktakesRepository(db)),
    ),
  );
}

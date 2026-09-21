import type { Request, Response } from "express";
import { z } from "zod";
import {
  confirmStocktakeInput,
  manualAdjustmentInput,
  startStocktakeInput,
  updateStocktakeCountsInput,
} from "./stocktakes.schemas.js";
import type { StocktakesService } from "./stocktakes.service.js";

const routeId = z.coerce.number().int().positive();
export class StocktakesController {
  constructor(private service: StocktakesService) {}
  list = async (_req: Request, res: Response) =>
    res.json(await this.service.list());
  find = async (req: Request, res: Response) =>
    res.json(await this.service.find(routeId.parse(req.params.id)));
  start = async (req: Request, res: Response) =>
    res
      .status(201)
      .json(
        await this.service.start(
          startStocktakeInput.parse(req.body),
          req.user!.id,
        ),
      );
  counts = async (req: Request, res: Response) =>
    res.json(
      await this.service.updateCounts(
        routeId.parse(req.params.id),
        updateStocktakeCountsInput.parse(req.body),
      ),
    );
  confirm = async (req: Request, res: Response) =>
    res.json(
      await this.service.confirm(
        routeId.parse(req.params.id),
        confirmStocktakeInput.parse(req.body),
      ),
    );
  manual = async (req: Request, res: Response) =>
    res
      .status(201)
      .json(
        await this.service.manual(
          manualAdjustmentInput.parse(req.body),
          req.user!.id,
        ),
      );
}

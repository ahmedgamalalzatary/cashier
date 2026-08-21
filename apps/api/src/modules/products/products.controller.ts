import type { Request, Response } from "express";
import { idParam } from "../../middleware/validation.js";
import type { ProductsService } from "./products.service.js";
import { productStockSetupInput } from "./products.schemas.js";

export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  list = async (_req: Request, res: Response) => {
    res.json(await this.service.list());
  };

  refresh = async (_req: Request, res: Response) => {
    res.json(await this.service.refresh());
  };

  configureStock = async (req: Request, res: Response) => {
    await this.service.configureStock(
      idParam.parse(req.params.id),
      productStockSetupInput.parse(req.body),
    );
    res.json({ ok: true });
  };
}

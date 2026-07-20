import type { Request, Response } from "express";
import { idParam } from "../../middleware/validation.js";
import type { OrdersService } from "./orders.service.js";
import { orderInput } from "./orders.schemas.js";

export class OrdersController {
  constructor(private service: OrdersService) {}

  catalog = async (_req: Request, res: Response) => {
    res.json(await this.service.catalog());
  };

  list = async (_req: Request, res: Response) => {
    res.json(await this.service.list());
  };

  get = async (req: Request, res: Response) => {
    res.json(await this.service.get(idParam.parse(req.params.id)));
  };

  create = async (req: Request, res: Response) => {
    const order = await this.service.create(
      orderInput.parse(req.body),
      req.user!.id,
    );
    res.status(201).json(order);
  };
}

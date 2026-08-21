import type { Request, Response } from "express";
import { idParam } from "../../middleware/validation.js";
import type { OrdersService } from "./orders.service.js";
import type { ExternalOrdersRepository } from "./external-orders.repository.js";
import { orderInput } from "./orders.schemas.js";

export class OrdersController {
  constructor(
    private service: OrdersService,
    private externalOrders: ExternalOrdersRepository,
  ) {}

  list = async (_req: Request, res: Response) => {
    res.json(await this.service.list());
  };

  externalList = async (req: Request, res: Response) => {
    const page = Number(req.query.page);
    const pageSize = Number(req.query.pageSize);
    res.json(
      await this.externalOrders.list({
        search:
          typeof req.query.search === "string" ? req.query.search : undefined,
        day: typeof req.query.day === "string" ? req.query.day : undefined,
        page: Number.isInteger(page) && page > 0 ? page : 1,
        pageSize:
          Number.isInteger(pageSize) && pageSize > 0
            ? Math.min(pageSize, 100)
            : 25,
      }),
    );
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

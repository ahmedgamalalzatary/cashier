import type { Request, Response } from "express";
import { idParam } from "../../middleware/validation.js";
import type { OrdersService } from "./orders.service.js";
import type { ExternalOrdersClient } from "./external-orders.client.js";
import { orderInput } from "./orders.schemas.js";

export class OrdersController {
  constructor(
    private service: OrdersService,
    private externalOrders: ExternalOrdersClient,
  ) {}

  list = async (_req: Request, res: Response) => {
    res.json(await this.service.list());
  };

  externalList = async (req: Request, res: Response) => {
    const page = Number(req.query.page);
    const pageSize = Number(req.query.pageSize);
    res.json(await this.externalOrders.listPage({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      page: Number.isInteger(page) && page > 0 ? page : undefined,
      pageSize: Number.isInteger(pageSize) && pageSize > 0 ? pageSize : undefined,
    }));
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

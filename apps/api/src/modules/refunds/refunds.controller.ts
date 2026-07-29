import type { Request, Response } from "express";
import { idParam } from "../../middleware/validation.js";
import type { RefundsService } from "./refunds.service.js";
import { refundInput } from "./refunds.schemas.js";

export class RefundsController {
  constructor(private service: RefundsService) {}

  list = async (_req: Request, res: Response) => {
    res.json(await this.service.list());
  };

  get = async (req: Request, res: Response) => {
    res.json(await this.service.get(idParam.parse(req.params.id)));
  };

  quantities = async (req: Request, res: Response) => {
    res.json(await this.service.quantities(idParam.parse(req.params.orderId)));
  };

  create = async (req: Request, res: Response) => {
    res
      .status(201)
      .json(await this.service.create(refundInput.parse(req.body), req.user!.id));
  };
}

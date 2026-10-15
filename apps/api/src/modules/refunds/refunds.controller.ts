import type { Request, Response } from "express";
import { idParam } from "@cashier/server-core";
import type { RefundsService } from "./refunds.service.js";
import { refundInput } from "./refunds.schemas.js";
import { withoutCostFieldsFor } from "../../lib/strip-costs.js";

export class RefundsController {
  constructor(private service: RefundsService) {}

  list = async (req: Request, res: Response) => {
    res.json(
      withoutCostFieldsFor(req.user?.role, await this.service.list()),
    );
  };

  get = async (req: Request, res: Response) => {
    res.json(
      withoutCostFieldsFor(
        req.user?.role,
        await this.service.get(idParam.parse(req.params.id)),
      ),
    );
  };

  quantities = async (req: Request, res: Response) => {
    res.json(await this.service.quantities(idParam.parse(req.params.orderId)));
  };

  create = async (req: Request, res: Response) => {
    res
      .status(201)
      .json(
        withoutCostFieldsFor(
          req.user?.role,
          await this.service.create(refundInput.parse(req.body), req.user!),
        ),
      );
  };
}

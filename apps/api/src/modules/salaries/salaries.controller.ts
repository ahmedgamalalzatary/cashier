import type { Request, Response } from "express";
import type { SalariesService } from "./salaries.service.js";
import {
  adjustmentInput,
  advanceInput,
  monthParam,
  paymentInput,
} from "./salaries.schemas.js";

export class SalariesController {
  constructor(private service: SalariesService) {}
  month = async (req: Request, res: Response) =>
    res.json(await this.service.month(monthParam.parse(req.query.month)));
  advance = async (req: Request, res: Response) =>
    res
      .status(201)
      .json(
        await this.service.advance(advanceInput.parse(req.body), req.user!.id),
      );
  adjustment = async (req: Request, res: Response) =>
    res
      .status(201)
      .json(
        await this.service.adjustment(
          adjustmentInput.parse(req.body),
          req.user!.id,
        ),
      );
  pay = async (req: Request, res: Response) => {
    const input = paymentInput.parse(req.body);
    res
      .status(201)
      .json(
        await this.service.pay(input.employeeId, input.month, req.user!.id),
      );
  };
}

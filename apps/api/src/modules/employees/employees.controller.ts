import type { Request, Response } from "express";
import type { EmployeesService } from "./employees.service.js";
import {
  cashierAccessInput,
  cashierPasswordInput,
  employeeIdParam,
  employeeInput,
  employeeUpdateInput,
} from "./employees.schemas.js";

export class EmployeesController {
  constructor(private service: EmployeesService) {}

  list = async (_req: Request, res: Response) => {
    res.json(await this.service.list());
  };

  create = async (req: Request, res: Response) => {
    const id = await this.service.create(employeeInput.parse(req.body));
    res.status(201).json({ id });
  };

  update = async (req: Request, res: Response) => {
    await this.service.update(
      employeeIdParam.parse(req.params.id),
      employeeUpdateInput.parse(req.body),
    );
    res.json({ ok: true });
  };

  grantCashierAccess = async (req: Request, res: Response) => {
    const result = await this.service.grantCashierAccess(
      employeeIdParam.parse(req.params.id),
      cashierAccessInput.parse(req.body),
    );
    res.status(result.created ? 201 : 200).json({ userId: result.userId });
  };

  revokeCashierAccess = async (req: Request, res: Response) => {
    await this.service.revokeCashierAccess(
      employeeIdParam.parse(req.params.id),
    );
    res.status(204).send();
  };

  resetCashierPassword = async (req: Request, res: Response) => {
    const { password } = cashierPasswordInput.parse(req.body);
    await this.service.resetCashierPassword(
      employeeIdParam.parse(req.params.id),
      password,
    );
    res.json({ ok: true });
  };

  deactivate = async (req: Request, res: Response) => {
    await this.service.deactivate(employeeIdParam.parse(req.params.id));
    res.status(204).send();
  };
}

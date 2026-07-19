import type { Request, Response } from 'express';
import type { SuppliersService } from './suppliers.service.js';
import { idParam, paymentInput, supplierInput, supplierUpdateInput } from './suppliers.schemas.js';

export class SuppliersController {
  constructor(private service: SuppliersService) {}

  list = async (_req: Request, res: Response) => {
    res.json(await this.service.list());
  };

  get = async (req: Request, res: Response) => {
    res.json(await this.service.getOrFail(idParam.parse(req.params.id)));
  };

  create = async (req: Request, res: Response) => {
    const id = await this.service.create(supplierInput.parse(req.body));
    res.status(201).json({ id });
  };

  update = async (req: Request, res: Response) => {
    await this.service.update(idParam.parse(req.params.id), supplierUpdateInput.parse(req.body));
    res.json({ ok: true });
  };

  deactivate = async (req: Request, res: Response) => {
    await this.service.deactivate(idParam.parse(req.params.id));
    res.json({ ok: true });
  };

  addPayment = async (req: Request, res: Response) => {
    const id = await this.service.addPayment(
      idParam.parse(req.params.id),
      paymentInput.parse(req.body),
    );
    res.status(201).json({ id });
  };

  statement = async (req: Request, res: Response) => {
    res.json(await this.service.statement(idParam.parse(req.params.id)));
  };
}

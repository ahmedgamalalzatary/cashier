import type { Request, Response } from 'express';
import type { PurchasesService } from './purchases.service.js';
import type { InvoiceJourneyService } from './invoice-journey.service.js';
import { purchaseInput } from './purchases.schemas.js';
import { idParam } from '@cashier/server-core';

export class PurchasesController {
  constructor(
    private service: PurchasesService,
    private journeys: InvoiceJourneyService,
  ) {}

  list = async (_req: Request, res: Response) => {
    res.json(await this.service.list());
  };

  get = async (req: Request, res: Response) => {
    res.json(await this.service.get(idParam.parse(req.params.id)));
  };

  journey = async (req: Request, res: Response) => {
    res.json(await this.journeys.get(idParam.parse(req.params.id)));
  };

  create = async (req: Request, res: Response) => {
    const id = await this.service.create(
      purchaseInput.parse(req.body),
      req.user!.id,
    );
    res.status(201).json({ id });
  };
}

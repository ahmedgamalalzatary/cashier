import type { Request, Response } from 'express';
import { idParam } from '../../middleware/validation.js';
import { itemInput, itemUpdateInput } from './items.schemas.js';
import type { ItemsService } from './items.service.js';

export class ItemsController {
  constructor(private service: ItemsService) {}

  list = async (_req: Request, res: Response) => {
    res.json(await this.service.list());
  };

  create = async (req: Request, res: Response) => {
    const id = await this.service.create(itemInput.parse(req.body));
    res.status(201).json({ id });
  };

  update = async (req: Request, res: Response) => {
    await this.service.update(
      idParam.parse(req.params.id),
      itemUpdateInput.parse(req.body),
    );
    res.json({ ok: true });
  };

  deactivate = async (req: Request, res: Response) => {
    await this.service.deactivate(idParam.parse(req.params.id));
    res.json({ ok: true });
  };
}

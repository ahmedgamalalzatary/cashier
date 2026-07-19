import type { Request, Response } from 'express';
import type { CategoriesService } from './categories.service.js';
import { categoryInput, categoryUpdateInput } from './categories.schemas.js';
import { idParam } from '../../middleware/validation.js';

export class CategoriesController {
  constructor(private service: CategoriesService) {}

  list = async (_req: Request, res: Response) => {
    res.json(await this.service.list());
  };

  create = async (req: Request, res: Response) => {
    const id = await this.service.create(categoryInput.parse(req.body));
    res.status(201).json({ id });
  };

  update = async (req: Request, res: Response) => {
    await this.service.update(
      idParam.parse(req.params.id),
      categoryUpdateInput.parse(req.body),
    );
    res.json({ ok: true });
  };

  deactivate = async (req: Request, res: Response) => {
    await this.service.deactivate(idParam.parse(req.params.id));
    res.json({ ok: true });
  };
}

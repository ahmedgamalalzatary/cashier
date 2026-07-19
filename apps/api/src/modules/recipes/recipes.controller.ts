import type { Request, Response } from 'express';
import { idParam } from '../../middleware/validation.js';
import type { RecipesService } from './recipes.service.js';
import { preparationInput, recipeInput } from './recipes.schemas.js';

export class RecipesController {
  constructor(private service: RecipesService) {}

  list = async (_req: Request, res: Response) => {
    res.json(await this.service.list());
  };

  get = async (req: Request, res: Response) => {
    res.json(await this.service.get(idParam.parse(req.params.id)));
  };

  create = async (req: Request, res: Response) => {
    const id = await this.service.create(recipeInput.parse(req.body));
    res.status(201).json({ id });
  };

  update = async (req: Request, res: Response) => {
    await this.service.update(
      idParam.parse(req.params.id),
      recipeInput.parse(req.body),
    );
    res.json({ ok: true });
  };

  deactivate = async (req: Request, res: Response) => {
    await this.service.deactivate(idParam.parse(req.params.id));
    res.json({ ok: true });
  };

  reactivate = async (req: Request, res: Response) => {
    await this.service.reactivate(idParam.parse(req.params.id));
    res.json({ ok: true });
  };

  prepare = async (req: Request, res: Response) => {
    const preparationId = await this.service.prepare(
      idParam.parse(req.params.id),
      preparationInput.parse(req.body),
      req.user!.id,
    );
    res.status(201).json({ preparationId });
  };

  listPreparations = async (_req: Request, res: Response) => {
    res.json(await this.service.listPreparations());
  };

  getPreparation = async (req: Request, res: Response) => {
    res.json(
      await this.service.getPreparation(idParam.parse(req.params.id)),
    );
  };
}

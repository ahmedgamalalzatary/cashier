import type { Request, Response } from "express";
import { idParam } from "../../middleware/validation.js";
import { wasteInput } from "./waste.schemas.js";
import type { WasteService } from "./waste.service.js";

export class WasteController {
  constructor(private service: WasteService) {}
  catalog = async (_req: Request, res: Response) =>
    res.json(await this.service.catalog());
  list = async (req: Request, res: Response) =>
    res.json(await this.service.list(req.user!));
  get = async (req: Request, res: Response) =>
    res.json(await this.service.get(idParam.parse(req.params.id), req.user!));
  create = async (req: Request, res: Response) =>
    res
      .status(201)
      .json(await this.service.create(wasteInput.parse(req.body), req.user!));
}

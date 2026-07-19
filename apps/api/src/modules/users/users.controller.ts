import type { Request, Response } from "express";
import { idParam } from "../../middleware/validation.js";
import type { UsersService } from "./users.service.js";
import { userInput, userUpdateInput } from "./users.schemas.js";

export class UsersController {
  constructor(private service: UsersService) {}

  list = async (_req: Request, res: Response) => {
    res.json(await this.service.list());
  };

  create = async (req: Request, res: Response) => {
    const id = await this.service.create(userInput.parse(req.body));
    res.status(201).json({ id });
  };

  update = async (req: Request, res: Response) => {
    await this.service.update(
      req.user!.id,
      idParam.parse(req.params.id),
      userUpdateInput.parse(req.body),
    );
    res.json({ ok: true });
  };
}

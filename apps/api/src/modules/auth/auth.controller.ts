import type { Request, Response } from "express";
import type { AuthService } from "./auth.service.js";
import { changePasswordInput, loginInput } from "./auth.schemas.js";

export class AuthController {
  constructor(private service: AuthService) {}

  login = async (req: Request, res: Response) => {
    res.json(await this.service.login(loginInput.parse(req.body)));
  };

  me = async (req: Request, res: Response) => {
    res.json(req.user);
  };

  changePassword = async (req: Request, res: Response) => {
    res.json(
      await this.service.changePassword(
        req.user!.id,
        changePasswordInput.parse(req.body),
      ),
    );
  };
}

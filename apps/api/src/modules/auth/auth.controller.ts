import type { Request, Response } from "express";
import { clearAuthCookie, setAuthCookie } from "../../middleware/auth.js";
import type { AuthService } from "./auth.service.js";
import { changePasswordInput, loginInput } from "./auth.schemas.js";

export class AuthController {
  constructor(private service: AuthService) {}

  login = async (req: Request, res: Response) => {
    const session = await this.service.login(loginInput.parse(req.body));
    setAuthCookie(req, res, session.token);
    res.json(session);
  };

  me = async (req: Request, res: Response) => {
    res.json(req.user);
  };

  changePassword = async (req: Request, res: Response) => {
    const session = await this.service.changePassword(
      req.user!.id,
      changePasswordInput.parse(req.body),
    );
    setAuthCookie(req, res, session.token);
    res.json(session);
  };

  logout = async (req: Request, res: Response) => {
    clearAuthCookie(req, res);
    res.json({ ok: true });
  };
}

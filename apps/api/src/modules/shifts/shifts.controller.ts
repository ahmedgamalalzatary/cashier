import type { Request, Response } from "express";
import type { ShiftsService } from "./shifts.service.js";
import {
  adminCloseShiftInput,
  closeShiftInput,
  correctShiftInput,
  openShiftInput,
  shiftAuditNoteInput,
  shiftIdParam,
} from "./shifts.schemas.js";

export class ShiftsController {
  constructor(private service: ShiftsService) {}

  open = async (req: Request, res: Response) => {
    const shift = await this.service.open(
      openShiftInput.parse(req.body),
      req.user!.id,
    );
    res.status(201).json(shift);
  };

  current = async (req: Request, res: Response) => {
    res.json(await this.service.current(req.user!));
  };

  list = async (req: Request, res: Response) => {
    res.json(await this.service.list(req.user!));
  };

  close = async (req: Request, res: Response) => {
    res.json(
      await this.service.close(
        shiftIdParam.parse(req.params.id),
        closeShiftInput.parse(req.body),
        req.user!.id,
      ),
    );
  };

  adminClose = async (req: Request, res: Response) => {
    res.json(
      await this.service.adminClose(
        shiftIdParam.parse(req.params.id),
        adminCloseShiftInput.parse(req.body),
        req.user!.id,
      ),
    );
  };

  reopen = async (req: Request, res: Response) => {
    res.json(
      await this.service.reopen(
        shiftIdParam.parse(req.params.id),
        shiftAuditNoteInput.parse(req.body),
        req.user!.id,
      ),
    );
  };

  correct = async (req: Request, res: Response) => {
    res.json(
      await this.service.correct(
        shiftIdParam.parse(req.params.id),
        correctShiftInput.parse(req.body),
        req.user!.id,
      ),
    );
  };
}

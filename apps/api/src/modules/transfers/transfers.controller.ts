import type { Request, Response } from 'express';
import { idParam } from '../../middleware/validation.js';
import type { TransfersService } from './transfers.service.js';
import {
  transferApprovalInput,
  transferRejectionInput,
  transferRequestInput,
} from './transfers.schemas.js';

export class TransfersController {
  constructor(private service: TransfersService) {}

  listRequests = async (_req: Request, res: Response) => {
    res.json(await this.service.listRequests());
  };

  getRequest = async (req: Request, res: Response) => {
    res.json(await this.service.getRequest(idParam.parse(req.params.id)));
  };

  createRequest = async (req: Request, res: Response) => {
    const id = await this.service.createRequest(
      transferRequestInput.parse(req.body),
      req.user!.id,
    );
    res.status(201).json({ id });
  };

  approveRequest = async (req: Request, res: Response) => {
    const transferId = await this.service.approveRequest(
      idParam.parse(req.params.id),
      transferApprovalInput.parse(req.body),
      req.user!.id,
    );
    res.status(201).json({ transferId });
  };

  rejectRequest = async (req: Request, res: Response) => {
    const { reason } = transferRejectionInput.parse(req.body);
    await this.service.rejectRequest(
      idParam.parse(req.params.id),
      reason,
      req.user!.id,
    );
    res.json({ ok: true });
  };

  listTransfers = async (_req: Request, res: Response) => {
    res.json(await this.service.listTransfers());
  };

  getTransfer = async (req: Request, res: Response) => {
    res.json(await this.service.getTransfer(idParam.parse(req.params.id)));
  };

  createDirect = async (req: Request, res: Response) => {
    const transferId = await this.service.createDirect(
      transferRequestInput.parse(req.body),
      req.user!.id,
    );
    res.status(201).json({ transferId });
  };
}

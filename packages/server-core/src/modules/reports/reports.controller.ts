import type { Request, Response } from "express";
import { reportRangeQuery } from "./reports.schemas.js";
import type { ReportsService } from "./reports.service.js";

export class ReportsController {
  constructor(private service: ReportsService) {}

  dashboard = async (_req: Request, res: Response) => {
    res.json(await this.service.dashboard());
  };

  report = async (req: Request, res: Response) => {
    res.json(await this.service.report(reportRangeQuery.parse(req.query)));
  };
}

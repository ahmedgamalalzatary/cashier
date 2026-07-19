import type { Request, Response } from "express";
import type { Warehouse } from "@cashier/shared";
import type { InventoryService } from "./inventory.service.js";

export class InventoryController {
  constructor(private service: InventoryService) {}

  stock = (warehouse: Warehouse) => async (_req: Request, res: Response) => {
    res.json(await this.service.listStock(warehouse));
  };
}

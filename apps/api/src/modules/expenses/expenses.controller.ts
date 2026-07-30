import type { Request, Response } from "express";
import { HttpError } from "../../middleware/error.js";
import { idParam } from "../../middleware/validation.js";
import {
  createExpenseCategoryInput,
  createExpenseInput,
  updateExpenseCategoryInput,
} from "./expenses.schemas.js";
import type { ExpensesService } from "./expenses.service.js";

export class ExpensesController {
  constructor(private service: ExpensesService) {}
  categories = async (req: Request, res: Response) =>
    res.json(await this.service.categories(req.user!));
  createCategory = async (req: Request, res: Response) =>
    res
      .status(201)
      .json(
        await this.service.createCategory(
          createExpenseCategoryInput.parse(req.body).name,
        ),
      );
  updateCategory = async (req: Request, res: Response) =>
    res.json(
      await this.service.updateCategory(
        idParam.parse(req.params.id),
        updateExpenseCategoryInput.parse(req.body),
      ),
    );
  list = async (req: Request, res: Response) =>
    res.json(await this.service.list(req.user!));
  create = async (req: Request, res: Response) => {
    const input = createExpenseInput.parse(req.body);
    if (req.user!.role === "admin" && !input.expenseDate)
      throw new HttpError(400, "تاريخ المصروف مطلوب");
    return res.status(201).json(await this.service.create(input, req.user!));
  };
}

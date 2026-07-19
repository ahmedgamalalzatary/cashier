"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { PreparedRecipe } from "@cashier/shared";
import { scalePreparationIngredients } from "@/models/recipe-model";
import { createPreparation } from "@/services/recipes-service";
import { Button } from "../ui/button";
import { Field, TextAreaField } from "../ui/field";
import { Modal } from "../ui/modal";
import { RecipeFlowRail } from "./recipe-controls";

export function PrepareRecipeModal({
  recipe,
  onClose,
  onSaved,
}: {
  recipe: PreparedRecipe;
  onClose: () => void;
  onSaved: (preparationId: number) => void;
}) {
  const [quantity, setQuantity] = useState(recipe.baseYield);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const scaledIngredients = useMemo(
    () =>
      scalePreparationIngredients(
        recipe.ingredients,
        quantity,
        recipe.baseYield,
      ),
    [quantity, recipe.baseYield, recipe.ingredients],
  );
  const hasEnoughForQuantity = scaledIngredients.every(
    (ingredient) => ingredient.hasSufficientStock,
  );
  const isBaseYield = Number(quantity) === Number(recipe.baseYield);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await createPreparation(recipe.id, {
        quantity: Number(quantity),
        notes: notes.trim() || null,
      });
      onSaved(result.preparationId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تنفيذ التحضير");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title={`تحضير ${recipe.outputItemName}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <RecipeFlowRail
          ingredientLabel={`${recipe.ingredients.length} مكوّن`}
          outputLabel={`${quantity || 0} ${recipe.outputStockUnit}`}
          costLabel={
            !isBaseYield || recipe.currentCost === null
              ? "—"
              : `${Number(recipe.currentCost).toFixed(2)} ج.م`
          }
          available={hasEnoughForQuantity}
        />
        <Field
          label={`الكمية الناتجة (${recipe.outputStockUnit})`}
          type="number"
          min="0.001"
          step="0.001"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          required
          autoFocus
          dir="ltr"
        />
        <div className="rounded-xl border border-line bg-paper/60 p-3">
          <p className="mb-2 text-xs font-semibold text-muted">سيتم استهلاك</p>
          <ul className="space-y-1.5 text-sm">
            {scaledIngredients.map((ingredient) => (
              <li key={ingredient.itemId} className="flex justify-between gap-3">
                <span>{ingredient.itemName}</span>
                <span className="tnum font-medium">
                  {ingredient.scaledQuantity.toLocaleString("ar-EG", {
                    maximumFractionDigits: 3,
                  })}{" "}
                  {ingredient.stockUnit}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <TextAreaField
          label="ملاحظات (اختياري)"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={2000}
        />
        {error && (
          <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "جارِ التحضير…" : "تنفيذ التحضير"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

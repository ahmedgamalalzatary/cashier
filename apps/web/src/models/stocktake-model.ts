export function countedLinesFromDraft(
  lines: Array<{ itemId: number; countedQuantity: unknown }>,
):
  | { ok: true; lines: Array<{ itemId: number; countedQuantity: number }> }
  | { ok: false } {
  const parsed: Array<{ itemId: number; countedQuantity: number }> = [];
  for (const line of lines) {
    const value = line.countedQuantity;
    if (value === null || value === undefined) return { ok: false };
    if (typeof value === "string" && value.trim() === "") return { ok: false };
    const counted = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(counted) || counted < 0) return { ok: false };
    parsed.push({ itemId: line.itemId, countedQuantity: counted });
  }
  return { ok: true, lines: parsed };
}

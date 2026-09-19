export function warehouseForWasteTarget(
  targetKey: string,
  warehouse: "main" | "cafe",
): { warehouse: "main" | "cafe"; cafeForced: boolean } {
  if (targetKey.startsWith("product:") && warehouse === "main") {
    return { warehouse: "cafe", cafeForced: true };
  }
  return { warehouse, cafeForced: false };
}

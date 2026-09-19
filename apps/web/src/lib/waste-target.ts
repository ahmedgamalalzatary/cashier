export function warehouseForWasteTarget(
  targetKey: string,
  warehouse: "main" | "cafe",
): { warehouse: "main" | "cafe"; cafeForced: boolean } {
  if (
    (targetKey.startsWith("product:") || targetKey.startsWith("recipe:")) &&
    warehouse === "main"
  ) {
    return { warehouse: "cafe", cafeForced: true };
  }
  return { warehouse, cafeForced: false };
}

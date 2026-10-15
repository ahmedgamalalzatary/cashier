/**
 * Cost, profit and FIFO allocation figures are admin eyes only (spec §2):
 * the server must never send them to a cashier, so responses routed to a
 * cashier get these fields removed before leaving the process.
 */
const COST_FIELDS = new Set([
  "totalCost",
  "totalCostReturned",
  "returnedCost",
  "unitCost",
  "lineCost",
]);

export function withoutCostFieldsFor(role: string | undefined, value: unknown): unknown {
  if (role !== "cashier") return value;
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (node && typeof node === "object" && Object.getPrototypeOf(node) === Object.prototype) {
      const clean: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(node)) {
        if (COST_FIELDS.has(key)) continue;
        clean[key] = strip(child);
      }
      return clean;
    }
    return node;
  };
  return strip(value);
}

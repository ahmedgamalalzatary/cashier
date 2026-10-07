/**
 * Status-code convention shared by every Express app in the repo (see audit
 * M4):
 * - 404 = unknown ID, whether from URL params (GET /orders/:id) or from
 *   POST-body references (externalProductId, itemId, supplierId, ...). The
 *   Arabic message names the missing entity, so cashiers see one consistent
 *   "غير موجود".
 * - 400 = malformed shape/values (Zod, JSON parse, range checks).
 * - 409 = conflict (duplicate, double-submit, occupied shift).
 * Kept 404 for body FKs instead of 400/422 for consistency.
 *
 * It lives in the database package because branch scoping needs to raise it
 * from inside a transaction; `apps/api/src/middleware/error.ts` re-exports it so
 * existing imports keep working.
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

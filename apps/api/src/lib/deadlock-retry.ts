// MySQL deadlock (ER_LOCK_DEADLOCK) means the server rolled this transaction
// back and asked the loser to restart. Retrying once is safe: the retry re-runs
// the whole callback against fresh state. Any other error is surfaced as-is.
export const isDeadlockError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === "ER_LOCK_DEADLOCK";

export async function transactionWithDeadlockRetry<T>(
  transaction: () => Promise<T>,
): Promise<T> {
  try {
    return await transaction();
  } catch (error) {
    if (!isDeadlockError(error)) throw error;
    return transaction();
  }
}

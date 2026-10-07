import { beforeEach as originalBeforeEach, it as originalIt } from "vitest";
import { currentBranchId, withBranch } from "../../src/branch-context.js";
import { TEST_BRANCH_ID } from "@cashier/shared/test-support";

export { testId, TEST_BRANCH_ID } from "@cashier/shared/test-support";

type Callback = (...args: unknown[]) => unknown;
// Every direct repository call must have the same explicit scope as an HTTP
// request. Wrap the test body, rather than relying on context in a beforeEach.
function scopedTests(writable: boolean) {
  const test = ((name: string, fn: Callback, options?: number) =>
    originalIt(name, async (context) => {
      await withBranch(TEST_BRANCH_ID, () => fn(context), writable);
    }, options)) as typeof originalIt;
  test.each = ((cases: unknown[]) => {
    const parameterized = originalIt.each(cases);
    return (name: string, fn: Callback, options?: number) =>
      parameterized(name, async (...args: unknown[]) => {
        await withBranch(TEST_BRANCH_ID, () => fn(...args), writable);
      }, options);
  }) as typeof originalIt.each;
  return test;
}
export const it = scopedTests(true);
// Query-only repository doubles do not implement the active-branch write lock.
export const repositoryIt = scopedTests(false);

// Vitest hooks run outside the test body's async context. Scope fixture setup
// explicitly too, so branchValues() never needs a production default branch.
export function beforeEach(
  fn: Parameters<typeof originalBeforeEach>[0],
  timeout?: number,
) {
  return originalBeforeEach(
    (context) => withBranch(TEST_BRANCH_ID, () => fn(context), true),
    timeout,
  );
}

/** Explicit branch defaults for fixture inserts, preserving intentional overrides. */
export function testBranchValues<T extends object>(input: T): T & { branchId: string | null };
export function testBranchValues<T extends object>(input: T[]): Array<T & { branchId: string | null }>;
export function testBranchValues<T extends object>(input: T | T[]) {
  const assign = (row: T) => ({
    branchId: "role" in row && row.role === "admin" ? null : currentBranchId(),
    ...row,
  });
  return Array.isArray(input) ? input.map(assign) : assign(input);
}

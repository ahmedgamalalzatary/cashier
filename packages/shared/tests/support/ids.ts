/** Stable UUID-shaped fixtures; production IDs always come from uuidv7(). */
export const testId = (counter: number) =>
  `00000000-0000-7000-8000-${counter.toString(16).padStart(12, "0")}`;

export const TEST_BRANCH_ID = testId(1);

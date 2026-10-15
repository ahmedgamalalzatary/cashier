export const money = (key: string, label: string) => ({
  key,
  label,
  kind: "money" as const,
});
export const number = (key: string, label: string) => ({
  key,
  label,
  kind: "number" as const,
});
// An auto-closed shift has no counted drawer, so the cell says so instead of
// showing a zero that would read as "balanced".
export const uncountedMoney = (key: string, label: string) => ({
  key,
  label,
  kind: "uncountedMoney" as const,
});
export const date = (key: string, label: string) => ({
  key,
  label,
  kind: "date" as const,
});

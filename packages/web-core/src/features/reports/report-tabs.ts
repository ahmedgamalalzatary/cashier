export const tabs = [
  ["sales", "المبيعات ومجمل الربح"],
  ["stock", "المخزون والحركة"],
  ["money", "الأموال والمصروفات"],
  ["employees", "الموظفون ووقت العمل"],
  ["waste", "الهالك والمرتجعات"],
  ["suppliers", "الموردون"],
  ["operations", "التحويلات والتحضير"],
] as const;

export type Tab = (typeof tabs)[number][0];

export const tabs = [
  ["overview", "نظرة عامة"],
  ["sales", "المبيعات"],
  ["stock", "المخزون"],
  ["money", "المصروفات والأرباح"],
  ["employees", "الموظفون والورديات"],
  ["suppliers", "الموردون"],
] as const;

export type Tab = (typeof tabs)[number][0];

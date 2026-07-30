export const unfinishedModules = {
  salaries: {
    code: "SA",
    title: "المرتبات",
    description: "حساب المرتبات والسلف والتسويات سيُدار من هذه الصفحة.",
  },
  reports: {
    code: "RP",
    title: "التقارير",
    description: "تقارير المبيعات والمخزون والأداء المالي قيد التجهيز.",
  },
} as const;

export type UnfinishedModule = keyof typeof unfinishedModules;

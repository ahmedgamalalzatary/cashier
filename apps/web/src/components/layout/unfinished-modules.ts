export const unfinishedModules = {
  salaries: {
    code: "SA",
    title: "المرتبات",
    description: "حساب المرتبات والسلف والتسويات سيُدار من هذه الصفحة.",
  },
  expenses: {
    code: "EX",
    title: "المصروفات",
    description: "تسجيل المصروفات اليومية وتصنيفها قيد التجهيز.",
  },
  waste: {
    code: "WS",
    title: "الهالك",
    description: "تسجيل الهالك وأسبابه وتأثيره على المخزون سيتوفر هنا.",
  },
  reports: {
    code: "RP",
    title: "التقارير",
    description: "تقارير المبيعات والمخزون والأداء المالي قيد التجهيز.",
  },
} as const;

export type UnfinishedModule = keyof typeof unfinishedModules;

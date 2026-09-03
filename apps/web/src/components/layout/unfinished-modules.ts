export const unfinishedModules = {
  salaries: {
    code: "SA",
    title: "المرتبات",
    description: "حساب المرتبات والسلف والتسويات سيُدار من هذه الصفحة.",
  },
} as const;

export type UnfinishedModule = keyof typeof unfinishedModules;

export const unfinishedModules = {
  warehouse: {
    code: "WH",
    title: "المخزن الرئيسي",
    description: "إدارة الأصناف وحركات الاستلام والصرف ستتوفر هنا.",
  },
  cafe: {
    code: "CF",
    title: "الكافيه",
    description: "شاشة البيع ومخزون الكافيه قيد التجهيز.",
  },
  shifts: {
    code: "SH",
    title: "الورديات",
    description: "فتح الورديات وإغلاقها ومراجعة النقدية ستتوفر هنا.",
  },
  employees: {
    code: "EM",
    title: "الموظفون",
    description: "ملفات الموظفين والحضور وبيانات العمل قيد التجهيز.",
  },
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
  refunds: {
    code: "RF",
    title: "المرتجع",
    description: "معالجة المرتجعات وربطها بالفواتير الأصلية قيد التجهيز.",
  },
  recipes: {
    code: "RC",
    title: "الوصفات",
    description: "تعريف مكونات المنتجات وتكلفتها سيُدار من هذه الصفحة.",
  },
  reports: {
    code: "RP",
    title: "التقارير",
    description: "تقارير المبيعات والمخزون والأداء المالي قيد التجهيز.",
  },
} as const;

export type UnfinishedModule = keyof typeof unfinishedModules;

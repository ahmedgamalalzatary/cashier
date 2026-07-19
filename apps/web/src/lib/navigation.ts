export const NAV_ITEMS = [
  { href: "/", label: "الرئيسية" },
  { href: "/categories", label: "التصنيفات", adminOnly: true },
  { href: "/warehouse", label: "المخزن الرئيسي", adminOnly: true },
  { href: "/cafe", label: "الكافيه" },
  { href: "/suppliers", label: "الموردين", adminOnly: true },
  { href: "/users", label: "مستخدمو النظام", adminOnly: true },
  { href: "/shifts", label: "الورديات" },
  { href: "/employees", label: "الموظفين", adminOnly: true },
  { href: "/salaries", label: "المرتبات", adminOnly: true },
  { href: "/expenses", label: "المصروفات" },
  { href: "/waste", label: "الهالك" },
  { href: "/refunds", label: "المرتجع" },
  { href: "/recipes", label: "الوصفات", adminOnly: true },
  { href: "/reports", label: "التقارير", adminOnly: true },
] as const;

export const ADMIN_PATHS = NAV_ITEMS.filter(
  (item) => "adminOnly" in item && item.adminOnly,
).map((item) => item.href);

export const NAV_ITEMS = [
  { href: "/", label: "الرئيسية" },
  { href: "/pos", label: "نقطة البيع" },
  { href: "/categories", label: "التصنيفات", adminOnly: true },
  { href: "/warehouse", label: "المخزن الرئيسي", adminOnly: true },
  { href: "/shop", label: "المحل" },
  { href: "/suppliers", label: "الموردين", adminOnly: true },
  { href: "/purchases", label: "المشتريات", adminOnly: true },
  { href: "/users", label: "مستخدمو النظام", adminOnly: true },
  { href: "/shifts", label: "الورديات" },
  { href: "/employees", label: "الموظفين", adminOnly: true },
  { href: "/salaries", label: "المرتبات", adminOnly: true },
  { href: "/expenses", label: "المصروفات" },
  { href: "/waste", label: "الهالك" },
  { href: "/refunds", label: "المرتجع" },
  { href: "/reports", label: "التقارير", adminOnly: true },
] as const;

export const ADMIN_PATHS = NAV_ITEMS.filter(
  (item) => "adminOnly" in item && item.adminOnly,
).map((item) => item.href);

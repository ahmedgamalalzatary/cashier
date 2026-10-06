export const NAV_GROUPS = [
  {
    label: "يوم البيع",
    items: [
      { href: "/", label: "الرئيسية" },
      { href: "/pos", label: "نقطة البيع" },
      { href: "/orders", label: "الطلبات" },
      { href: "/refunds", label: "المرتجع" },
    ],
  },
  {
    label: "المخزون",
    items: [
      { href: "/inventory", label: "المخزون" },
      { href: "/transfers", label: "التحويلات" },
      { href: "/waste", label: "الهالك" },
      { href: "/stocktakes", label: "الجرد الدوري", adminOnly: true },
      { href: "/categories", label: "تصنيفات الأصناف", adminOnly: true },
      { href: "/recipes", label: "الوصفات", adminOnly: true },
    ],
  },
  {
    label: "المالية",
    items: [
      { href: "/purchases", label: "المشتريات", adminOnly: true },
      { href: "/suppliers", label: "الموردين", adminOnly: true },
      { href: "/expenses", label: "المصروفات" },
    ],
  },
  {
    label: "الفريق والنظام",
    items: [
      { href: "/shifts", label: "الورديات", adminOnly: true },
      { href: "/employees", label: "الموظفين", adminOnly: true },
      { href: "/salaries", label: "المرتبات", adminOnly: true },
      { href: "/reports", label: "التقارير", adminOnly: true },
      { href: "/users", label: "مستخدمو النظام", adminOnly: true },
      { href: "/branches", label: "الفروع", adminOnly: true },
    ],
  },
] as const;

export type NavItem = (typeof NAV_GROUPS)[number]["items"][number];

export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.reduce<NavItem[]>(
  (all, group) => [...all, ...group.items],
  [],
);

export const ADMIN_PATHS = NAV_ITEMS.filter(
  (item) => "adminOnly" in item && item.adminOnly,
).map((item) => item.href);

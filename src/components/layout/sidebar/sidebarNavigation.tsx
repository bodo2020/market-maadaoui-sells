
import {
  BarChart3,
  Boxes,
  Calendar,
  ClipboardList,
  CircleDollarSign,
  ClipboardCheck,
  Coins,
  CreditCard,
  FileText,
  Gauge,
  LayoutDashboard,
  ListChecks,
  LucideIcon,
  PackageX,
  Percent,
  Receipt,
  Settings,
  ShieldAlert,
  ShoppingBag,
  Store,
  Truck,
  User2,
  Users,
  Tags,
} from "lucide-react";

interface SidebarItem {
  title: string;
  href: string;
  icon: LucideIcon;
  disabled?: boolean;
  label?: string;
}

export const sidebarNavigation: SidebarItem[] = [
  {
    title: "لوحة التحكم",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "نقطة البيع",
    href: "/pos",
    icon: Store,
  },
  {
    title: "المبيعات",
    href: "/sales-dashboard",
    icon: BarChart3,
  },
  {
    title: "الطلبات",
    icon: ShoppingBag,
    href: "/online-orders"
  },
  {
    title: "طلبات المرتجعات",
    icon: PackageX,
    href: "/return-orders"
  },
  {
    title: "المالية",
    href: "/finances",
    icon: CircleDollarSign,
  },
  {
    title: "المخزون",
    href: "/inventory",
    icon: Boxes,
  },
  {
    title: "المنتجات",
    href: "/products",
    icon: Boxes,
  },
  {
    title: "التصنيفات",
    href: "/categories",
    icon: Tags,
  },
  {
    title: "الشركات",
    href: "/companies",
    icon: Store,
  },
  {
    title: "العملاء",
    href: "/customers",
    icon: Users,
  },
  {
    title: "عربات العملاء",
    href: "/customer-carts",
    icon: ShoppingBag,
  },
  {
    title: "البانرات",
    href: "/banners",
    icon: ShieldAlert,
  },
  {
    title: "العروض",
    href: "/offers",
    icon: Percent,
  },
  {
    title: "المصروفات",
    href: "/expenses",
    icon: Coins,
  },
  {
    title: "تتبع الصندوق",
    href: "/cash-tracking",
    icon: CreditCard,
  },
  {
    title: "الموظفين",
    href: "/employees",
    icon: User2,
  },
  {
    title: "مواقع التوصيل",
    href: "/delivery-locations",
    icon: Truck,
  },
  {
    title: "التقارير",
    href: "/reports",
    icon: FileText,
  },
  {
    title: "الموردين",
    href: "/suppliers",
    icon: Users,
  },
  {
    title: "المشتريات",
    href: "/purchases",
    icon: ShoppingBag,
  },
  {
    title: "الفواتير",
    href: "/invoices",
    icon: Receipt,
  },
  {
    title: "الإعدادات",
    href: "/settings",
    icon: Settings,
  },
];

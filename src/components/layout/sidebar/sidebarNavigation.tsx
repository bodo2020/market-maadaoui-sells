import {
  LayoutDashboard,
  ShoppingCart,
  ShoppingBag,
  Receipt,
  Package,
  Grid3X3,
  Building2,
  Warehouse,
  ClipboardList,
  Truck,
  Users,
  UserCheck,
  Wallet,
  Image,
  MapPin,
  FolderOpen,
  Tag,
  TrendingUp,
  DollarSign,
  FileText,
  RefreshCw,
  Settings,
  Map,
  QrCode,
  UserCog,
  Activity,
  Calendar,
  Sparkles,
  FileSpreadsheet,
} from "lucide-react";
import { SidebarItemData, NavigationGroup } from "./types";

export const mainNavigation: NavigationGroup = {
  title: "الرئيسية",
  items: [
    {
      label: "لوحة التحكم",
      href: "/",
      icon: LayoutDashboard,
    },
    {
      label: "نقطة البيع",
      href: "/pos",
      icon: ShoppingCart,
    },
    {
      label: "الطلبات الإلكترونية",
      href: "/online-orders",
      icon: ShoppingBag,
    },
    {
      label: "الفواتير",
      href: "/invoices",
      icon: Receipt,
    },
  ],
};

export const productsNavigation: NavigationGroup = {
  title: "المنتجات والمخزون",
  items: [
    {
      label: "المنتجات",
      href: "/products",
      icon: Package,
    },
    {
      label: "الأقسام",
      href: "/categories",
      icon: Grid3X3,
    },
    {
      label: "الباركود",
      href: "/barcode",
      icon: QrCode,
    },
    {
      label: "الشركات",
      href: "/companies",
      icon: Building2,
    },
    {
      label: "إدارة المخزون",
      href: "/inventory",
      icon: Warehouse,
    },
    {
      label: "الجرد",
      href: "/daily-inventory",
      icon: ClipboardList,
    },
    {
      label: "استيراد المخزون",
      href: "/inventory-import",
      icon: FileSpreadsheet,
    },
    {
      label: "إدارة الصلاحيات",
      href: "/expiry-management",
      icon: Calendar,
    },
    {
      label: "مشتريات الموردين",
      href: "/supplier-purchases",
      icon: Truck,
    },
    {
      label: "مجموعات المنتجات",
      href: "/product-collections",
      icon: FolderOpen,
    },
    {
      label: "العروض والخصومات",
      href: "/offers",
      icon: Tag,
    },
  ],
};

export const customersNavigation: NavigationGroup = {
  title: "العملاء والتوصيل",
  items: [
    {
      label: "العملاء والموردين",
      href: "/suppliers-customers",
      icon: Users,
    },
    {
      label: "سلات العملاء",
      href: "/customer-carts",
      icon: ShoppingCart,
    },
    {
      label: "إدارة العملاء (CRM)",
      href: "/crm",
      icon: UserCog,
    },
    {
      label: "أماكن التوصيل",
      href: "/delivery-locations",
      icon: MapPin,
    },
    {
      label: "الإعلانات",
      href: "/banners",
      icon: Image,
    },
  ],
};

export const financeNavigation: NavigationGroup = {
  title: "المالية والتحليلات",
  items: [
    {
      label: "المالية",
      href: "/finance",
      icon: DollarSign,
    },
    {
      label: "المصروفات والرواتب",
      href: "/expenses-salaries",
      icon: FileText,
    },
    {
      label: "التحليلات",
      href: "/analytics",
      icon: Activity,
    },
    {
      label: "تحليلات الذكاء الاصطناعي",
      href: "/ai-insights",
      icon: Sparkles,
    },
    {
      label: "المبيعات",
      href: "/sales-dashboard",
      icon: TrendingUp,
    },
    {
      label: "تتبع النقدية",
      href: "/cash-tracking",
      icon: Wallet,
      adminOnly: true,
    },
    {
      label: "المرتجعات",
      href: "/returns",
      icon: RefreshCw,
    },
  ],
};

export const adminNavigation: NavigationGroup = {
  title: "الإدارة والإعدادات",
  items: [
    {
      label: "إدارة الموظفين",
      href: "/employees",
      icon: UserCheck,
      adminOnly: true,
    },
    {
      label: "الإعدادات",
      href: "/settings",
      icon: Settings,
    },
  ],
};

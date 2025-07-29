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

export const adminNavigation: NavigationGroup = {
  title: "الإدارة",
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
      label: "الجرد اليومي",
      href: "/daily-inventory",
      icon: ClipboardList,
    },
    {
      label: "مشتريات الموردين",
      href: "/supplier-purchases",
      icon: Truck,
    },
    {
      label: "العملاء والموردين",
      href: "/suppliers-customers",
      icon: Users,
    },
    {
      label: "إدارة الموظفين",
      href: "/employees",
      icon: UserCheck,
      superAdminOnly: true,
    },
    {
      label: "تتبع النقدية",
      href: "/cash-tracking",
      icon: Wallet,
      adminOnly: true,
    },
    {
      label: "الإعلانات",
      href: "/banners",
      icon: Image,
    },
    {
      label: "أماكن التوصيل",
      href: "/delivery-locations",
      icon: MapPin,
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

export const generalNavigation: NavigationGroup = {
  title: "عام",
  items: [
    {
      label: "المبيعات",
      href: "/sales-dashboard",
      icon: TrendingUp,
    },
    {
      label: "المالية",
      href: "/finance",
      icon: DollarSign,
    },
    {
      label: "التقارير",
      href: "/reports",
      icon: FileText,
    },
    {
      label: "المرتجعات",
      href: "/returns",
      icon: RefreshCw,
    },
    {
      label: "الإعدادات",
      href: "/settings",
      icon: Settings,
    },
    {
      label: "الخريطة",
      href: "/map",
      icon: Map,
    },
  ],
};

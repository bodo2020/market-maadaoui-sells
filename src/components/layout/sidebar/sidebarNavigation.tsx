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
  WalletCards,
  Image,
  MapPin,
  FolderOpen,
  Tag,
  DollarSign,
  FileText,
  RefreshCw,
  Settings,
  QrCode,
  Calendar,
  FileSpreadsheet,
  BarChart3,
} from "lucide-react";
import { NavigationGroup } from "./types";

export const mainNavigation: NavigationGroup = {
  title: "الرئيسية",
  items: [
    { label: "التقارير والتحليلات", href: "/reports", icon: LayoutDashboard },
    { label: "نقطة البيع", href: "/pos", icon: ShoppingCart },
    { label: "المهام", href: "/tasks", icon: ClipboardList },
    { label: "الطلبات الإلكترونية", href: "/online-orders", icon: ShoppingBag },
    { label: "الفواتير", href: "/invoices", icon: Receipt },
  ],
};

export const productsNavigation: NavigationGroup = {
  title: "المنتجات والمخزون",
  items: [
    { label: "المنتجات", href: "/products", icon: Package },
    { label: "الأقسام", href: "/categories", icon: Grid3X3 },
    { label: "الباركود", href: "/barcode", icon: QrCode },
    { label: "الشركات", href: "/companies", icon: Building2 },
    { label: "إدارة المخزون", href: "/inventory", icon: Warehouse },
    { label: "الجرد", href: "/daily-inventory", icon: ClipboardList },
    { label: "استيراد المخزون", href: "/inventory-import", icon: FileSpreadsheet },
    { label: "إدارة الصلاحيات", href: "/expiry-management", icon: Calendar },
    { label: "الموردون", href: "/suppliers", icon: Truck },
    { label: "مشتريات الموردين", href: "/supplier-purchases", icon: Truck },
    { label: "مجموعات المنتجات", href: "/product-collections", icon: FolderOpen },
    { label: "العروض والخصومات", href: "/offers", icon: Tag },
  ],
};

export const customersNavigation: NavigationGroup = {
  title: "العملاء والتوصيل",
  items: [
    { label: "العملاء", href: "/customers", icon: Users },
    { label: "مهامي مع العملاء", href: "/customer-tasks", icon: ClipboardList, adminOnly: true },
    { label: "سلات العملاء", href: "/customer-carts", icon: ShoppingCart },
    { label: "أماكن التوصيل العامة", href: "/delivery-locations", icon: MapPin },
    { label: "أماكن التوصيل للفروع", href: "/branch-delivery-zones", icon: Building2 },
    { label: "الإعلانات", href: "/banners", icon: Image },
  ],
};

export const financeNavigation: NavigationGroup = {
  title: "المالية والتقارير",
  items: [
    { label: "مركز التقارير", href: "/reports", icon: BarChart3 },
    { label: "المالية", href: "/finance", icon: DollarSign },
    { label: "وسائل الدفع", href: "/payment-methods", icon: WalletCards },
    { label: "المصروفات والرواتب", href: "/expenses-salaries", icon: FileText },
    { label: "تتبع النقدية", href: "/cash-tracking", icon: Wallet, adminOnly: true },
    { label: "المرتجعات", href: "/returns", icon: RefreshCw },
  ],
};

export const adminNavigation: NavigationGroup = {
  title: "الإدارة والإعدادات",
  items: [
    { label: "إدارة الموظفين", href: "/employees", icon: UserCheck, adminOnly: true },
    { label: "الإعدادات", href: "/settings", icon: Settings },
  ],
};

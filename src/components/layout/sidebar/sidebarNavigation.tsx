import {
  LayoutDashboard, ShoppingCart, ShoppingBag, Receipt, Package, Grid3X3, Building2, Warehouse, ClipboardList, Truck, Users,
  UserCheck, UserRound, Wallet, WalletCards, Image, MapPin, FolderOpen, Tag, DollarSign, FileText, RefreshCw, Settings, QrCode,
  Calendar, CalendarCheck2, FileSpreadsheet, ArrowLeftRight, BellRing, ShieldCheck, Network, Clock3, Banknote, KeyRound, Vault, Landmark,
} from "lucide-react";
import { NavigationGroup } from "./types";

export const mainNavigation: NavigationGroup = {
  title: "التشغيل اليومي",
  items: [
    { label: "نقطة البيع", href: "/pos", icon: ShoppingCart },
    { label: "الطلبات الإلكترونية", href: "/online-orders", icon: ShoppingBag },
    { label: "الفواتير", href: "/invoices", icon: Receipt },
    { label: "المهام", href: "/tasks", icon: ClipboardList },
    { label: "مركز الموافقات", href: "/approvals", icon: ShieldCheck },
    { label: "مركز الإشعارات", href: "/notifications", icon: BellRing },
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
    { label: "مركز الجرد", href: "/daily-inventory", icon: ClipboardList },
    { label: "تحويلات المخزون", href: "/inventory-transfers", icon: ArrowLeftRight },
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
  title: "الماليات",
  items: [
    { label: "مركز الماليات", href: "/finance/control-center", icon: Vault },
    { label: "تشغيل المحافظ والموردين", href: "/finance/wallet-operations", icon: WalletCards },
    { label: "تحويلات الخزن والعهد", href: "/finance/transfers", icon: ArrowLeftRight },
    { label: "إدارة الحسابات والعهد", href: "/finance/accounts", icon: Landmark },
    { label: "التقارير المالية والخزن", href: "/finance", icon: DollarSign },
    { label: "تتبع النقدية", href: "/cash-tracking", icon: Wallet, adminOnly: true },
    { label: "وسائل الدفع", href: "/payment-methods", icon: WalletCards },
    { label: "المصروفات", href: "/expenses", icon: FileText },
    { label: "المرتجعات", href: "/returns", icon: RefreshCw },
  ],
};

export const hrNavigation: NavigationGroup = {
  title: "الموارد البشرية",
  items: [
    { label: "بوابة الموظف", href: "/my-hr", icon: UserRound },
    { label: "الحضور والانصراف", href: "/attendance", icon: Clock3 },
    { label: "إدارة الموظفين", href: "/employees", icon: UserCheck, adminOnly: true },
    { label: "جدولة الورديات", href: "/hr/shifts", icon: Clock3, adminOnly: true },
    { label: "تقويم الإجازات", href: "/hr/leave-calendar", icon: CalendarCheck2, adminOnly: true },
    { label: "مسير الرواتب", href: "/hr/payroll", icon: Banknote, adminOnly: true },
    { label: "الهيكل التنظيمي", href: "/organization", icon: Network, adminOnly: true },
  ],
};

export const reportsNavigation: NavigationGroup = {
  title: "التقارير والتحليلات",
  items: [
    { label: "مركز التقارير", href: "/reports", icon: LayoutDashboard },
  ],
};

export const adminNavigation: NavigationGroup = {
  title: "الحساب والإعدادات",
  items: [
    { label: "حسابي", href: "/account", icon: UserRound },
    { label: "تغيير PIN", href: "/account", icon: KeyRound },
    { label: "الإعدادات", href: "/settings", icon: Settings },
  ],
};

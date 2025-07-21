import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  TrendingUp,
  Settings,
  FolderOpen,
  Building2,
  Calculator,
  DollarSign,
  ClipboardList,
  Truck,
  RotateCcw,
  MapPin,
  Image,
  Tags,
  Archive,
  QrCode
} from "lucide-react";
import { SidebarItemData } from "./types";

export const mainNavigation = {
  items: [
    { href: "/", icon: LayoutDashboard, label: "لوحة التحكم" },
    { href: "/pos", icon: ShoppingCart, label: "نقاط البيع", cashierOnly: true },
    { href: "/online-orders", icon: Truck, label: "الطلبات الأونلاين", cashierOnly: true },
    { href: "/sales", icon: TrendingUp, label: "المبيعات" },
    { href: "/returns", icon: RotateCcw, label: "المرتجعات" },
    { href: "/customers", icon: Users, label: "العملاء" },
    { href: "/suppliers", icon: Truck, label: "الموردين" },
    { href: "/inventory", icon: Package, label: "المخزون" },
    { href: "/reports", icon: DollarSign, label: "التقارير" },
  ] as SidebarItemData[]
};

export const adminNavigation = {
  items: [
    { href: "/products", icon: Package, label: "إدارة المنتجات", adminOnly: true },
    { href: "/add-product", icon: Package, label: "إضافة منتج", adminOnly: true },
    { href: "/barcode-printing", icon: QrCode, label: "طباعة الباركود", adminOnly: true },
    { href: "/categories", icon: FolderOpen, label: "الأقسام", adminOnly: true },
    { href: "/companies", icon: Building2, label: "الشركات", adminOnly: true },
    { href: "/product-collections", icon: Archive, label: "مجموعات المنتجات", adminOnly: true },
    { href: "/purchases", icon: ClipboardList, label: "المشتريات", adminOnly: true },
    { href: "/expenses", icon: Calculator, label: "المصروفات", adminOnly: true },
    { href: "/delivery-locations", icon: MapPin, label: "مناطق التوصيل", adminOnly: true },
  ] as SidebarItemData[]
};

export const generalNavigation = {
  items: [
    { href: "/invoices", icon: ClipboardList, label: "الفواتير", cashierOnly: true },
    { href: "/settings", icon: Settings, label: "الإعدادات" },
  ] as SidebarItemData[]
};

interface SidebarItem {
  title: string;
  items: {
    title: string;
    href: string;
    icon: React.ComponentType<any>;
  }[];
}

export const sidebarNavigation: SidebarItem[] = [
  {
    title: "عام",
    items: [
      { title: "لوحة التحكم", href: "/", icon: LayoutDashboard },
    ],
  },
  {
    title: "إدارة المبيعات",
    items: [
      { title: "نقاط البيع", href: "/pos", icon: ShoppingCart },
      { title: "المبيعات", href: "/sales", icon: TrendingUp },
      { title: "الطلبات", href: "/orders", icon: Truck },
      { title: "المرتجعات", href: "/returns", icon: RotateCcw },
    ],
  },
  {
    title: "المنتجات",
    items: [
      { title: "إدارة المنتجات", href: "/products", icon: Package },
      { title: "إضافة منتج", href: "/add-product", icon: Package },
      { title: "طباعة الباركود", href: "/barcode-printing", icon: QrCode },
      { title: "الأقسام", href: "/categories", icon: FolderOpen },
      { title: "الشركات", href: "/companies", icon: Building2 },
      { title: "مجموعات المنتجات", href: "/product-collections", icon: Archive },
    ],
  },
  {
    title: "إدارة العملاء",
    items: [
      { title: "العملاء", href: "/customers", icon: Users },
      { title: "الموردين", href: "/suppliers", icon: Truck },
      { title: "مناطق التوصيل", href: "/delivery-locations", icon: MapPin },
    ],
  },
  {
    title: "إدارة المخزون",
    items: [
      { title: "المخزون", href: "/inventory", icon: Package },
      { title: "المشتريات", href: "/purchases", icon: ClipboardList },
    ],
  },
  {
    title: "المحاسبة",
    items: [
      { title: "المصروفات", href: "/expenses", icon: Calculator },
      { title: "التقارير", href: "/reports", icon: DollarSign },
    ],
  },
  {
    title: "إعدادات المتجر",
    items: [
      { title: "إعدادات عامة", href: "/settings", icon: Settings },
    ],
  },
];

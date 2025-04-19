
import {
  BarChart4, Store, ShoppingCart, PackageOpen, Users, Settings, FileText,
  Receipt, Home, UserPlus, Truck, Building2, ImageIcon,
  ShoppingBag, FolderOpen, MapPin, TrendingUp
} from "lucide-react";
import { SidebarGroupData } from "./types";

export const mainNavigation: SidebarGroupData = {
  items: [
    { icon: Home, label: "الرئيسية", href: "/" },
    { icon: ShoppingCart, label: "نقطة البيع", href: "/pos" },
    { icon: FolderOpen, label: "الاقسام", href: "/categories" },
    { icon: TrendingUp, label: "لوحة المبيعات والخزينة", href: "/sales-dashboard" }
  ]
};

export const adminNavigation: SidebarGroupData = {
  items: [
    { icon: Building2, label: "الشركات", href: "/companies", adminOnly: true },
    { icon: ImageIcon, label: "البانرات", href: "/banners", adminOnly: true },
    { icon: MapPin, label: "مناطق التوصيل", href: "/delivery-locations", adminOnly: true }
  ]
};

export const generalNavigation: SidebarGroupData = {
  items: [
    { icon: Truck, label: "مشتريات الموردين", href: "/supplier-purchases" },
    { icon: PackageOpen, label: "المنتجات", href: "/products" },
    { icon: ShoppingBag, label: "الطلبات الإلكترونية", href: "/online-orders" },
    { icon: Receipt, label: "الفواتير", href: "/invoices" },
    { icon: BarChart4, label: "التقارير والمالية", href: "/reports" },
    { icon: Store, label: "المخزون", href: "/inventory" },
    { icon: UserPlus, label: "العملاء والموردين", href: "/suppliers-customers" },
    { icon: FileText, label: "المصروفات", href: "/expenses" },
    { icon: Users, label: "الموظفين", href: "/employees", adminOnly: true },
    { icon: Settings, label: "الإعدادات", href: "/settings" }
  ]
};


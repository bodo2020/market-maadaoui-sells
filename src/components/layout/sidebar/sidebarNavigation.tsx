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
  QrCode  // Add this import
} from "lucide-react";

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
      { title: "طباعة الباركود", href: "/barcode-printing", icon: QrCode }, // Add this line
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

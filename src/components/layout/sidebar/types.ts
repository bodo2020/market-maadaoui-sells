
import { LucideIcon } from "lucide-react";

export interface SidebarItemData {
  icon: LucideIcon;
  label: string;
  href: string;
  badge?: number;
  secondaryBadge?: number; // إضافة دعم للإشعارات الثانوية  
  adminOnly?: boolean;
  superAdminOnly?: boolean;
  cashierOnly?: boolean; // إضافة دعم للصفحات الخاصة بالكاشير
  deliveryOnly?: boolean; // إضافة دعم للصفحات الخاصة بمندوبي التوصيل
}

export interface SidebarGroupData {
  items: SidebarItemData[];
}

export interface NavigationGroup {
  title: string;
  items: SidebarItemData[];
}

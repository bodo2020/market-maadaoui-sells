import { LucideIcon } from "lucide-react";

export interface SidebarItemData {
  icon: LucideIcon;
  label: string;
  href: string;
  badge?: number;
  secondaryBadge?: number;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
  cashierOnly?: boolean;
  deliveryOnly?: boolean;
}

export interface SidebarGroupData {
  items: SidebarItemData[];
}

export interface NavigationGroup {
  title: string;
  items: SidebarItemData[];
}

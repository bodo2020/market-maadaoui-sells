
import { LucideIcon } from "lucide-react";

export interface SidebarItemData {
  icon: LucideIcon;
  label: string;
  href: string;
  badge?: number;
  adminOnly?: boolean;
}

export interface SidebarGroupData {
  items: SidebarItemData[];
}

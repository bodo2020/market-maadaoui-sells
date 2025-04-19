
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useNotificationStore } from "@/stores/notificationStore";
import { SidebarItem } from "./SidebarItem";
import { mainNavigation, adminNavigation, generalNavigation } from "./sidebarNavigation";
import { SidebarItemData } from "./types";

interface SidebarContentProps {
  collapsed: boolean;
}

export function SidebarContent({ collapsed }: SidebarContentProps) {
  const location = useLocation();
  const currentPath = location.pathname;
  const { user } = useAuth();
  const { unreadOrders } = useNotificationStore();
  const isAdmin = user?.role === 'admin';

  const renderItems = (items: SidebarItemData[]) => {
    return items.map(item => {
      if (item.adminOnly && !isAdmin) return null;
      
      return (
        <SidebarItem
          key={item.href}
          icon={item.icon}
          label={item.label}
          href={item.href}
          active={currentPath === item.href}
          collapsed={collapsed}
          badge={item.href === "/online-orders" ? unreadOrders : undefined}
        />
      );
    });
  };

  return (
    <div className="flex-1 space-y-1 px-0">
      {renderItems(mainNavigation.items)}
      {isAdmin && renderItems(adminNavigation.items)}
      {renderItems(generalNavigation.items)}
    </div>
  );
}


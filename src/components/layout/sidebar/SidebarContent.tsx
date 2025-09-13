
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useNotificationStore } from "@/stores/notificationStore";
import { SidebarItem } from "./SidebarItem";
import { 
  mainNavigation, 
  productsNavigation, 
  customersNavigation, 
  financeNavigation, 
  adminNavigation 
} from "./sidebarNavigation";
import { SidebarItemData } from "./types";
import { UserRole } from "@/types";

interface SidebarContentProps {
  collapsed: boolean;
}

export function SidebarContent({ collapsed }: SidebarContentProps) {
  const location = useLocation();
  const currentPath = location.pathname;
  const { user } = useAuth();
  const { unreadOrders, unreadReturns } = useNotificationStore();
  const isAdmin = user?.role === UserRole.ADMIN;
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const isCashier = user?.role === UserRole.CASHIER;
  const isDelivery = user?.role === UserRole.DELIVERY;

  const renderItems = (items: SidebarItemData[]) => {
    return items.map(item => {
      // Skip admin-only items for non-admin users (except super admin)
      if (item.adminOnly && !isAdmin && !isSuperAdmin) return null;
      
      // Skip cashier-only items for non-cashier users
      if (item.cashierOnly && !isCashier) return null;
      
      // Skip delivery-only items for non-delivery users
      if (item.deliveryOnly && !isDelivery) return null;
      
      // For cashiers, only show specific routes (super admin sees everything)
      if (isCashier && !isSuperAdmin) {
        const allowedCashierRoutes = ['/', '/pos', '/online-orders', '/invoices'];
        if (!allowedCashierRoutes.includes(item.href)) return null;
      }
      
      // ضبط الشارات (badges) بناءً على نوع الصفحة
      let badge = undefined;
      let secondaryBadge = undefined;
      
      if (item.href === "/online-orders") {
        badge = unreadOrders;
      } else if (item.href === "/returns") {
        badge = unreadReturns;
      } else if (item.badge) {
        badge = item.badge;
      }
      
      if (item.secondaryBadge) {
        secondaryBadge = item.secondaryBadge;
      }
      
      return (
        <SidebarItem
          key={item.href}
          icon={item.icon}
          label={item.label}
          href={item.href}
          active={currentPath === item.href}
          collapsed={collapsed}
          badge={badge}
          secondaryBadge={secondaryBadge}
        />
      );
    });
  };

  const renderSection = (title: string, items: SidebarItemData[]) => {
    const renderedItems = renderItems(items).filter(item => item !== null);
    
    if (renderedItems.length === 0) return null;
    
    return (
      <div className="space-y-1">
        {!collapsed && (
          <div className="px-4 py-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {title}
            </h3>
          </div>
        )}
        <div className="space-y-1">
          {renderedItems}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 space-y-4 px-0 py-2 overflow-y-auto">
      {renderSection(mainNavigation.title, mainNavigation.items)}
      {(isAdmin || isSuperAdmin) && renderSection(productsNavigation.title, productsNavigation.items)}
      {renderSection(customersNavigation.title, customersNavigation.items)}
      {renderSection(financeNavigation.title, financeNavigation.items)}
      {(isAdmin || isSuperAdmin) && renderSection(adminNavigation.title, adminNavigation.items)}
    </div>
  );
}

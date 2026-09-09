import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useNotificationStore } from "@/stores/notificationStore";
import { SidebarItem } from "./SidebarItem";
import {
  mainNavigation,
  productsNavigation,
  customersNavigation,
  financeNavigation,
  hrNavigation,
  reportsNavigation,
  adminNavigation,
} from "./sidebarNavigation";
import { SidebarItemData } from "./types";
import { UserRole } from "@/types";

interface SidebarContentProps { collapsed: boolean; }

export function SidebarContent({ collapsed }: SidebarContentProps) {
  const location = useLocation();
  const currentPath = location.pathname;
  const { user } = useAuth();
  const { unreadOrders, unreadReturns, customerTaskAlerts, operationsTaskAlerts, operationsTaskOverdue, approvalAlerts } = useNotificationStore();
  const isAdmin = user?.role === UserRole.ADMIN;
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const isCashier = user?.role === UserRole.CASHIER;
  const isDelivery = user?.role === UserRole.DELIVERY;

  const renderItems = (items: SidebarItemData[]) => items.map(item => {
    if (item.adminOnly && !isAdmin && !isSuperAdmin) return null;
    if (item.cashierOnly && !isCashier) return null;
    if (item.deliveryOnly && !isDelivery) return null;

    if (isCashier && !isSuperAdmin) {
      const allowedCashierRoutes = ["/", "/pos", "/tasks", "/notifications", "/online-orders", "/invoices", "/my-hr", "/attendance", "/account"];
      if (!allowedCashierRoutes.includes(item.href)) return null;
    }

    let badge: number | undefined;
    let secondaryBadge: number | undefined;
    if (item.href === "/online-orders") badge = unreadOrders;
    else if (item.href === "/returns") badge = unreadReturns;
    else if (item.href === "/customer-tasks") badge = customerTaskAlerts;
    else if (item.href === "/tasks") { badge = operationsTaskAlerts; secondaryBadge = operationsTaskOverdue; }
    else if (item.href === "/approvals") badge = approvalAlerts;
    else if (item.badge) badge = item.badge;
    if (item.secondaryBadge && !secondaryBadge) secondaryBadge = item.secondaryBadge;

    const active = currentPath === item.href || (item.href !== "/" && currentPath.startsWith(`${item.href}/`));
    return <SidebarItem key={`${item.href}-${item.label}`} icon={item.icon} label={item.label} href={item.href} active={active} collapsed={collapsed} badge={badge} secondaryBadge={secondaryBadge} />;
  });

  const renderSection = (title: string, items: SidebarItemData[]) => {
    const renderedItems = renderItems(items).filter(Boolean);
    if (!renderedItems.length) return null;
    return (
      <div className="space-y-1">
        {!collapsed && <div className="px-4 pb-1 pt-3"><h3 className="text-[10px] font-black uppercase tracking-[.12em] text-slate-400">{title}</h3></div>}
        <div className="space-y-1">{renderedItems}</div>
      </div>
    );
  };

  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-0 py-2">
      {renderSection(mainNavigation.title, mainNavigation.items)}
      {(isAdmin || isSuperAdmin) && renderSection(productsNavigation.title, productsNavigation.items)}
      {renderSection(customersNavigation.title, customersNavigation.items)}
      {renderSection(financeNavigation.title, financeNavigation.items)}
      {renderSection(hrNavigation.title, hrNavigation.items)}
      {renderSection(reportsNavigation.title, reportsNavigation.items)}
      {renderSection(adminNavigation.title, adminNavigation.items)}
    </div>
  );
}

import { useState } from "react";
import { useLocation } from "react-router-dom";
import { ChevronDown, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNotificationStore } from "@/stores/notificationStore";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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
import { NavigationGroup, SidebarItemData } from "./types";
import { UserRole } from "@/types";

interface SidebarContentProps {
  collapsed: boolean;
  onNavigate?: () => void;
}

export function SidebarContent({ collapsed, onNavigate }: SidebarContentProps) {
  const location = useLocation();
  const currentPath = location.pathname;
  const { user } = useAuth();
  const {
    unreadOrders,
    unreadReturns,
    customerTaskAlerts,
    operationsTaskAlerts,
    operationsTaskOverdue,
    approvalAlerts,
  } = useNotificationStore();

  const [search, setSearch] = useState("");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const isAdmin = user?.role === UserRole.ADMIN;
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const isCashier = user?.role === UserRole.CASHIER;
  const isDelivery = user?.role === UserRole.DELIVERY;
  const query = search.trim().toLocaleLowerCase("ar");

  const navigationGroups: NavigationGroup[] = [
    mainNavigation,
    ...(isAdmin || isSuperAdmin ? [productsNavigation] : []),
    customersNavigation,
    financeNavigation,
    hrNavigation,
    reportsNavigation,
    adminNavigation,
  ];

  const isItemVisible = (item: SidebarItemData) => {
    if (item.adminOnly && !isAdmin && !isSuperAdmin) return false;
    if (item.cashierOnly && !isCashier) return false;
    if (item.deliveryOnly && !isDelivery) return false;

    if (isCashier && !isSuperAdmin) {
      const allowedCashierRoutes = [
        "/",
        "/pos",
        "/tasks",
        "/notifications",
        "/online-orders",
        "/invoices",
        "/my-hr",
        "/attendance",
        "/account",
      ];
      if (!allowedCashierRoutes.includes(item.href)) return false;
    }

    return true;
  };

  const isItemActive = (item: SidebarItemData) =>
    currentPath === item.href || (item.href !== "/" && currentPath.startsWith(`${item.href}/`));

  const getBadges = (item: SidebarItemData) => {
    let badge: number | undefined;
    let secondaryBadge: number | undefined;

    if (item.href === "/online-orders") badge = unreadOrders;
    else if (item.href === "/returns") badge = unreadReturns;
    else if (item.href === "/customer-tasks") badge = customerTaskAlerts;
    else if (item.href === "/tasks") {
      badge = operationsTaskAlerts;
      secondaryBadge = operationsTaskOverdue;
    } else if (item.href === "/approvals") badge = approvalAlerts;
    else if (item.badge) badge = item.badge;

    if (item.secondaryBadge && !secondaryBadge) secondaryBadge = item.secondaryBadge;
    return { badge, secondaryBadge };
  };

  const toggleSection = (title: string) => {
    setOpenSections((current) => ({ ...current, [title]: !(current[title] ?? true) }));
  };

  const renderSection = (group: NavigationGroup, index: number) => {
    const visibleItems = group.items
      .filter(isItemVisible)
      .filter((item) => !query || `${item.label} ${group.title}`.toLocaleLowerCase("ar").includes(query));

    if (!visibleItems.length) return null;

    const hasActiveItem = visibleItems.some(isItemActive);
    const isOpen = collapsed || Boolean(query) || hasActiveItem || (openSections[group.title] ?? true);

    return (
      <section
        key={group.title}
        className={cn(
          "relative",
          collapsed && index > 0 && "mt-2 border-t border-slate-100 pt-2"
        )}
      >
        {!collapsed && (
          <button
            type="button"
            onClick={() => toggleSection(group.title)}
            className="group mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-right text-[11px] font-black text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
            aria-expanded={isOpen}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70" />
            <span className="min-w-0 flex-1 truncate">{group.title}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500">
              {visibleItems.length}
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-200",
                isOpen ? "rotate-0" : "-rotate-90"
              )}
            />
          </button>
        )}

        {isOpen && (
          <div className="space-y-1">
            {visibleItems.map((item) => {
              const { badge, secondaryBadge } = getBadges(item);
              return (
                <SidebarItem
                  key={`${item.href}-${item.label}`}
                  icon={item.icon}
                  label={item.label}
                  href={item.href}
                  active={isItemActive(item)}
                  collapsed={collapsed}
                  badge={badge}
                  secondaryBadge={secondaryBadge}
                  onNavigate={onNavigate}
                />
              );
            })}
          </div>
        )}
      </section>
    );
  };

  const hasSearchResults = navigationGroups.some((group) =>
    group.items.some(
      (item) =>
        isItemVisible(item) &&
        (!query || `${item.label} ${group.title}`.toLocaleLowerCase("ar").includes(query))
    )
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!collapsed && (
        <div className="px-3 pb-2 pt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="بحث في القائمة..."
              className="h-10 rounded-xl border-slate-200 bg-slate-50/80 pr-10 text-sm font-medium shadow-none placeholder:text-slate-400 focus-visible:border-emerald-300 focus-visible:ring-[#005931]/15"
              aria-label="بحث في القائمة الجانبية"
            />
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-4 pt-1 [scrollbar-color:rgb(203_213_225)_transparent] [scrollbar-width:thin]">
        <div className={cn("space-y-3", collapsed && "space-y-2 py-2")}>
          {navigationGroups.map(renderSection)}
        </div>

        {!collapsed && query && !hasSearchResults && (
          <div className="mx-3 mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
            <Search className="mx-auto mb-2 h-5 w-5 text-slate-300" />
            <p className="text-xs font-bold text-slate-500">لا توجد نتيجة مطابقة</p>
            <p className="mt-1 text-[10px] text-slate-400">جرّب اسم صفحة أو قسم مختلف</p>
          </div>
        )}
      </div>
    </div>
  );
}

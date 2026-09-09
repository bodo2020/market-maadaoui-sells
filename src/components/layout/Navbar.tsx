import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, BellDot, User, LogOut, Check, Store, ChevronDown, Truck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { useNavigate } from "react-router-dom";
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  checkLowStockProducts,
  showLowStockToasts,
  StockNotification,
} from "@/services/notificationService";
import {
  fetchInventoryTransferSmartAlertsV2,
  InventoryTransferSmartAlertV2,
} from "@/services/supabase/inventoryTransferSmartAlertsV2Service";
import { ScrollArea } from "@/components/ui/scroll-area";

const transferReadKey = (userId: string, branchId: string, alert: InventoryTransferSmartAlertV2) =>
  `inventory-transfer-alert-read:${userId}:${branchId}:${alert.id}:${alert.metric_value}`;

export default function Navbar() {
  const { user, logout, branchOptions, switchBranch } = useAuth();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<StockNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [switchingBranchId, setSwitchingBranchId] = useState<string | null>(null);
  const [transferReadVersion, setTransferReadVersion] = useState(0);

  const currentBranchContext = branchOptions.find(branch => branch.branch_id === currentBranchId);
  const canSeeNotifications = user?.role === 'super_admin' || Boolean(currentBranchContext?.permissions?.includes('inventory.view'));

  const transferAlertsQuery = useQuery({
    queryKey: ["inventory-transfer-smart-alerts", currentBranchId],
    enabled: Boolean(user?.id && currentBranchId && canSeeNotifications),
    queryFn: () => fetchInventoryTransferSmartAlertsV2(currentBranchId as string),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: 30_000,
  });

  const transferAlerts = (transferAlertsQuery.data?.alerts || [])
    .filter(alert => alert.severity === "critical" || alert.severity === "warning")
    .sort((a, b) => b.priority - a.priority);

  const isTransferRead = (alert: InventoryTransferSmartAlertV2) => {
    if (!user?.id || !currentBranchId) return true;
    void transferReadVersion;
    return localStorage.getItem(transferReadKey(user.id, currentBranchId, alert)) === "1";
  };

  const loadNotifications = () => {
    setNotifications(getNotifications());
  };

  useEffect(() => {
    loadNotifications();

    const checkStock = async () => {
      await checkLowStockProducts();
      showLowStockToasts();
      loadNotifications();
    };

    checkStock();
    const interval = setInterval(checkStock, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleNotificationClick = (notification: StockNotification) => {
    markNotificationAsRead(notification.id);
    loadNotifications();
    navigate('/inventory');
    setNotificationsOpen(false);
  };

  const handleTransferNotificationClick = (alert: InventoryTransferSmartAlertV2) => {
    if (user?.id && currentBranchId) {
      localStorage.setItem(transferReadKey(user.id, currentBranchId, alert), "1");
      setTransferReadVersion(version => version + 1);
    }
    navigate(alert.href || '/reports/inventory-transfers');
    setNotificationsOpen(false);
  };

  const handleMarkAllAsRead = () => {
    markAllNotificationsAsRead();
    if (user?.id && currentBranchId) {
      transferAlerts.forEach(alert => {
        localStorage.setItem(transferReadKey(user.id, currentBranchId, alert), "1");
      });
      setTransferReadVersion(version => version + 1);
    }
    loadNotifications();
  };

  const handleBranchChange = async (branchId: string) => {
    if (branchId === currentBranchId || switchingBranchId) return;
    try {
      setSwitchingBranchId(branchId);
      await switchBranch(branchId);
      setBranchDropdownOpen(false);
      // Existing pages have several branch-keyed stores and queries. A controlled reload
      // guarantees that every module rehydrates from the newly validated branch context.
      window.location.reload();
    } finally {
      setSwitchingBranchId(null);
    }
  };

  const stockUnreadCount = notifications.filter(n => !n.read).length;
  const transferUnreadCount = transferAlerts.filter(alert => !isTransferRead(alert)).length;
  const unreadCount = stockUnreadCount + transferUnreadCount;
  const roleLabel = currentBranchContext?.role_name_ar || (user?.role === 'super_admin' ? 'مدير النظام' : 'موظف');

  return (
    <header className="border-b bg-white py-3 px-6 flex items-center justify-between sticky top-0 z-30 min-h-[60px]">
      <div className="flex items-center">
        <h2 className="text-lg font-medium">لوحة التحكم</h2>
      </div>

      <div className="flex items-center gap-4">
        {branchOptions.length > 1 ? (
          <DropdownMenu open={branchDropdownOpen} onOpenChange={setBranchDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 px-3 py-1.5">
                <Store className="h-4 w-4" />
                <span className="font-medium">{currentBranchName || 'اختر الفرع'}</span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>فروعك المتاحة</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {branchOptions.map(branch => (
                <DropdownMenuItem
                  key={branch.branch_id}
                  disabled={Boolean(switchingBranchId)}
                  onClick={() => void handleBranchChange(branch.branch_id)}
                  className={currentBranchId === branch.branch_id ? 'bg-accent' : ''}
                >
                  <Store className="ml-2 h-4 w-4" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{branch.branch_name}</div>
                    <div className="text-[11px] text-muted-foreground">{branch.branch_code} · {branch.role_name_ar}</div>
                  </div>
                  {switchingBranchId === branch.branch_id ? (
                    <span className="mr-auto inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : currentBranchId === branch.branch_id ? (
                    <Check className="mr-auto h-4 w-4" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : currentBranchName ? (
          <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground">
            <Store className="h-4 w-4" />
            <span className="font-medium">{currentBranchName}</span>
          </div>
        ) : null}

        {canSeeNotifications && (
          <DropdownMenu open={notificationsOpen} onOpenChange={setNotificationsOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                {unreadCount > 0 ? (
                  <>
                    <BellDot size={20} className="text-yellow-500" />
                    <span className="absolute top-0 right-0 min-w-4 h-4 px-1 bg-red-500 rounded-full text-white text-[10px] flex items-center justify-center">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  </>
                ) : (
                  <Bell size={20} />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-96">
              <DropdownMenuLabel className="flex items-center justify-between">
                <span>مركز الإشعارات</span>
                {unreadCount > 0 && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleMarkAllAsRead}>
                    <Check className="ml-1 h-3 w-3" /> تعيين الكل كمقروء
                  </Button>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              <ScrollArea className="h-[360px]">
                {transferAlerts.length === 0 && notifications.length === 0 ? (
                  <div className="py-6 px-2 text-center text-muted-foreground">لا توجد إشعارات</div>
                ) : (
                  <>
                    {transferAlerts.length > 0 && (
                      <div className="px-2 pb-1 pt-2 text-[11px] font-bold text-muted-foreground">تحويلات المخزون</div>
                    )}
                    {transferAlerts.map(alert => {
                      const read = isTransferRead(alert);
                      const critical = alert.severity === 'critical';
                      return (
                        <DropdownMenuItem
                          key={alert.id}
                          className={`p-3 cursor-pointer ${!read ? (critical ? 'bg-red-50' : 'bg-amber-50') : ''}`}
                          onClick={() => handleTransferNotificationClick(alert)}
                        >
                          <div className="flex gap-3 items-start w-full">
                            <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${critical ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                              {critical ? <TriangleAlert className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-bold leading-5">{alert.title}</p>
                                {!read && <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${critical ? 'bg-red-500' : 'bg-amber-500'}`} />}
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{alert.message}</p>
                              <p className="mt-1 text-[10px] font-semibold text-muted-foreground">{critical ? 'عاجل' : 'تحذير'} · أولوية {alert.priority}</p>
                            </div>
                          </div>
                        </DropdownMenuItem>
                      );
                    })}

                    {transferAlerts.length > 0 && notifications.length > 0 && <DropdownMenuSeparator className="my-1" />}
                    {notifications.length > 0 && (
                      <div className="px-2 pb-1 pt-2 text-[11px] font-bold text-muted-foreground">المخزون المنخفض</div>
                    )}
                    {notifications.map(notification => (
                      <DropdownMenuItem
                        key={notification.id}
                        className={`p-3 cursor-pointer ${!notification.read ? 'bg-yellow-50' : ''}`}
                        onClick={() => handleNotificationClick(notification)}
                      >
                        <div className="flex gap-3 items-start w-full">
                          <div className={`h-2 w-2 mt-2 rounded-full ${!notification.read ? 'bg-yellow-500' : 'bg-gray-200'}`} />
                          <div className="flex-1">
                            <div className="flex justify-between items-start">
                              <p className="font-medium text-sm">تنبيه المخزون المنخفض</p>
                              <span className="text-xs text-muted-foreground">
                                {new Date(notification.createdAt).toLocaleDateString('ar-EG')}
                              </span>
                            </div>
                            <p className="text-sm mt-1">
                              المنتج "{notification.product.name}" منخفض المخزون ({notification.product.quantity} وحدة متبقية)
                            </p>
                          </div>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </ScrollArea>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {user?.name ? user.name.charAt(0) : 'أ'}
                </AvatarFallback>
              </Avatar>
              <div className="text-right">
                <p className="text-sm font-medium">{user?.name || 'المستخدم'}</p>
                <p className="text-xs text-muted-foreground">{roleLabel}</p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>حسابي</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="ml-2 h-4 w-4" />
              <span>الملف الشخصي</span>
            </DropdownMenuItem>
            <DropdownMenuItem>الإعدادات</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void handleLogout()}>
              <LogOut className="ml-2 h-4 w-4" />
              <span>تسجيل الخروج</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

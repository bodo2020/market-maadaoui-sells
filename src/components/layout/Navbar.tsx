import { useState, useEffect } from "react";
import { Bell, BellDot, User, LogOut, Check, Store, ChevronDown } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";

export default function Navbar() {
  const { user, logout, branchOptions, switchBranch } = useAuth();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<StockNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [switchingBranchId, setSwitchingBranchId] = useState<string | null>(null);

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

  const handleMarkAllAsRead = () => {
    markAllNotificationsAsRead();
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

  const unreadCount = notifications.filter(n => !n.read).length;
  const canSeeNotifications = user?.role === 'admin' || user?.role === 'super_admin';

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
                    <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center">
                      {unreadCount}
                    </span>
                  </>
                ) : (
                  <Bell size={20} />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel className="flex items-center justify-between">
                <span>الإشعارات</span>
                {unreadCount > 0 && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleMarkAllAsRead}>
                    <Check className="ml-1 h-3 w-3" /> تعيين الكل كمقروء
                  </Button>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              <ScrollArea className="h-[300px]">
                {notifications.length === 0 ? (
                  <div className="py-4 px-2 text-center text-muted-foreground">لا توجد إشعارات</div>
                ) : (
                  notifications.map(notification => (
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
                  ))
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
                <p className="text-xs text-muted-foreground">{user?.role || 'مستخدم'}</p>
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

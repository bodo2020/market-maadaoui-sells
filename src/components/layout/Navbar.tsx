import { useState, useEffect } from "react";
import { Bell, BellDot, User, LogOut, X, Check, Store } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { useNavigate } from "react-router-dom";
import { 
  getNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead, 
  checkLowStockProducts,
  showLowStockToasts,
  StockNotification
} from "@/services/notificationService";
import { toast } from "@/components/ui/sonner";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function Navbar() {
  const { user, logout } = useAuth();
  const { currentBranchName } = useBranchStore();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<StockNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // Load notifications on mount and when notifications change
  const loadNotifications = () => {
    setNotifications(getNotifications());
  };

  // Load notifications on mount and periodically check for low stock
  useEffect(() => {
    // Load existing notifications
    loadNotifications();
    
    // Check for low stock products initially
    const checkStock = async () => {
      await checkLowStockProducts();
      // Show toasts for new notifications only
      showLowStockToasts();
      // Refresh notifications list after checking
      loadNotifications();
    };
    
    checkStock();
    
    // Periodically check for low stock (every 5 minutes)
    const interval = setInterval(checkStock, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleNotificationClick = (notification: StockNotification) => {
    // Mark the notification as read
    markNotificationAsRead(notification.id);
    // Update notifications state immediately after marking as read
    loadNotifications();
    
    // Navigate to inventory management page
    navigate('/inventory');
    
    // Close the dropdown
    setNotificationsOpen(false);
  };

  const handleMarkAllAsRead = () => {
    markAllNotificationsAsRead();
    // Update notifications state immediately after marking all as read
    loadNotifications();
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <header className="border-b bg-white py-3 px-6 flex items-center justify-between sticky top-0 z-30 min-h-[60px]">
      <div className="flex items-center">
        <h2 className="text-lg font-medium">لوحة التحكم</h2>
      </div>
      
      <div className="flex items-center gap-4">
        {currentBranchName && (
          <Badge variant="outline" className="gap-2 px-3 py-1.5">
            <Store className="h-4 w-4" />
            <span className="font-medium">{currentBranchName}</span>
          </Badge>
        )}
        
        {(user?.role === 'admin' || user?.role === 'super_admin') && (
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
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-xs"
                    onClick={handleMarkAllAsRead}
                  >
                    <Check className="ml-1 h-3 w-3" /> تعيين الكل كمقروء
                  </Button>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              
              <ScrollArea className="h-[300px]">
                {notifications.length === 0 ? (
                  <div className="py-4 px-2 text-center text-muted-foreground">
                    لا توجد إشعارات
                  </div>
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
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="ml-2 h-4 w-4" />
              <span>تسجيل الخروج</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

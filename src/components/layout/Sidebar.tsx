import {
  Home,
  LayoutDashboard,
  Settings,
  ShoppingBag,
  Users,
  Package as CategoryIcon,
  Truck,
  Percent,
  Coins,
  FileText,
  Archive,
  LogOut,
  LogIn,
  UserPlus,
  ListChecks,
  BarChart,
  Store,
  Package,
  Calendar,
  Wallet,
  MessageSquare,
  CircleUserRound,
  ClipboardList,
  Receipt,
  KanbanSquare,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotificationStore } from "@/stores/notificationStore";

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, isAuthenticated, user, loading: authLoading } = useAuth();
  const [isClosing, setIsClosing] = useState(false);
  const { unreadOrders, markOrdersAsRead } = useNotificationStore();

  useEffect(() => {
    if (!isAuthenticated && !authLoading) {
      navigate("/login");
    }
  }, [isAuthenticated, authLoading, navigate]);

  const handleLogout = async () => {
    setIsClosing(true);
    await logout();
    toast.success("تم تسجيل الخروج بنجاح");
    setIsClosing(false);
    navigate("/login");
  };

  const sidebarItems = [
    {
      path: "/",
      icon: Home,
      label: "الرئيسية",
      roles: ["admin", "cashier", "employee", "delivery"],
    },
    {
      path: "/dashboard",
      icon: LayoutDashboard,
      label: "لوحة التحكم",
      roles: ["admin", "cashier", "employee", "delivery"],
    },
    {
      path: "/pos",
      icon: Store,
      label: "نقاط البيع",
      roles: ["admin", "cashier"],
    },
    {
      path: "/products",
      icon: ShoppingBag,
      label: "المنتجات",
      roles: ["admin", "cashier", "employee"],
    },
    {
      path: "/categories",
      icon: CategoryIcon,
      label: "الأقسام",
      roles: ["admin", "employee"],
    },
    {
      path: "/online-orders",
      icon: Package,
      label: "الطلبات",
      roles: ["admin", "employee", "delivery"],
    },
    {
      path: "/users",
      icon: Users,
      label: "المستخدمين",
      roles: ["admin"],
    },
    {
      path: "/suppliers",
      icon: Truck,
      label: "الموردين",
      roles: ["admin", "employee"],
    },
    {
      path: "/customers",
      icon: CircleUserRound,
      label: "العملاء",
      roles: ["admin", "cashier", "employee"],
    },
    {
      path: "/sales",
      icon: Receipt,
      label: "المبيعات",
      roles: ["admin", "cashier", "employee"],
    },
    {
      path: "/expenses",
      icon: Wallet,
      label: "المصروفات",
      roles: ["admin", "employee"],
    },
    {
      path: "/shifts",
      icon: Calendar,
      label: "الورديات",
      roles: ["admin", "employee"],
    },
    {
      path: "/discounts",
      icon: Percent,
      label: "الخصومات",
      roles: ["admin", "cashier"],
    },
    {
      path: "/coupons",
      icon: Coins,
      label: "الكوبونات",
      roles: ["admin", "cashier"],
    },
    {
      path: "/reports",
      icon: BarChart,
      label: "التقارير",
      roles: ["admin", "employee"],
    },
    {
      path: "/messages",
      icon: MessageSquare,
      label: "الرسائل",
      roles: ["admin", "employee"],
    },
    {
      path: "/settings",
      icon: Settings,
      label: "الإعدادات",
      roles: ["admin"],
    },
    {
      path: "/logs",
      icon: ClipboardList,
      label: "سجل العمليات",
      roles: ["admin"],
    },
    {
      path: "/tasks",
      icon: KanbanSquare,
      label: "المهام",
      roles: ["admin", "employee"],
    },
    {
      path: "/archive",
      icon: Archive,
      label: "الأرشيف",
      roles: ["admin"],
    },
  ];

  const renderSidebarItems = () => {
    const userRole = user?.role || "employee";

    return sidebarItems.map((item, index) => {
      if (!item.roles.includes(userRole)) {
        return null;
      }

      const isActive = location.pathname === item.path;
      return (
        <li key={index}>
          <NavLink
            to={item.path}
            className={`flex items-center gap-2 p-2 rounded-md hover:bg-gray-100 transition-colors ${
              isActive ? "bg-gray-100 font-medium" : ""
            }`}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
            {item.label === "الطلبات" && unreadOrders > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {unreadOrders}
              </span>
            )}
          </NavLink>
        </li>
      );
    });
  };

  return (
    <div className="w-64 min-h-screen bg-white border-l border-gray-200 flex flex-col">
      <div className="p-4 flex items-center justify-between border-b border-gray-200">
        <span className="font-bold text-lg">اسم المتجر</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.username} alt={user?.name} />
                <AvatarFallback>
                  {authLoading ? (
                    <Skeleton className="h-8 w-8 rounded-full" />
                  ) : (
                    user?.name?.charAt(0) || "U"
                  )}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="dir-rtl">
            <DropdownMenuLabel>حسابي</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <CircleUserRound className="mr-2 h-4 w-4" />
              <span>الملف الشخصي</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              <span>الإعدادات</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} disabled={isClosing}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>
                تسجيل الخروج
                {isClosing && (
                  <span className="animate-pulse">
                    ...
                  </span>
                )}
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ul className="flex-1 p-4 space-y-1">{renderSidebarItems()}</ul>
    </div>
  );
};

export default Sidebar;


import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useNotificationStore } from "@/stores/notificationStore";
import { 
  BarChart4, Store, ShoppingCart, PackageOpen, Users, Settings, LogOut, FileText, 
  Receipt, Home, UserPlus, Banknote, Truck, CircleDollarSign, Building2, ImageIcon, 
  ShoppingBag, FolderOpen, MapPin, TrendingUp 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarLogo } from "./sidebar/SidebarLogo";
import { SidebarItem } from "./sidebar/SidebarItem";
import { Button } from "@/components/ui/button";

export default function Sidebar() {
  const {
    user,
    logout
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const [collapsed, setCollapsed] = useState(false);
  const {
    unreadOrders,
    markOrdersAsRead
  } = useNotificationStore();
  
  useEffect(() => {
    if (currentPath === "/online-orders") {
      markOrdersAsRead();
    }
  }, [currentPath, markOrdersAsRead]);
  
  const isAdmin = user?.role === 'admin';
  const isCashier = user?.role === 'cashier';
  
  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  
  const toggleSidebar = () => {
    setCollapsed(!collapsed);
  };
  
  return (
    <div className={cn("border-l bg-white h-screen overflow-y-auto flex flex-col transition-all duration-300", collapsed ? "w-20" : "w-64")}>
      <SidebarLogo collapsed={collapsed} toggleSidebar={toggleSidebar} />
      
      <div className="flex-1 space-y-1 px-0">
        <SidebarItem icon={Home} label="الرئيسية" href="/" active={currentPath === "/"} collapsed={collapsed} />
        
        <SidebarItem icon={ShoppingCart} label="نقطة البيع" href="/pos" active={currentPath === "/pos"} collapsed={collapsed} />
        
        <SidebarItem icon={FolderOpen} label="الاقسام" href="/categories" active={currentPath.startsWith("/categories")} collapsed={collapsed} />
        
        {/* Sales Dashboard Item at the top */}
        <SidebarItem 
          icon={TrendingUp} 
          label="لوحة المبيعات والخزينة" 
          href="/sales-dashboard" 
          active={currentPath === "/sales-dashboard"} 
          collapsed={collapsed} 
        />
        
        {isAdmin && <>
            <SidebarItem icon={Building2} label="الشركات" href="/companies" active={currentPath === "/companies"} collapsed={collapsed} />
            
            <SidebarItem icon={ImageIcon} label="البانرات" href="/banners" active={currentPath === "/banners"} collapsed={collapsed} />
            
            <SidebarItem icon={MapPin} label="مناطق التوصيل" href="/delivery-locations" active={currentPath === "/delivery-locations"} collapsed={collapsed} />
          </>}
        
        <SidebarItem icon={Truck} label="مشتريات الموردين" href="/supplier-purchases" active={currentPath === "/supplier-purchases"} collapsed={collapsed} />
        
        <SidebarItem icon={PackageOpen} label="المنتجات" href="/products" active={currentPath === "/products"} collapsed={collapsed} />
        
        <SidebarItem icon={ShoppingBag} label="الطلبات الإلكترونية" href="/online-orders" active={currentPath === "/online-orders"} badge={unreadOrders} collapsed={collapsed} />
        
        <SidebarItem icon={Receipt} label="الفواتير" href="/invoices" active={currentPath === "/invoices"} collapsed={collapsed} />
        
        <SidebarItem icon={BarChart4} label="التقارير والمالية" href="/reports" active={currentPath === "/reports" || currentPath === "/finance"} collapsed={collapsed} />
        
        <SidebarItem icon={Store} label="المخزون" href="/inventory" active={currentPath === "/inventory"} collapsed={collapsed} />
        
        <SidebarItem icon={UserPlus} label="العملاء والموردين" href="/suppliers-customers" active={currentPath === "/suppliers-customers"} collapsed={collapsed} />
        
        <SidebarItem icon={FileText} label="المصروفات" href="/expenses" active={currentPath === "/expenses"} collapsed={collapsed} />
        
        {isAdmin && <SidebarItem icon={Users} label="الموظفين" href="/employees" active={currentPath === "/employees"} collapsed={collapsed} />}
        
        <SidebarItem icon={Settings} label="الإعدادات" href="/settings" active={currentPath === "/settings"} collapsed={collapsed} />
      </div>
      
      <Button variant="outline" className={cn("m-4 gap-2 w-auto justify-start", collapsed && "p-2")} onClick={handleLogout}>
        <LogOut size={20} />
        {!collapsed && <span>تسجيل الخروج</span>}
      </Button>
    </div>
  );
}

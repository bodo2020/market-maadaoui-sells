
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  BarChart4,
  Store,
  ShoppingCart,
  PackageOpen,
  Users,
  Settings,
  LogOut,
  FileText,
  Receipt,
  Home,
  UserPlus,
  Banknote,
  Truck,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

interface SidebarItemProps {
  icon: JSX.Element;
  label: string;
  href: string;
  active?: boolean;
}

function SidebarItem({ icon, label, href, active }: SidebarItemProps) {
  return (
    <Link to={href}>
      <Button
        variant={active ? "default" : "ghost"}
        className={cn(
          "w-full justify-start gap-2 mb-1",
          active ? "bg-primary text-primary-foreground" : ""
        )}
      >
        {icon}
        <span>{label}</span>
      </Button>
    </Link>
  );
}

export default function Sidebar() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const currentPath = window.location.pathname;
  const [collapsed, setCollapsed] = useState(false);
  
  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  
  const toggleSidebar = () => {
    setCollapsed(!collapsed);
  };
  
  return (
    <div className={cn(
      "border-l bg-white h-screen overflow-y-auto flex flex-col transition-all duration-300",
      collapsed ? "w-20" : "w-64"
    )}>
      <div className="flex items-center justify-between p-4">
        {!collapsed && <h1 className="text-xl font-bold text-primary">{siteConfig.name}</h1>}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={toggleSidebar} 
          className="ml-auto"
        >
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </Button>
      </div>
      
      <div className="flex-1 space-y-1 px-4">
        <SidebarItem
          icon={<Home size={20} />}
          label={collapsed ? "" : "الرئيسية"}
          href="/"
          active={currentPath === "/"}
        />
        <SidebarItem
          icon={<ShoppingCart size={20} />}
          label={collapsed ? "" : "نقطة البيع"}
          href="/pos"
          active={currentPath === "/pos"}
        />
        <SidebarItem
          icon={<Truck size={20} />}
          label={collapsed ? "" : "مشتريات الموردين"}
          href="/supplier-purchases"
          active={currentPath === "/supplier-purchases"}
        />
        <SidebarItem
          icon={<PackageOpen size={20} />}
          label={collapsed ? "" : "المنتجات"}
          href="/products"
          active={currentPath === "/products"}
        />
        <SidebarItem
          icon={<Receipt size={20} />}
          label={collapsed ? "" : "الفواتير"}
          href="/invoices"
          active={currentPath === "/invoices"}
        />
        <SidebarItem
          icon={<BarChart4 size={20} />}
          label={collapsed ? "" : "التقارير"}
          href="/reports"
          active={currentPath === "/reports"}
        />
        <SidebarItem
          icon={<Store size={20} />}
          label={collapsed ? "" : "المخزون"}
          href="/inventory"
          active={currentPath === "/inventory"}
        />
        <SidebarItem
          icon={<UserPlus size={20} />}
          label={collapsed ? "" : "العملاء والموردين"}
          href="/suppliers-customers"
          active={currentPath === "/suppliers-customers"}
        />
        <SidebarItem
          icon={<Banknote size={20} />}
          label={collapsed ? "" : "المالية"}
          href="/finance"
          active={currentPath === "/finance"}
        />
        <SidebarItem
          icon={<FileText size={20} />}
          label={collapsed ? "" : "المصروفات"}
          href="/expenses"
          active={currentPath === "/expenses"}
        />
        <SidebarItem
          icon={<Users size={20} />}
          label={collapsed ? "" : "الموظفين"}
          href="/employees"
          active={currentPath === "/employees"}
        />
        <SidebarItem
          icon={<Settings size={20} />}
          label={collapsed ? "" : "الإعدادات"}
          href="/settings"
          active={currentPath === "/settings"}
        />
      </div>
      
      <Button 
        variant="outline" 
        className={cn(
          "m-4 gap-2 w-auto justify-start",
          collapsed && "p-2"
        )}
        onClick={handleLogout}
      >
        <LogOut size={20} />
        {!collapsed && <span>تسجيل الخروج</span>}
      </Button>
    </div>
  );
}

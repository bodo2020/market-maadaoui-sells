
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
  CalendarRange,
  Settings,
  LogOut,
  FileText,
  Receipt,
  Home,
  UserPlus,
  Banknote
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
  
  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  
  return (
    <div className="w-64 border-l bg-white h-screen overflow-y-auto p-4 flex flex-col">
      <div className="flex items-center justify-center mb-8 mt-4">
        <h1 className="text-xl font-bold text-primary">{siteConfig.name}</h1>
      </div>
      
      <div className="flex-1 space-y-1">
        <SidebarItem
          icon={<Home size={20} />}
          label="الرئيسية"
          href="/"
          active={currentPath === "/"}
        />
        <SidebarItem
          icon={<ShoppingCart size={20} />}
          label="نقطة البيع"
          href="/pos"
          active={currentPath === "/pos"}
        />
        <SidebarItem
          icon={<PackageOpen size={20} />}
          label="المنتجات"
          href="/products"
          active={currentPath === "/products"}
        />
        <SidebarItem
          icon={<Receipt size={20} />}
          label="الفواتير"
          href="/invoices"
          active={currentPath === "/invoices"}
        />
        <SidebarItem
          icon={<BarChart4 size={20} />}
          label="التقارير"
          href="/reports"
          active={currentPath === "/reports"}
        />
        <SidebarItem
          icon={<Store size={20} />}
          label="المخزون"
          href="/inventory"
          active={currentPath === "/inventory"}
        />
        <SidebarItem
          icon={<UserPlus size={20} />}
          label="العملاء والموردين"
          href="/suppliers-customers"
          active={currentPath === "/suppliers-customers"}
        />
        <SidebarItem
          icon={<Banknote size={20} />}
          label="المالية"
          href="/finance"
          active={currentPath === "/finance"}
        />
        <SidebarItem
          icon={<FileText size={20} />}
          label="المصروفات"
          href="/expenses"
          active={currentPath === "/expenses"}
        />
        <SidebarItem
          icon={<Users size={20} />}
          label="الموظفين"
          href="/employees"
          active={currentPath === "/employees"}
        />
        <SidebarItem
          icon={<CalendarRange size={20} />}
          label="الورديات"
          href="/shifts"
          active={currentPath === "/shifts"}
        />
        <SidebarItem
          icon={<Settings size={20} />}
          label="الإعدادات"
          href="/settings"
          active={currentPath === "/settings"}
        />
      </div>
      
      <Button 
        variant="outline" 
        className="mt-4 gap-2 w-full justify-start"
        onClick={handleLogout}
      >
        <LogOut size={20} />
        <span>تسجيل الخروج</span>
      </Button>
    </div>
  );
}


import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useNotificationStore } from "@/stores/notificationStore";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarLogo } from "./sidebar/SidebarLogo";
import { SidebarContent } from "./sidebar/SidebarContent";
import { Button } from "@/components/ui/button";

export default function Sidebar() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const { markOrdersAsRead } = useNotificationStore();
  
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
      <SidebarLogo collapsed={collapsed} toggleSidebar={toggleSidebar} />
      <SidebarContent collapsed={collapsed} />
      <Button 
        variant="outline" 
        className={cn("m-4 gap-2 w-auto justify-start", collapsed && "p-2")} 
        onClick={handleLogout}
      >
        <LogOut size={20} />
        {!collapsed && <span>تسجيل الخروج</span>}
      </Button>
    </div>
  );
}


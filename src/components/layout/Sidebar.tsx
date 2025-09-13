
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useNotificationStore } from "@/stores/notificationStore";
import { LogOut, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarLogo } from "./sidebar/SidebarLogo";
import { SidebarContent } from "./sidebar/SidebarContent";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetOverlay } from "@/components/ui/sheet";

interface SidebarProps {
  isMobile?: boolean;
  showMobileSidebar?: boolean;
  toggleMobileSidebar?: () => void;
}

export default function Sidebar({ 
  isMobile = false, 
  showMobileSidebar = false,
  toggleMobileSidebar
}: SidebarProps) {
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

  // Use Sheet component for mobile view
  if (isMobile) {
    return (
      <Sheet open={showMobileSidebar} onOpenChange={toggleMobileSidebar}>
        <SheetContent side="right" className="p-0 w-64">
          <div className="flex flex-col h-full bg-white">
            <div className="flex items-center justify-between p-4">
              <SidebarLogo collapsed={false} toggleSidebar={() => {}} />
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={toggleMobileSidebar}
                className="ml-auto"
              >
                <X size={20} />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SidebarContent collapsed={false} />
            </div>
            <Button 
              variant="outline" 
              className="m-4 gap-2 justify-start" 
              onClick={handleLogout}
            >
              <LogOut size={20} />
              <span>تسجيل الخروج</span>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }
  
  // Original desktop sidebar with vertical scrolling
  return (
    <div className={cn(
      "border-l bg-white h-full flex flex-col transition-all duration-300 fixed left-0 top-0 z-40 md:static md:z-auto",
      collapsed ? "w-20" : "w-64"
    )}>
      <SidebarLogo collapsed={collapsed} toggleSidebar={toggleSidebar} />
      <div className="flex-1 overflow-y-auto">
        <SidebarContent collapsed={collapsed} />
      </div>
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

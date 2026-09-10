import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { SidebarLogo } from "./sidebar/SidebarLogo";
import { SidebarContent } from "./sidebar/SidebarContent";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";

interface SidebarProps {
  isMobile?: boolean;
  showMobileSidebar?: boolean;
  toggleMobileSidebar?: () => void;
}

const SIDEBAR_COLLAPSED_KEY = "admin-sidebar-collapsed";

export default function Sidebar({
  isMobile = false,
  showMobileSidebar = false,
  toggleMobileSidebar,
}: SidebarProps) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  });

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const toggleSidebar = () => {
    setCollapsed((current) => {
      const next = !current;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      }
      return next;
    });
  };

  const closeMobileSidebar = () => {
    if (showMobileSidebar) toggleMobileSidebar?.();
  };

  if (isMobile) {
    return (
      <Sheet
        open={showMobileSidebar}
        onOpenChange={(open) => {
          if (open !== showMobileSidebar) toggleMobileSidebar?.();
        }}
      >
        <SheetContent
          side="right"
          className="w-[min(22rem,92vw)] overflow-hidden border-l border-emerald-950/10 bg-white p-0 shadow-2xl"
          dir="rtl"
        >
          <div className="relative flex h-full min-h-0 flex-col bg-gradient-to-b from-white via-white to-emerald-50/30">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={closeMobileSidebar}
              className="absolute left-3 top-3 z-20 h-9 w-9 rounded-xl border border-slate-200 bg-white/90 text-slate-500 shadow-sm backdrop-blur hover:bg-slate-100 hover:text-slate-800"
              aria-label="إغلاق القائمة"
            >
              <X className="h-4 w-4" />
            </Button>

            <SidebarLogo collapsed={false} toggleSidebar={() => undefined} showToggle={false} />
            <SidebarContent collapsed={false} onNavigate={closeMobileSidebar} />

            <div className="border-t border-slate-100 bg-white/90 p-3 backdrop-blur">
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-full justify-start rounded-xl border border-rose-100 bg-rose-50/60 px-3 font-bold text-rose-700 hover:bg-rose-100 hover:text-rose-800"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                <span>تسجيل الخروج</span>
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      className={cn(
        "relative hidden h-full shrink-0 flex-col overflow-hidden border-l border-emerald-950/10 bg-white/95 shadow-[0_0_30px_rgba(15,23,42,0.05)] backdrop-blur-xl transition-[width] duration-300 ease-out md:flex",
        collapsed ? "w-20" : "w-[292px]"
      )}
      dir="rtl"
      aria-label="القائمة الرئيسية"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-emerald-50/70 to-transparent" />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <SidebarLogo collapsed={collapsed} toggleSidebar={toggleSidebar} />
        <SidebarContent collapsed={collapsed} />
      </div>

      <div className="relative z-10 border-t border-slate-100 bg-white/90 p-3 backdrop-blur">
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-11 rounded-xl border border-transparent font-bold text-slate-500 transition-all hover:border-rose-100 hover:bg-rose-50 hover:text-rose-700",
            collapsed ? "w-full justify-center px-0" : "w-full justify-start px-3"
          )}
          onClick={handleLogout}
          aria-label="تسجيل الخروج"
          title={collapsed ? "تسجيل الخروج" : undefined}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100">
            <LogOut className="h-4 w-4" />
          </span>
          {!collapsed && <span>تسجيل الخروج</span>}
        </Button>
      </div>
    </aside>
  );
}

import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarLogoProps {
  collapsed: boolean;
  toggleSidebar: () => void;
  showToggle?: boolean;
}

export function SidebarLogo({ collapsed, toggleSidebar, showToggle = true }: SidebarLogoProps) {
  return (
    <div className={cn("border-b border-slate-100", collapsed ? "p-3" : "p-4")}>
      <div
        className={cn(
          "flex items-center rounded-2xl bg-gradient-to-l from-emerald-50 via-white to-white",
          collapsed ? "justify-center p-2" : "gap-3 border border-emerald-100/80 p-3 shadow-sm"
        )}
      >
        <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-sm">
          {siteConfig.logoUrl ? (
            <img src={siteConfig.logoUrl} alt={siteConfig.name} className="h-9 w-9 object-contain" />
          ) : (
            <span className="text-lg font-black text-[#005931]">م</span>
          )}
        </div>

        {!collapsed && (
          <div className="min-w-0 flex-1 text-right">
            <div className="truncate text-sm font-black text-slate-900">{siteConfig.name}</div>
            <div className="mt-0.5 flex items-center justify-start gap-1 text-[10px] font-bold text-[#005931]">
              <Sparkles className="h-3 w-3" />
              <span>لوحة الإدارة والتشغيل</span>
            </div>
          </div>
        )}

        {showToggle && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className={cn(
              "h-9 w-9 shrink-0 rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-emerald-200 hover:bg-emerald-50 hover:text-[#005931]",
              collapsed && "absolute mt-16"
            )}
            aria-label={collapsed ? "توسيع القائمة الجانبية" : "تصغير القائمة الجانبية"}
            title={collapsed ? "توسيع القائمة" : "تصغير القائمة"}
          >
            {collapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}

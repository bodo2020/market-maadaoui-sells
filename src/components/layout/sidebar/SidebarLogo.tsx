
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface SidebarLogoProps {
  collapsed: boolean;
  toggleSidebar: () => void;
}

export function SidebarLogo({ collapsed, toggleSidebar }: SidebarLogoProps) {
  return (
    <div className="flex items-center justify-between p-4">
      {!collapsed && (
        <>
          {siteConfig.logoUrl ? (
            <img 
              src={siteConfig.logoUrl} 
              alt={siteConfig.name} 
              className="h-12 object-contain" // Increased height from 8 to 12
            />
          ) : (
            <h1 className="text-2xl font-bold text-primary">{siteConfig.name}</h1> // Increased text size
          )}
        </>
      )}
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={toggleSidebar}
        className={collapsed ? "mx-auto" : "ml-auto"}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
      </Button>
    </div>
  );
}

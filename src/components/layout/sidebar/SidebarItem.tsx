
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useNotificationStore } from "@/stores/notificationStore";

interface SidebarItemProps {
  title: string;
  href: string;
  icon: LucideIcon;
  disabled?: boolean;
  label?: string;
  collapsed?: boolean;
}

export function SidebarItem({ 
  title, 
  href, 
  icon: Icon, 
  disabled, 
  label,
  collapsed
}: SidebarItemProps) {
  const location = useLocation();
  const { unreadOrders } = useNotificationStore();
  
  const isActive = location.pathname === href || 
                  (href !== '/' && location.pathname.startsWith(href));

  const showOrdersBadge = href === '/online-orders' && unreadOrders > 0;

  return (
    <Link
      to={disabled ? '#' : href}
      className={cn(
        "flex items-center group rounded-md px-3 py-2 text-sm transition-colors",
        isActive ? "bg-primary/10 text-primary font-medium" : "text-gray-600 hover:bg-muted",
        disabled && "opacity-50 cursor-not-allowed",
        "mx-2"
      )}
      onClick={(e) => {
        if (disabled) e.preventDefault();
      }}
    >
      <Icon className={cn("h-5 w-5 ml-1", collapsed ? "mx-auto" : "")} />
      
      {!collapsed && (
        <>
          <span className="flex-1 text-right">{title}</span>
          
          {showOrdersBadge && (
            <Badge 
              variant="destructive" 
              className="ml-auto"
            >
              {unreadOrders}
            </Badge>
          )}
          
          {label && (
            <Badge className="ml-auto">{label}</Badge>
          )}
        </>
      )}
      
      {collapsed && (showOrdersBadge || label) && (
        <Badge 
          variant={showOrdersBadge ? "destructive" : "default"} 
          className="absolute right-2 top-1 scale-75"
        >
          {showOrdersBadge ? unreadOrders : label}
        </Badge>
      )}
    </Link>
  );
}

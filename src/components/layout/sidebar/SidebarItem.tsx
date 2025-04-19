
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SidebarItemProps {
  icon: LucideIcon;
  label: string;
  href: string;
  active?: boolean;
  onClick?: () => void;
  badge?: number;
  collapsed?: boolean;
}

export function SidebarItem({ 
  icon: Icon,
  label, 
  href, 
  active, 
  onClick, 
  badge,
  collapsed 
}: SidebarItemProps) {
  const button = (
    <Link to={href} onClick={onClick}>
      <Button
        variant={active ? "default" : "ghost"}
        className={cn(
          "w-full justify-start gap-2 mb-1",
          active ? "bg-primary text-primary-foreground" : ""
        )}
      >
        <Icon size={20} />
        {!collapsed && <span>{label}</span>}
        {!collapsed && badge !== undefined && badge > 0 && (
          <span className="mr-auto w-5 h-5 flex items-center justify-center rounded-full bg-destructive text-white text-xs">
            {badge}
          </span>
        )}
      </Button>
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {button}
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>{label}</p>
          {badge !== undefined && badge > 0 && (
            <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-destructive text-white">
              {badge}
            </span>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
}

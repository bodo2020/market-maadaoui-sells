
import { Link } from "react-router-dom";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface SidebarItemProps {
  icon: LucideIcon;
  label: string;
  href: string;
  active?: boolean;
  collapsed?: boolean;
  badge?: number;
  secondaryBadge?: number;
}

export function SidebarItem({
  icon: Icon,
  label,
  href,
  active,
  collapsed,
  badge,
  secondaryBadge
}: SidebarItemProps) {
  const isExternalLink = href.startsWith('http');
  
  const sharedClassName = cn(
    "flex items-center gap-3 px-3 py-2 text-muted-foreground transition-colors",
    active && "bg-muted text-foreground font-medium",
    !active && "hover:bg-muted hover:text-foreground"
  );

  const iconElement = (
    <div className="relative">
      <Icon className="h-5 w-5" />
      {badge && badge > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs"
        >
          {badge > 99 ? '99+' : badge}
        </Badge>
      )}
    </div>
  );

  const labelElement = !collapsed && (
    <div className="flex-1 relative">
      <span>{label}</span>
      {secondaryBadge && secondaryBadge > 0 && (
        <Badge 
          variant="outline"
          className="ml-2 bg-blue-100 text-blue-700 border-blue-200 text-xs"
        >
          {secondaryBadge > 99 ? '99+' : secondaryBadge}
        </Badge>
      )}
    </div>
  );

  if (isExternalLink) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener"
        className={sharedClassName}
      >
        {iconElement}
        {labelElement}
      </a>
    );
  }

  return (
    <Link
      to={href}
      className={sharedClassName}
    >
      {iconElement}
      {labelElement}
    </Link>
  );
}

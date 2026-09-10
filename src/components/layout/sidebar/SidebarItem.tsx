import { Link } from "react-router-dom";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SidebarItemProps {
  icon: LucideIcon;
  label: string;
  href: string;
  active?: boolean;
  collapsed?: boolean;
  badge?: number;
  secondaryBadge?: number;
  onNavigate?: () => void;
}

export function SidebarItem({
  icon: Icon,
  label,
  href,
  active,
  collapsed,
  badge,
  secondaryBadge,
  onNavigate,
}: SidebarItemProps) {
  const isExternalLink = href.startsWith("http");
  const hasBadge = Boolean(badge && badge > 0);
  const hasSecondaryBadge = Boolean(secondaryBadge && secondaryBadge > 0);

  const sharedClassName = cn(
    "group relative flex min-h-11 items-center rounded-xl border px-3 text-sm font-semibold outline-none transition-all duration-200",
    collapsed ? "mx-2 justify-center px-2" : "mx-2 gap-3",
    active
      ? "border-[#005931]/10 bg-[#005931] text-white shadow-[0_8px_24px_rgba(0,89,49,0.18)]"
      : "border-transparent text-slate-600 hover:border-emerald-100 hover:bg-emerald-50/80 hover:text-[#005931]",
    "focus-visible:ring-2 focus-visible:ring-[#005931]/30 focus-visible:ring-offset-1"
  );

  const iconElement = (
    <span
      className={cn(
        "relative grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors",
        active
          ? "bg-white/14 text-white"
          : "bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-[#005931]"
      )}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
      {hasBadge && collapsed && (
        <span className="absolute -left-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black leading-none text-white ring-2 ring-white">
          {Number(badge) > 99 ? "99+" : badge}
        </span>
      )}
    </span>
  );

  const labelElement = !collapsed && (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-right">{label}</span>
      {hasSecondaryBadge && (
        <Badge
          variant="outline"
          className={cn(
            "h-5 shrink-0 border-0 px-1.5 text-[10px] font-black",
            active ? "bg-white/15 text-white" : "bg-sky-50 text-sky-700"
          )}
        >
          {Number(secondaryBadge) > 99 ? "99+" : secondaryBadge}
        </Badge>
      )}
      {hasBadge && (
        <Badge
          variant="destructive"
          className="h-5 min-w-5 shrink-0 justify-center border-0 px-1.5 text-[10px] font-black shadow-none"
        >
          {Number(badge) > 99 ? "99+" : badge}
        </Badge>
      )}
    </span>
  );

  const item = isExternalLink ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={sharedClassName}
      onClick={onNavigate}
      aria-label={label}
    >
      {iconElement}
      {labelElement}
    </a>
  ) : (
    <Link
      to={href}
      className={sharedClassName}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={label}
    >
      {iconElement}
      {labelElement}
    </Link>
  );

  if (!collapsed) return item;

  return (
    <Tooltip delayDuration={120}>
      <TooltipTrigger asChild>{item}</TooltipTrigger>
      <TooltipContent side="left" className="border-slate-200 bg-white font-bold text-slate-800 shadow-xl">
        {label}
        {(hasBadge || hasSecondaryBadge) && (
          <span className="mr-2 text-xs text-slate-500">
            {hasBadge ? `(${badge})` : ""} {hasSecondaryBadge ? `(${secondaryBadge})` : ""}
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

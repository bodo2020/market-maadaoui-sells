import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Bell, CalendarDays, CheckCircle2, ChevronDown, Clock3, FileText, Home, Network, Search, ShieldCheck, UserRound, UsersRound, WalletCards } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SidebarItem } from "./SidebarItem";
import { useNotificationStore } from "@/stores/notificationStore";

interface SidebarContentProps {
  collapsed: boolean;
  onNavigate?: () => void;
}

type Item = { label: string; href: string; icon: any };
type Group = { title: string; items: Item[] };

const groups: Group[] = [
  {
    title: "الرئيسية",
    items: [
      { label: "لوحة HR", href: "/", icon: Home },
      { label: "ملفي الوظيفي", href: "/my-hr", icon: UserRound },
    ],
  },
  {
    title: "الموظفون والتنظيم",
    items: [
      { label: "إدارة الموظفين", href: "/employees", icon: UsersRound },
      { label: "الهيكل التنظيمي", href: "/organization", icon: Network },
    ],
  },
  {
    title: "الوقت والعمل",
    items: [
      { label: "الحضور والانصراف", href: "/attendance", icon: Clock3 },
      { label: "جدولة الشيفتات", href: "/hr/shifts", icon: CalendarDays },
      { label: "الإجازات", href: "/hr/leave-calendar", icon: FileText },
    ],
  },
  {
    title: "الرواتب والتشغيل",
    items: [
      { label: "الرواتب", href: "/hr/payroll", icon: WalletCards },
      { label: "المهام", href: "/tasks", icon: CheckCircle2 },
      { label: "الموافقات", href: "/approvals", icon: ShieldCheck },
    ],
  },
  {
    title: "الحساب والتواصل",
    items: [
      { label: "الإشعارات", href: "/notifications", icon: Bell },
      { label: "حسابي", href: "/account", icon: UserRound },
    ],
  },
];

export function SidebarContent({ collapsed, onNavigate }: SidebarContentProps) {
  const location = useLocation();
  const currentPath = location.pathname;
  const { operationsTaskAlerts, operationsTaskOverdue, approvalAlerts } = useNotificationStore();
  const [search, setSearch] = useState("");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const query = search.trim().toLocaleLowerCase("ar");

  const isActive = (item: Item) => currentPath === item.href || (item.href !== "/" && currentPath.startsWith(`${item.href}/`));
  const toggleSection = (title: string) => setOpenSections((current) => ({ ...current, [title]: !(current[title] ?? true) }));

  const getBadge = (href: string) => {
    if (href === "/tasks") return operationsTaskAlerts || operationsTaskOverdue || undefined;
    if (href === "/approvals") return approvalAlerts || undefined;
    return undefined;
  };

  const renderSection = (group: Group, index: number) => {
    const visible = group.items.filter((item) => !query || `${item.label} ${group.title}`.toLocaleLowerCase("ar").includes(query));
    if (!visible.length) return null;
    const hasActive = visible.some(isActive);
    const isOpen = collapsed || Boolean(query) || hasActive || (openSections[group.title] ?? true);

    return (
      <section key={group.title} className={cn("relative", collapsed && index > 0 && "mt-2 border-t border-slate-100 pt-2")}>
        {!collapsed && (
          <button type="button" onClick={() => toggleSection(group.title)} className="group mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-right text-[11px] font-black text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700" aria-expanded={isOpen}>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70" />
            <span className="min-w-0 flex-1 truncate">{group.title}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500">{visible.length}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", isOpen ? "rotate-0" : "-rotate-90")} />
          </button>
        )}
        {isOpen && (
          <div className="space-y-1">
            {visible.map((item) => (
              <SidebarItem key={`${item.href}-${item.label}`} icon={item.icon} label={item.label} href={item.href} active={isActive(item)} collapsed={collapsed} badge={getBadge(item.href)} onNavigate={onNavigate} />
            ))}
          </div>
        )}
      </section>
    );
  };

  const hasSearchResults = groups.some((group) => group.items.some((item) => !query || `${item.label} ${group.title}`.toLocaleLowerCase("ar").includes(query)));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!collapsed && (
        <div className="px-3 pb-2 pt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث داخل HR..." className="h-10 rounded-xl border-slate-200 bg-slate-50/80 pr-10 text-sm font-medium shadow-none placeholder:text-slate-400 focus-visible:border-emerald-300 focus-visible:ring-[#005931]/15" aria-label="بحث في قائمة الموارد البشرية" />
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-4 pt-1 [scrollbar-color:rgb(203_213_225)_transparent] [scrollbar-width:thin]">
        <div className={cn("space-y-3", collapsed && "space-y-2 py-2")}>{groups.map(renderSection)}</div>
        {!collapsed && query && !hasSearchResults && (
          <div className="mx-3 mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
            <Search className="mx-auto mb-2 h-5 w-5 text-slate-300" />
            <p className="text-xs font-bold text-slate-500">لا توجد نتيجة مطابقة</p>
          </div>
        )}
      </div>
    </div>
  );
}

import { Link, useLocation } from "react-router-dom";
import { BellRing, CheckSquare2, ClipboardCheck, Clock3, Home, UserRound, UsersRound } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { getHrAccess } from "@/lib/hrAccess";

export default function HrMobileBottomNav() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const access = getHrAccess(user);

  const employeeItems = [
    { href: "/", label: "الرئيسية", icon: Home },
    { href: "/attendance", label: "الحضور", icon: Clock3 },
    { href: "/tasks", label: "المهام", icon: CheckSquare2 },
    { href: "/my-hr", label: "ملفي", icon: UserRound },
    { href: "/account", label: "حسابي", icon: UserRound },
  ];

  const managerItems = [
    { href: "/", label: "الرئيسية", icon: Home },
    { href: "/team", label: "فريقي", icon: UsersRound },
    { href: "/approvals", label: "الموافقات", icon: ClipboardCheck },
    { href: "/tasks", label: "المهام", icon: CheckSquare2 },
    { href: "/account", label: "حسابي", icon: UserRound },
  ];

  const hrItems = [
    { href: "/", label: "الرئيسية", icon: Home },
    { href: "/employees", label: "الموظفون", icon: UsersRound },
    { href: "/attendance", label: "الحضور", icon: Clock3 },
    { href: "/approvals", label: "الموافقات", icon: BellRing },
    { href: "/account", label: "حسابي", icon: UserRound },
  ];

  const items = access.canManagePeople ? hrItems : access.canViewTeam ? managerItems : employeeItems;

  return (
    <nav dir="rtl" className="hr-safe-bottom fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/90 bg-white/95 px-2 pt-1.5 shadow-[0_-10px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl md:hidden" aria-label="التنقل الرئيسي">
      <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
          return (
            <Link key={item.href} to={item.href} className={cn("flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[10px] font-black transition", active ? "bg-emerald-50 text-[#005931]" : "text-slate-500 active:bg-slate-100")}>
              <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

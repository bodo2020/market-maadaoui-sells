import { Bell, ChevronDown, Check, Menu, Settings, Store, UserRound, LogOut, BriefcaseBusiness, KeyRound, ReceiptText, LockKeyhole, Clock3, Repeat2, Vault, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { fetchNotificationCenterV2 } from "@/services/supabase/notificationCenterV2Service";

const pageTitles: Array<[string, string]> = [
  ["/pos", "نقطة البيع"], ["/reports", "التقارير والتحليلات"], ["/tasks", "مركز المهام"], ["/approvals", "مركز الموافقات"],
  ["/notifications", "مركز الإشعارات"], ["/online-orders", "الطلبات الإلكترونية"], ["/invoices", "الفواتير"], ["/products", "المنتجات"],
  ["/inventory", "إدارة المخزون"], ["/customers", "العملاء"], ["/finance", "المالية"], ["/payment-methods", "وسائل الدفع"],
  ["/cash-tracking", "تتبع النقدية"], ["/employees", "إدارة الموظفين"], ["/organization", "الهيكل التنظيمي"], ["/attendance", "الحضور والانصراف"],
  ["/my-hr", "بوابة الموظف"], ["/hr/payroll", "مسير الرواتب"], ["/hr/shifts", "جدولة الورديات"], ["/hr/leave-calendar", "تقويم الإجازات"],
  ["/account", "حسابي"], ["/settings", "الإعدادات"],
];

function resolveTitle(pathname: string) {
  if (pathname === "/") return "نقطة البيع";
  const exact = pageTitles.find(([path]) => pathname === path);
  if (exact) return exact[1];
  const parent = pageTitles.find(([path]) => path !== "/" && pathname.startsWith(`${path}/`));
  return parent?.[1] || "ماركت المعداوي";
}

function emitAction(name: string) {
  window.dispatchEvent(new CustomEvent(name));
}

export default function NavbarV2({ onMenuClick, isMobile = false }: { onMenuClick?: () => void; isMobile?: boolean }) {
  const { user, logout, branchOptions, switchBranch } = useAuth();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const location = useLocation();
  const navigate = useNavigate();
  const title = resolveTitle(location.pathname);
  const isPos = location.pathname === "/" || location.pathname === "/pos";
  const isTasks = location.pathname === "/tasks";
  const currentBranch = branchOptions.find(branch => branch.branch_id === currentBranchId);
  const roleLabel = currentBranch?.role_name_ar || (user?.role === "super_admin" ? "مدير النظام" : "موظف");

  const notificationQuery = useQuery({
    queryKey: ["notification-center-v2", currentBranchId, "navbar-v2"],
    enabled: Boolean(user?.id && currentBranchId),
    queryFn: () => fetchNotificationCenterV2(currentBranchId, "all", null, 1),
    refetchInterval: 60_000,
    retry: false,
  });
  const unread = notificationQuery.data?.summary.unread || 0;
  const actionRequired = notificationQuery.data?.summary.action_required || 0;

  const changeBranch = async (branchId: string) => {
    if (!branchId || branchId === currentBranchId) return;
    await switchBranch(branchId);
    window.location.reload();
  };

  return (
    <header dir="rtl" className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl">
      <div className="flex min-h-[68px] items-center gap-2 px-3 md:px-5">
        {isMobile && <Button variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-2xl" onClick={onMenuClick}><Menu className="h-5 w-5" /><span className="sr-only">القائمة</span></Button>}
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-black text-slate-950 md:text-lg">{title}</div>
          <div className="mt-0.5 hidden text-[11px] text-muted-foreground sm:block">{user?.name || "الموظف"} · {roleLabel}</div>
        </div>
        <div className="flex items-center gap-1.5 md:gap-2">
          {branchOptions.length > 1 ? <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" className="h-11 max-w-[180px] gap-2 rounded-2xl px-3"><Store className="h-4 w-4 shrink-0" /><span className="hidden truncate sm:inline">{currentBranchName || "اختر الفرع"}</span><ChevronDown className="h-4 w-4 shrink-0" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64" dir="rtl"><DropdownMenuLabel>فروع العمل</DropdownMenuLabel><DropdownMenuSeparator />{branchOptions.map(branch => <DropdownMenuItem key={branch.branch_id} onClick={() => void changeBranch(branch.branch_id)} className="gap-2"><Store className="h-4 w-4" /><div className="min-w-0 flex-1"><div className="truncate font-bold">{branch.branch_name}</div><div className="text-[11px] text-muted-foreground">{branch.role_name_ar}</div></div>{branch.branch_id === currentBranchId && <Check className="mr-auto h-4 w-4 text-[#005931]" />}</DropdownMenuItem>)}</DropdownMenuContent>
          </DropdownMenu> : currentBranchName ? <div className="hidden h-11 items-center gap-2 rounded-2xl border px-3 text-sm text-slate-600 md:flex"><Store className="h-4 w-4" /><span className="max-w-[150px] truncate">{currentBranchName}</span></div> : null}

          <Button variant="outline" size="icon" className="relative h-11 w-11 rounded-2xl" onClick={() => navigate("/notifications")} aria-label="الإشعارات"><Bell className="h-5 w-5" />{unread > 0 && <span className="absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">{unread > 99 ? "99+" : unread}</span>}</Button>
          {actionRequired > 0 && <Button variant="outline" className="hidden h-11 rounded-2xl border-amber-200 bg-amber-50 px-3 text-amber-800 lg:flex" onClick={() => navigate("/tasks")}><BriefcaseBusiness className="ml-2 h-4 w-4" />{actionRequired.toLocaleString("ar-EG")} إجراء</Button>}

          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" className="h-11 gap-2 rounded-2xl px-1.5 sm:px-2"><Avatar className="h-9 w-9"><AvatarFallback className="bg-[#005931] font-black text-white">{user?.name?.trim().charAt(0) || "م"}</AvatarFallback></Avatar><div className="hidden max-w-[130px] text-right lg:block"><div className="truncate text-xs font-black">{user?.name}</div><div className="truncate text-[10px] text-muted-foreground">{roleLabel}</div></div><ChevronDown className="hidden h-4 w-4 sm:block" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64" dir="rtl"><DropdownMenuLabel><div className="font-black">{user?.name}</div><div className="mt-1 text-[11px] font-normal text-muted-foreground">{roleLabel} · {currentBranchName || "بدون فرع"}</div></DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem onClick={() => navigate("/account")}><UserRound className="ml-2 h-4 w-4" />الملف الشخصي والحساب</DropdownMenuItem><DropdownMenuItem onClick={() => navigate("/account")}><KeyRound className="ml-2 h-4 w-4" />تغيير PIN</DropdownMenuItem><DropdownMenuItem onClick={() => navigate("/my-hr")}><BriefcaseBusiness className="ml-2 h-4 w-4" />بوابة الموظف</DropdownMenuItem><DropdownMenuItem onClick={() => navigate("/settings")}><Settings className="ml-2 h-4 w-4" />الإعدادات</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-red-700 focus:text-red-700" onClick={() => void logout()}><LogOut className="ml-2 h-4 w-4" />تسجيل الخروج</DropdownMenuItem></DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isPos && <div className="border-t border-slate-100 bg-slate-50/95 px-2 py-2 md:px-5">
        <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="hidden shrink-0 text-[11px] font-black text-slate-400 md:inline">تشغيل الكاشير</span>
          <Button size="sm" variant="outline" className="h-9 shrink-0 rounded-xl bg-white" onClick={() => emitAction("pos:open-invoices")}><ReceiptText className="ml-1.5 h-4 w-4" />الفواتير</Button>
          <Button size="sm" variant="outline" className="h-9 shrink-0 rounded-xl bg-white" onClick={() => emitAction("pos:open-shift")}><Clock3 className="ml-1.5 h-4 w-4" />الوردية</Button>
          <Button size="sm" variant="outline" className="h-9 shrink-0 rounded-xl bg-white" onClick={() => emitAction("pos:lock")}><LockKeyhole className="ml-1.5 h-4 w-4" />قفل</Button>
          <Button size="sm" variant="outline" className="h-9 shrink-0 rounded-xl border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-900" onClick={() => emitAction("pos:switch-employee")}><Repeat2 className="ml-1.5 h-4 w-4" />تبديل الموظف</Button>
          <div className="mr-auto hidden text-[11px] text-slate-400 md:block">ثابت حتى أثناء فتح السلة</div>
        </div>
      </div>}

      {isTasks && <div className="border-t border-slate-100 bg-slate-50/95 px-2 py-2 md:px-5">
        <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="hidden shrink-0 text-[11px] font-black text-slate-400 md:inline">إجراءات متخصصة</span>
          <Button size="sm" variant="outline" className="h-9 shrink-0 rounded-xl border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100" onClick={() => emitAction("tasks:open-treasury")}><Vault className="ml-1.5 h-4 w-4" />صرف من الخزن</Button>
          <Button size="sm" variant="outline" className="h-9 shrink-0 rounded-xl border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100" onClick={() => emitAction("tasks:open-hr-execution")}><ShieldCheck className="ml-1.5 h-4 w-4" />تنفيذ قرارات HR</Button>
        </div>
      </div>}

      {!isPos && !isTasks && actionRequired > 0 && <div className="flex items-center justify-between border-t border-amber-100 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 lg:hidden"><span>عندك {actionRequired.toLocaleString("ar-EG")} إجراء يحتاج متابعة</span><button className="font-black underline" onClick={() => navigate("/tasks")}>فتح المهام</button></div>}
    </header>
  );
}

import { Link, useLocation } from "react-router-dom";
import { BellRing, CalendarDays, CheckCircle2, Clock3, FileText, Landmark, Network, ShieldCheck, UserRound, UsersRound, WalletCards, AlertTriangle, ArrowLeft } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { getHrAccess } from "@/lib/hrAccess";

type Module = { href: string; title: string; description: string; icon: any; visible?: boolean };

const workspaceCopy = {
  employee: { title: "يومك الوظيفي", subtitle: "الحضور، المهام، الطلبات وبياناتك الوظيفية في مكان واحد." },
  team: { title: "قيادة الفريق", subtitle: "تابع فريقك، المهام، الحضور والطلبات التي تحتاج قرارك." },
  department: { title: "إدارة القسم", subtitle: "مساحة تشغيل القسم ومتابعة الموظفين والموافقات والأداء اليومي." },
  branch: { title: "إدارة موارد الفرع", subtitle: "صورة تشغيلية واضحة للموظفين والحضور والشيفتات والطلبات داخل الفرع." },
  hr: { title: "مركز الموارد البشرية", subtitle: "إدارة دورة حياة الموظف والهيكل والحضور والإجازات والرواتب من مساحة HR موحدة." },
  admin: { title: "HR Control Center", subtitle: "إدارة شاملة للموارد البشرية والصلاحيات ومسارات العمل على مستوى المنظومة." },
};

export default function HrDashboardPage() {
  const { user } = useAuth();
  const location = useLocation();
  const { currentBranchName } = useBranchStore();
  const { operationsTaskAlerts, operationsTaskOverdue, approvalAlerts } = useNotificationStore();
  const access = getHrAccess(user);
  const copy = workspaceCopy[access.level];
  const deniedPath = (location.state as { deniedPath?: string } | null)?.deniedPath;

  const modules: Module[] = [
    { href: "/my-hr", title: "ملفي الوظيفي", description: "بياناتك الوظيفية والشيفتات والإجازات والمستندات", icon: UserRound },
    { href: "/attendance", title: "الحضور والانصراف", description: "تسجيل ومراجعة حضورك مع سياسة الموقع والجهاز الموثوق", icon: Clock3 },
    { href: "/tasks", title: "المهام", description: "المهام المفتوحة والمتأخرة وما يحتاج تنفيذ اليوم", icon: CheckCircle2 },
    { href: "/team", title: "فريقي", description: "متابعة الفريق ومسارات الإدارة والموافقات", icon: UsersRound, visible: access.canViewTeam },
    { href: "/approvals", title: "الموافقات", description: "صندوق موحد للطلبات التي تحتاج قرارك", icon: ShieldCheck, visible: access.canApprove },
    { href: "/employees", title: "الموظفون", description: "Employee 360 وإدارة بيانات الموظفين والأجهزة", icon: UsersRound, visible: access.canManagePeople },
    { href: "/organization", title: "الهيكل التنظيمي", description: "الفروع والإدارات والأقسام والفرق والمناصب", icon: Network, visible: access.canManageOrganization },
    { href: "/hr/shifts", title: "جدولة الشيفتات", description: "توزيع الموظفين وخطط العمل ومراجعة التغطية", icon: CalendarDays, visible: access.canManageShifts },
    { href: "/hr/leave-calendar", title: "الإجازات", description: "تقويم الإجازات والطلبات والمتابعة", icon: FileText, visible: access.canManageLeave },
    { href: "/hr/payroll", title: "الرواتب", description: "دورات Payroll والمراجعة والاعتماد", icon: WalletCards, visible: access.canManagePayroll },
    { href: "/notifications", title: "الإشعارات", description: "كل ما يحتاج انتباهك داخل HR", icon: BellRing },
  ].filter(item => item.visible !== false);

  const scopeLabel = access.level === "employee" ? "بياناتي فقط" : access.level === "team" ? "فريقي" : access.level === "department" ? "قسمي" : access.level === "branch" ? "الفرع" : "الشركة";

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto w-full max-w-7xl space-y-5 py-4 md:space-y-6 md:py-6">
        {deniedPath && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div><div className="font-black">المسار غير متاح لصلاحيتك الحالية</div><p className="mt-1 text-xs leading-5 text-amber-800">تمت إعادتك لمساحة العمل المناسبة لحسابك بدل عرض بيانات خارج نطاقك.</p></div>
          </div>
        )}

        <section className="relative overflow-hidden rounded-3xl bg-[#005931] p-5 text-white shadow-lg md:p-8">
          <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_15%_10%,white_0,transparent_28%),radial-gradient(circle_at_85%_90%,#86efac_0,transparent_24%)]" />
          <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold ring-1 ring-white/15"><Landmark className="h-3.5 w-3.5" />المعداوي HR · {access.roleLabel}</div>
              <h1 className="text-2xl font-black md:text-4xl">{copy.title}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-emerald-50 md:text-base">{copy.subtitle}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-bold text-emerald-50">
                <span className="rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/10">النطاق: {scopeLabel}</span>
                <span className="rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/10">{currentBranchName || "فرع العمل"}</span>
              </div>
            </div>
            <Link to={access.canViewTeam ? "/team" : "/my-hr"} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 font-black text-[#005931] shadow-sm transition hover:bg-emerald-50">
              {access.canViewTeam ? <UsersRound className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
              {access.canViewTeam ? "فتح مساحة الفريق" : "فتح ملفي"}
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="rounded-2xl border-slate-200"><CardContent className="p-4"><div className="text-xs font-bold text-slate-500">مهام تحتاج متابعة</div><div className="mt-2 text-3xl font-black text-slate-950">{Number(operationsTaskAlerts || 0).toLocaleString("ar-EG")}</div></CardContent></Card>
          <Card className="rounded-2xl border-rose-100 bg-rose-50/40"><CardContent className="p-4"><div className="text-xs font-bold text-rose-700">مهام متأخرة</div><div className="mt-2 text-3xl font-black text-rose-900">{Number(operationsTaskOverdue || 0).toLocaleString("ar-EG")}</div></CardContent></Card>
          <Card className="rounded-2xl border-amber-100 bg-amber-50/40"><CardContent className="p-4"><div className="text-xs font-bold text-amber-700">موافقات معلقة</div><div className="mt-2 text-3xl font-black text-amber-900">{access.canApprove ? Number(approvalAlerts || 0).toLocaleString("ar-EG") : "—"}</div></CardContent></Card>
          <Card className="rounded-2xl border-emerald-100 bg-emerald-50/50"><CardContent className="p-4"><div className="text-xs font-bold text-emerald-700">مسار الصلاحية</div><div className="mt-2 text-lg font-black text-emerald-950">{scopeLabel}</div><div className="mt-1 text-[11px] text-emerald-700">{access.roleLabel}</div></CardContent></Card>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between"><div><h2 className="text-lg font-black text-slate-950">مساراتك داخل HR</h2><p className="mt-1 text-xs text-slate-500">تظهر لك فقط المساحات المناسبة لدورك الحالي.</p></div></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {modules.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} to={item.href} className="group block">
                  <Card className="h-full rounded-2xl border-slate-200/80 transition duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-950/5">
                    <CardHeader className="pb-3">
                      <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-[#005931] transition group-hover:bg-[#005931] group-hover:text-white"><Icon className="h-5 w-5" /></div>
                      <CardTitle className="text-base font-black">{item.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0"><p className="text-sm leading-6 text-slate-500">{item.description}</p></CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </MainLayout>
  );
}

import { Link } from "react-router-dom";
import { CalendarDays, CheckCircle2, Clock3, ShieldCheck, UsersRound, UserRound, ArrowLeft } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { getHrAccess } from "@/lib/hrAccess";

export default function HrTeamWorkspacePage() {
  const { user } = useAuth();
  const { currentBranchName } = useBranchStore();
  const access = getHrAccess(user);

  const actions = [
    { href: "/attendance", title: "حضور الفريق", description: "متابعة الحضور والاستثناءات حسب نطاق صلاحيتك.", icon: Clock3, visible: access.canManageAttendance || access.canViewTeam },
    { href: "/tasks", title: "مهام الفريق", description: "متابعة التنفيذ والمهام المتأخرة وتوزيع العمل.", icon: CheckCircle2, visible: true },
    { href: "/approvals", title: "طلبات تحتاج قرار", description: "إجازات وتصحيحات حضور وطلبات تمر عبرك.", icon: ShieldCheck, visible: access.canApprove },
    { href: "/hr/shifts", title: "جدولة الشيفتات", description: "خطط العمل والتغطية وتعارضات الشيفتات.", icon: CalendarDays, visible: access.canManageShifts },
    { href: "/employees", title: "دليل الموظفين", description: "إدارة ملفات الموظفين داخل نطاقك المصرح.", icon: UsersRound, visible: access.canManagePeople },
    { href: "/my-hr", title: "ملفي أنا", description: "الرجوع لبياناتك وطلباتك الشخصية.", icon: UserRound, visible: true },
  ].filter(item => item.visible);

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-6xl space-y-5 py-4 md:py-6">
        <section className="overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-l from-emerald-950 to-[#005931] p-5 text-white shadow-lg md:p-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-black ring-1 ring-white/10"><UsersRound className="h-4 w-4" />Manager Workspace</div>
              <h1 className="mt-4 text-2xl font-black md:text-3xl">مساحة الفريق</h1>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-emerald-50">مسار منفصل للمدير والمشرف: ما يحتاج قرارك ومتابعتك يظهر هنا، بينما بياناتك الشخصية تظل في «ملفي الوظيفي».</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm ring-1 ring-white/10"><div className="text-[11px] text-emerald-100">الدور والنطاق</div><div className="mt-1 font-black">{access.roleLabel} · {currentBranchName || "فرع العمل"}</div></div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {actions.map(item => {
            const Icon = item.icon;
            return (
              <Link key={item.href} to={item.href}>
                <Card className="h-full rounded-2xl transition hover:border-emerald-200 hover:shadow-md">
                  <CardHeader className="pb-3"><div className="mb-2 grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-[#005931]"><Icon className="h-5 w-5" /></div><CardTitle className="text-base font-black">{item.title}</CardTitle></CardHeader>
                  <CardContent className="pt-0"><p className="text-sm leading-6 text-slate-500">{item.description}</p><div className="mt-4 inline-flex items-center gap-1 text-xs font-black text-[#005931]">فتح المسار <ArrowLeft className="h-3.5 w-3.5" /></div></CardContent>
                </Card>
              </Link>
            );
          })}
        </section>

        <Card className="rounded-2xl border-slate-200 bg-slate-50/70">
          <CardContent className="p-5 text-sm leading-7 text-slate-600"><strong className="text-slate-900">قاعدة المسار:</strong> المدير يرى فقط النطاق الذي تسمح به صلاحياته الحالية. وجود زر أو رابط في الواجهة لا يمنح صلاحية إضافية؛ المسارات الحساسة محمية أيضًا عند فتح الرابط مباشرة.</CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}

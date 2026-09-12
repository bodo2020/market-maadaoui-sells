import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, Clock3, Loader2, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { getHrAccess } from "@/lib/hrAccess";
import { getHrWorkspaceDashboard } from "@/services/hrWorkspaceService";

const today = () => new Date().toISOString().slice(0, 10);
const scopeLabel: Record<string, string> = { own: "شخصي", team: "الفريق", department: "القسم", branch: "الفرع" };

export default function HrTeamWorkspacePage() {
  const { user } = useAuth();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const access = getHrAccess(user);
  const dashboardQuery = useQuery({
    queryKey: ["hr-manager-dashboard", currentBranchId, today()],
    enabled: Boolean(currentBranchId),
    queryFn: () => getHrWorkspaceDashboard(currentBranchId!, today()),
    refetchInterval: 60_000,
  });
  const data = dashboardQuery.data;
  const summary = data?.summary;

  const actions = [
    { href: "/attendance/control", title: "مراقبة الحضور", description: "حضور وغياب وتأخير واستثناءات ضمن نطاقك.", icon: Clock3, visible: access.canViewTeam },
    { href: "/tasks", title: "مهام الفريق", description: "متابعة التنفيذ والمهام المتأخرة وتوزيع العمل.", icon: CheckCircle2, visible: true },
    { href: "/approvals", title: "طلبات تحتاج قرار", description: "إجازات وتصحيحات حضور وطلبات تمر عبرك.", icon: ShieldCheck, visible: access.canApprove },
    { href: "/hr/shifts", title: "جدولة الشيفتات", description: "خطط العمل والتغطية وتعارضات الشيفتات.", icon: CalendarDays, visible: access.canManageShifts },
    { href: "/employees", title: "إدارة الموظفين", description: "Employee 360 والتعديلات المسموحة لمسؤولي HR.", icon: UsersRound, visible: access.canManagePeople },
    { href: "/my-hr", title: "ملفي أنا", description: "بياناتك وطلباتك وحضورك الشخصي.", icon: UserRound, visible: true },
  ].filter(item => item.visible);

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-7xl space-y-5 py-4 md:py-6">
        <section className="overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-l from-emerald-950 to-[#005931] p-5 text-white shadow-lg md:p-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div><div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-black ring-1 ring-white/10"><UsersRound className="h-4 w-4" />Manager Workspace</div><h1 className="mt-4 text-2xl font-black md:text-3xl">مساحة الفريق</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-emerald-50">ما يحتاج انتباهك اليوم يظهر هنا تلقائيًا. البيانات لا تتجاوز فريقك أو قسمك أو فرعك حسب الصلاحية الفعلية في Supabase.</p></div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm ring-1 ring-white/10"><div className="text-[11px] text-emerald-100">الدور والنطاق</div><div className="mt-1 font-black">{access.roleLabel} · {currentBranchName || "فرع العمل"}</div><div className="mt-1 text-[11px] text-emerald-100">Scope: {scopeLabel[data?.scope || access.level] || data?.scope || access.level}</div></div>
          </div>
        </section>

        {dashboardQuery.isLoading ? <div className="flex min-h-56 items-center justify-center"><Loader2 className="h-9 w-9 animate-spin text-[#005931]" /></div> : dashboardQuery.isError ? <Card className="border-red-200"><CardContent className="p-8 text-center"><AlertTriangle className="mx-auto h-8 w-8 text-red-600" /><div className="mt-3 font-black">تعذر تحميل لوحة الفريق</div><p className="mt-2 text-sm text-muted-foreground">راجع الفرع والصلاحيات ثم حاول مرة أخرى.</p><Button variant="outline" className="mt-4" onClick={() => dashboardQuery.refetch()}>إعادة المحاولة</Button></CardContent></Card> : <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            {[
              ["الموظفون", summary?.employees || 0, UsersRound], ["وردية اليوم", summary?.scheduled_today || 0, CalendarDays], ["حاضر", summary?.present || 0, CheckCircle2], ["متأخر", summary?.late || 0, Clock3],
              ["غائب", summary?.absent || 0, AlertTriangle], ["إجازة", summary?.on_leave || 0, CalendarDays], ["استثناءات", summary?.pending_exceptions || 0, ShieldCheck], ["مهام متأخرة", summary?.overdue_tasks || 0, AlertTriangle],
            ].map(([label, value, Icon]: any) => <Card key={label} className="rounded-2xl"><CardContent className="p-4"><Icon className="h-5 w-5 text-[#005931]" /><div className="mt-3 text-2xl font-black">{Number(value).toLocaleString("ar-EG")}</div><div className="mt-1 text-xs text-muted-foreground">{label}</div></CardContent></Card>)}
          </section>

          <Card className="rounded-2xl">
            <CardHeader><div className="flex items-center justify-between"><CardTitle className="text-base font-black">يحتاج متابعة اليوم</CardTitle><Button asChild size="sm" variant="outline"><Link to="/attendance/control">فتح مركز الحضور</Link></Button></div></CardHeader>
            <CardContent className="space-y-2">
              {(data?.attention || []).length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد حالات حرجة ضمن نطاقك حاليًا.</div> : data!.attention.slice(0, 10).map(row => <div key={row.id} className="flex flex-col gap-3 rounded-2xl border p-4 md:flex-row md:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Link to={`/team/employees/${row.id}`} className="font-black text-slate-950 hover:text-[#005931]">{row.name}</Link>{row.absent_now && <Badge variant="outline" className="border-red-200 bg-red-50 text-red-800">غائب</Badge>}{row.late_minutes > 0 && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">متأخر {row.late_minutes} د</Badge>}{row.pending_exceptions > 0 && <Badge variant="outline">{row.pending_exceptions} استثناء</Badge>}</div><div className="mt-1 text-xs text-muted-foreground">{row.job_title_name || "بدون مسمى"} · {row.department_name || "بدون قسم"}</div></div><div className="flex items-center gap-2"><div className={`rounded-xl px-3 py-2 text-xs ${row.overdue_tasks ? "bg-red-50 text-red-800" : "bg-slate-50"}`}>مهام متأخرة <strong>{row.overdue_tasks}</strong></div><Link to={`/team/employees/${row.id}`} className="inline-flex items-center gap-1 text-xs font-black text-[#005931]">عرض <ArrowLeft className="h-3.5 w-3.5" /></Link></div></div>)}
            </CardContent>
          </Card>
        </>}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {actions.map(item => {
            const Icon = item.icon;
            return <Link key={item.href} to={item.href}><Card className="h-full rounded-2xl transition hover:border-emerald-200 hover:shadow-md"><CardHeader className="pb-3"><div className="mb-2 grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-[#005931]"><Icon className="h-5 w-5" /></div><CardTitle className="text-base font-black">{item.title}</CardTitle></CardHeader><CardContent className="pt-0"><p className="text-sm leading-6 text-slate-500">{item.description}</p><div className="mt-4 inline-flex items-center gap-1 text-xs font-black text-[#005931]">فتح المسار <ArrowLeft className="h-3.5 w-3.5" /></div></CardContent></Card></Link>;
          })}
        </section>

        <Card className="rounded-2xl border-slate-200 bg-slate-50/70"><CardContent className="p-5 text-sm leading-7 text-slate-600"><strong className="text-slate-900">قاعدة المسار:</strong> مدير الفريق يرى Dashboard وEmployee Snapshot للمتابعة، أما تعديل الملف الوظيفي والراتب والصلاحيات فيظل داخل Employee 360 لمسؤول HR المخول فقط.</CardContent></Card>
      </div>
    </MainLayout>
  );
}

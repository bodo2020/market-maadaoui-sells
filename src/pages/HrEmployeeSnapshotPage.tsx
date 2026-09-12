import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, BriefcaseBusiness, Building2, CheckCircle2, Clock3, Loader2, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBranchStore } from "@/stores/branchStore";
import { getHrEmployeePerformanceDetail, getHrScopedEmployeeProfile } from "@/services/hrWorkspaceService";

function dateOnly(d: Date) { return d.toISOString().slice(0, 10); }
function pct(v?: number | null) { return v == null ? "—" : `${Number(v).toLocaleString("ar-EG", { maximumFractionDigits: 1 })}%`; }
function minutes(v?: number | null) {
  const value = Number(v || 0);
  const h = Math.floor(value / 60), m = value % 60;
  return h ? `${h.toLocaleString("ar-EG")}س ${m.toLocaleString("ar-EG")}د` : `${m.toLocaleString("ar-EG")}د`;
}

export default function HrEmployeeSnapshotPage() {
  const { employeeId = "" } = useParams();
  const { currentBranchId } = useBranchStore();
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 29);
  const fromDate = dateOnly(from), toDate = dateOnly(to);

  const profileQuery = useQuery({
    queryKey: ["hr-scoped-employee-profile", employeeId, currentBranchId],
    enabled: Boolean(employeeId && currentBranchId),
    queryFn: () => getHrScopedEmployeeProfile(employeeId, currentBranchId!),
  });
  const performanceQuery = useQuery({
    queryKey: ["hr-scoped-performance", employeeId, currentBranchId, fromDate, toDate],
    enabled: Boolean(employeeId && currentBranchId && profileQuery.data),
    queryFn: () => getHrEmployeePerformanceDetail(employeeId, currentBranchId!, fromDate, toDate),
  });

  if (profileQuery.isLoading) return <MainLayout><div className="flex min-h-[60dvh] items-center justify-center"><Loader2 className="h-9 w-9 animate-spin text-[#005931]" /></div></MainLayout>;
  if (profileQuery.isError || !profileQuery.data?.user) return <MainLayout><div dir="rtl" className="mx-auto max-w-xl py-16 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-slate-300" /><h1 className="mt-4 text-xl font-black">هذا الموظف خارج نطاقك الإداري</h1><p className="mt-2 text-sm text-muted-foreground">صلاحيات المدير لا تسمح بفتح موظف خارج الفريق أو القسم المحدد.</p><Button asChild variant="outline" className="mt-5"><Link to="/team">العودة لمساحة الفريق</Link></Button></div></MainLayout>;

  const p = profileQuery.data;
  const perf = performanceQuery.data;
  const attendance = perf?.attendance;
  const tasks = perf?.tasks;

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-6xl space-y-5 py-4 md:py-6">
        <div className="flex items-start gap-3">
          <Button asChild variant="ghost" size="icon"><Link to="/team"><ArrowRight className="h-5 w-5" /></Link></Button>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-2xl font-black md:text-3xl">{p.user.name}</h1><Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">عرض إداري</Badge></div><p className="mt-1 text-sm text-muted-foreground">{p.profile?.employee_code || "بدون كود"} · {p.job_title?.name_ar || "بدون مسمى"}</p></div>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="rounded-2xl"><CardContent className="flex items-center gap-3 p-5"><Building2 className="h-7 w-7 text-[#005931]" /><div><div className="font-black">{p.department?.name_ar || "—"}</div><div className="text-xs text-muted-foreground">القسم</div></div></CardContent></Card>
          <Card className="rounded-2xl"><CardContent className="flex items-center gap-3 p-5"><UsersRound className="h-7 w-7 text-[#005931]" /><div><div className="font-black">{p.team?.name_ar || "—"}</div><div className="text-xs text-muted-foreground">الفريق</div></div></CardContent></Card>
          <Card className="rounded-2xl"><CardContent className="flex items-center gap-3 p-5"><BriefcaseBusiness className="h-7 w-7 text-[#005931]" /><div><div className="font-black">{p.job_title?.name_ar || "—"}</div><div className="text-xs text-muted-foreground">المسمى الوظيفي</div></div></CardContent></Card>
          <Card className="rounded-2xl"><CardContent className="flex items-center gap-3 p-5"><UserRound className="h-7 w-7 text-[#005931]" /><div><div className="font-black">{p.manager?.name || "غير محدد"}</div><div className="text-xs text-muted-foreground">المدير المباشر</div></div></CardContent></Card>
        </section>

        <Card className="rounded-2xl border-emerald-100">
          <CardHeader><CardTitle className="text-base font-black">مؤشرات آخر 30 يومًا</CardTitle></CardHeader>
          <CardContent>
            {performanceQuery.isLoading ? <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#005931]" /></div> : performanceQuery.isError ? <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">تعذر تحميل مؤشرات الأداء.</div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl bg-emerald-50 p-4"><div className="flex items-center gap-2 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4" />نسبة الحضور</div><div className="mt-2 text-2xl font-black text-emerald-950">{pct(attendance?.attendance_rate)}</div><div className="mt-1 text-xs text-emerald-700">{attendance?.attended_scheduled_days || 0} من {attendance?.scheduled_days || 0} يوم مجدول</div></div>
              <div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><Clock3 className="h-4 w-4" />الالتزام بالمواعيد</div><div className="mt-2 text-2xl font-black">{pct(attendance?.punctuality_rate)}</div><div className="mt-1 text-xs text-muted-foreground">تأخير: {minutes(attendance?.late_minutes)}</div></div>
              <div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><CheckCircle2 className="h-4 w-4" />إنجاز المهام</div><div className="mt-2 text-2xl font-black">{pct(tasks?.completion_rate)}</div><div className="mt-1 text-xs text-muted-foreground">{tasks?.completed || 0} من {tasks?.assigned || 0} مهمة</div></div>
              <div className={`rounded-2xl p-4 ${(tasks?.overdue_open || 0) > 0 ? "bg-red-50" : "bg-slate-50"}`}><div className="text-xs text-muted-foreground">مهام متأخرة مفتوحة</div><div className={`mt-2 text-2xl font-black ${(tasks?.overdue_open || 0) > 0 ? "text-red-700" : ""}`}>{Number(tasks?.overdue_open || 0).toLocaleString("ar-EG")}</div><div className="mt-1 text-xs text-muted-foreground">SLA: {pct(tasks?.sla_rate)}</div></div>
            </div>}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="rounded-2xl"><CardHeader><CardTitle className="text-base font-black">الحالة الوظيفية</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"><span className="text-muted-foreground">الحالة</span><span className="font-black">{p.profile?.employment_status || "—"}</span></div><div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"><span className="text-muted-foreground">نمط العمل</span><span className="font-black">{p.profile?.work_mode || "—"}</span></div><div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"><span className="text-muted-foreground">نوع التعاقد</span><span className="font-black">{p.profile?.contract_type || "—"}</span></div></CardContent></Card>
          <Card className="rounded-2xl"><CardHeader><CardTitle className="text-base font-black">بيانات التواصل</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"><span className="text-muted-foreground">الهاتف</span><span className="font-black">{p.user.phone || "—"}</span></div><div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"><span className="text-muted-foreground">البريد</span><span className="font-black">{p.user.email || "—"}</span></div><div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"><span className="text-muted-foreground">اسم المستخدم</span><span className="font-black">{p.user.username}</span></div></CardContent></Card>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-600"><strong className="text-slate-900">مهم:</strong> هذه الصفحة للمتابعة فقط. المدير لا يستطيع تعديل الراتب أو البيانات الوظيفية الحساسة من هنا. التعديلات الكاملة تبقى داخل Employee 360 لمسؤولي HR المخولين.</div>
      </div>
    </MainLayout>
  );
}

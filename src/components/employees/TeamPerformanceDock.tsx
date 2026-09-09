import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ClipboardCheck, Clock3, ListChecks, PackageCheck, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getHrTeamPerformance } from "@/services/hrPerformanceService";
import { useBranchStore } from "@/stores/branchStore";

function localDate(value: Date) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function rangeFor(days: number) {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - (days - 1));
  return { from: localDate(from), to: localDate(to) };
}

export default function TeamPerformanceDock() {
  const { currentBranchId } = useBranchStore();
  const [days, setDays] = useState(30);
  const range = rangeFor(days);
  const query = useQuery({
    queryKey: ["hr-team-performance-v1", currentBranchId, days],
    enabled: Boolean(currentBranchId),
    queryFn: () => getHrTeamPerformance({ branchId: currentBranchId as string, ...range }),
  });

  if (!currentBranchId) return null;
  if (query.isError) return null;
  const data = query.data;
  if (!data && query.isLoading) return <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">جاري تجميع أداء الفريق...</CardContent></Card>;
  if (!data) return null;

  const rows = [...(data.employees_data || [])].sort((a, b) => {
    if (b.overdue_open_tasks !== a.overdue_open_tasks) return b.overdue_open_tasks - a.overdue_open_tasks;
    if (b.late_minutes !== a.late_minutes) return b.late_minutes - a.late_minutes;
    return a.name.localeCompare(b.name, "ar");
  }).slice(0, 12);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
        <div><CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-[#005931]" />متابعة أداء الفريق</CardTitle><CardDescription>مؤشرات تشغيلية للحضور والمهام والـSLA. الترتيب يبرز الحالات التي تحتاج متابعة، وليس تقييمًا شخصيًا نهائيًا.</CardDescription></div>
        <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="7">آخر 7 أيام</SelectItem><SelectItem value="30">آخر 30 يوم</SelectItem><SelectItem value="90">آخر 90 يوم</SelectItem></SelectContent></Select>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
          <div className="rounded-xl border bg-slate-50 p-3"><div className="text-xs text-muted-foreground">الموظفون</div><div className="mt-1 text-xl font-black">{data.summary.employees}</div></div>
          <div className="rounded-xl border bg-slate-50 p-3"><Clock3 className="h-4 w-4 text-[#005931]" /><div className="mt-1 text-xl font-black">{Number(data.summary.worked_hours).toLocaleString("ar-EG", { maximumFractionDigits: 1 })}</div><div className="text-xs text-muted-foreground">ساعات مسجلة</div></div>
          <div className="rounded-xl border bg-slate-50 p-3"><ListChecks className="h-4 w-4 text-[#005931]" /><div className="mt-1 text-xl font-black">{data.summary.completed_tasks}</div><div className="text-xs text-muted-foreground">مهام مكتملة</div></div>
          <div className={`rounded-xl border p-3 ${data.summary.overdue_open_tasks ? "border-red-200 bg-red-50" : "bg-slate-50"}`}><AlertTriangle className="h-4 w-4 text-red-600" /><div className="mt-1 text-xl font-black">{data.summary.overdue_open_tasks}</div><div className="text-xs text-muted-foreground">مهام متأخرة</div></div>
          <div className="rounded-xl border bg-slate-50 p-3"><Timer className="h-4 w-4 text-amber-600" /><div className="mt-1 text-xl font-black">{data.summary.late_minutes}</div><div className="text-xs text-muted-foreground">دقائق تأخير</div></div>
          <div className="rounded-xl border bg-slate-50 p-3"><PackageCheck className="h-4 w-4 text-[#005931]" /><div className="mt-1 text-xl font-black">{data.summary.inventory_tasks_completed}</div><div className="text-xs text-muted-foreground">مهام جرد</div></div>
          <div className="rounded-xl border bg-slate-50 p-3"><div className="text-xs text-muted-foreground">أيام حضور مسجلة</div><div className="mt-1 text-xl font-black">{data.summary.attendance_days}</div></div>
        </div>

        <div className="overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-muted-foreground"><tr><th className="p-3 text-right">الموظف</th><th className="p-3 text-center">ساعات</th><th className="p-3 text-center">تأخير</th><th className="p-3 text-center">مهام مكتملة</th><th className="p-3 text-center">متأخرة</th><th className="p-3 text-center">SLA</th><th className="p-3 text-center">جرد</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.user_id} className="border-t"><td className="p-3"><div className="font-bold">{row.name}</div><div className="text-xs text-muted-foreground">{row.job_title_name || row.department_name || row.employee_code || "—"}</div></td><td className="p-3 text-center">{Number(row.worked_hours).toLocaleString("ar-EG", { maximumFractionDigits: 1 })}</td><td className="p-3 text-center">{row.late_minutes ? <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">{row.late_minutes} د</Badge> : "—"}</td><td className="p-3 text-center font-semibold">{row.completed_tasks}</td><td className="p-3 text-center">{row.overdue_open_tasks ? <Badge variant="destructive">{row.overdue_open_tasks}</Badge> : "—"}</td><td className="p-3 text-center">{row.sla_on_time_pct == null ? "—" : `${row.sla_on_time_pct}%`}</td><td className="p-3 text-center">{row.inventory_tasks_completed}</td></tr>)}</tbody>
          </table>
        </div>
        {data.employees_data.length > rows.length && <div className="text-xs text-muted-foreground">يعرض أول {rows.length} موظف حسب الحالات التي تحتاج متابعة. ملف الموظف 360 يعرض التفاصيل الكاملة.</div>}
      </CardContent>
    </Card>
  );
}

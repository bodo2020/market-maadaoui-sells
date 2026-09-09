import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock3, Gauge, ListChecks, RefreshCw, TimerOff, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useBranchStore } from "@/stores/branchStore";
import { getHrEmployeePerformance } from "@/services/hrPerformanceService";

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const defaultFrom = () => { const d = new Date(); d.setDate(d.getDate() - 29); return isoDate(d); };
const defaultTo = () => isoDate(new Date());

const fmtHours = (v: number) => `${Number(v || 0).toLocaleString("ar-EG", { maximumFractionDigits: 1 })} س`;
const fmtMinutes = (v: number) => `${Number(v || 0).toLocaleString("ar-EG")} د`;

export default function EmployeePerformanceDock() {
  const { currentBranchId } = useBranchStore();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["hr-employee-performance-v1", currentBranchId, from, to],
    enabled: Boolean(currentBranchId && from && to && from <= to),
    queryFn: () => getHrEmployeePerformance({ branchId: currentBranchId as string, from, to }),
    refetchOnWindowFocus: true,
  });

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const data = query.data?.employees_data || [];
    if (!needle) return data;
    return data.filter((row) => [row.name, row.employee_code, row.department_name, row.job_title_name].some((value) => String(value || "").toLowerCase().includes(needle)));
  }, [query.data?.employees_data, search]);

  if (query.isError) return null;
  const s = query.data?.summary;

  return (
    <Card className="overflow-hidden border-[#005931]/15">
      <CardHeader className="border-b bg-gradient-to-l from-[#005931]/10 to-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5 text-[#005931]" />مؤشرات أداء الفريق</CardTitle>
            <CardDescription className="mt-1">مؤشرات تشغيلية قابلة للتفسير من الحضور والمهام والـSLA، بدون Score تقديري أو نسب غياب قبل اكتمال جدول الورديات.</CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div><div className="mb-1 text-[11px] text-muted-foreground">من</div><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[145px] bg-white" /></div>
            <div><div className="mb-1 text-[11px] text-muted-foreground">إلى</div><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[145px] bg-white" /></div>
            <Button size="sm" variant="outline" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-4 md:p-5">
        {query.isLoading ? <div className="py-8 text-center text-sm text-muted-foreground">جاري حساب مؤشرات الفريق...</div> : <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <Metric icon={UsersRound} label="الموظفون" value={s?.employees || 0} />
            <Metric icon={Clock3} label="أيام حضور مسجلة" value={s?.attendance_days || 0} />
            <Metric icon={Clock3} label="ساعات العمل" value={fmtHours(s?.worked_hours || 0)} />
            <Metric icon={TimerOff} label="دقائق التأخير" value={s?.late_minutes || 0} warn={Boolean(s?.late_minutes)} />
            <Metric icon={CheckCircle2} label="مهام مكتملة" value={s?.completed_tasks || 0} />
            <Metric icon={AlertTriangle} label="مهام متأخرة مفتوحة" value={s?.overdue_open_tasks || 0} warn={Boolean(s?.overdue_open_tasks)} />
            <Metric icon={ListChecks} label="مهام جرد مكتملة" value={s?.inventory_tasks_completed || 0} />
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="text-sm font-black">تفاصيل الموظفين</div>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم الموظف أو القسم أو المسمى" className="md:max-w-sm" />
          </div>

          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[1050px] text-sm">
              <thead className="bg-slate-50 text-xs text-muted-foreground"><tr>
                <th className="p-3 text-right">الموظف</th><th className="p-3 text-center">الحضور</th><th className="p-3 text-center">ساعات العمل</th><th className="p-3 text-center">التأخير</th><th className="p-3 text-center">الإجازات</th><th className="p-3 text-center">المهام المكتملة</th><th className="p-3 text-center">متأخرة الآن</th><th className="p-3 text-center">SLA في الموعد</th><th className="p-3 text-center">الجرد</th>
              </tr></thead>
              <tbody>{rows.map((row) => <tr key={row.user_id} className="border-t hover:bg-slate-50/70">
                <td className="p-3"><div className="font-bold">{row.name}</div><div className="mt-0.5 text-xs text-muted-foreground">{[row.job_title_name,row.department_name].filter(Boolean).join(" • ") || row.employee_code || "—"}</div></td>
                <td className="p-3 text-center font-semibold">{row.attendance_days.toLocaleString("ar-EG")}</td>
                <td className="p-3 text-center">{fmtHours(row.worked_hours)}</td>
                <td className="p-3 text-center"><span className={row.late_minutes ? "font-bold text-amber-700" : ""}>{fmtMinutes(row.late_minutes)}</span>{row.late_days > 0 && <div className="text-[11px] text-muted-foreground">{row.late_days.toLocaleString("ar-EG")} يوم</div>}</td>
                <td className="p-3 text-center">{row.approved_leave_days.toLocaleString("ar-EG")}</td>
                <td className="p-3 text-center font-semibold text-emerald-700">{row.completed_tasks.toLocaleString("ar-EG")}</td>
                <td className="p-3 text-center">{row.overdue_open_tasks ? <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">{row.overdue_open_tasks.toLocaleString("ar-EG")}</Badge> : "0"}</td>
                <td className="p-3 text-center">{row.sla_on_time_pct == null ? <span className="text-muted-foreground">لا بيانات</span> : <span className={row.sla_on_time_pct >= 90 ? "font-bold text-emerald-700" : row.sla_on_time_pct >= 70 ? "font-bold text-amber-700" : "font-bold text-red-700"}>{row.sla_on_time_pct.toLocaleString("ar-EG")}%</span>}</td>
                <td className="p-3 text-center">{row.inventory_tasks_completed.toLocaleString("ar-EG")}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-900">مهم: عدم وجود حضور أو ورديات كافية لا يتحول تلقائيًا إلى غياب أو تقييم سلبي. المؤشرات هنا تعرض فقط البيانات المسجلة فعلًا.</div>
        </>}
      </CardContent>
    </Card>
  );
}

function Metric({ icon: Icon, label, value, warn = false }: { icon: typeof UsersRound; label: string; value: string | number; warn?: boolean }) {
  return <div className={`rounded-xl border p-3 ${warn ? "border-amber-200 bg-amber-50" : "bg-white"}`}><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className={`h-4 w-4 ${warn ? "text-amber-700" : "text-[#005931]"}`} />{label}</div><div className={`mt-2 text-xl font-black ${warn ? "text-amber-800" : ""}`}>{typeof value === "number" ? value.toLocaleString("ar-EG") : value}</div></div>;
}

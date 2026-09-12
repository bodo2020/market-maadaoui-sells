import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarDays, Camera, CheckCircle2, Clock3, Filter, Loader2, ShieldAlert, Smartphone, UserRoundCheck, UsersRound } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import AttendanceExceptionReviewDialog from "@/components/hr/AttendanceExceptionReviewDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useBranchStore } from "@/stores/branchStore";
import { getHrAttendanceControl, HrAttendanceExceptionItem, HrWorkspaceEmployee } from "@/services/hrWorkspaceService";

const today = () => new Date().toISOString().slice(0, 10);
type FilterKey = "all" | "attention" | "present" | "late" | "absent" | "leave";

function statusLabel(row: HrWorkspaceEmployee) {
  if (row.on_leave) return { label: "إجازة", className: "border-sky-200 bg-sky-50 text-sky-800" };
  if (row.absent_now) return { label: "غياب", className: "border-red-200 bg-red-50 text-red-800" };
  if (row.checked_in && row.late_minutes > 0) return { label: `متأخر ${row.late_minutes} د`, className: "border-amber-200 bg-amber-50 text-amber-800" };
  if (row.checked_in && !row.checked_out) return { label: "حاضر الآن", className: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  if (row.checked_out) return { label: "أنهى الوردية", className: "border-slate-200 bg-slate-50 text-slate-700" };
  if (!row.scheduled_today) return { label: "لا توجد وردية", className: "border-slate-200 bg-slate-50 text-slate-500" };
  return { label: "بانتظار الحضور", className: "border-slate-200 bg-slate-50 text-slate-700" };
}

export default function HrAttendanceControlPage() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [date, setDate] = useState(today());
  const [filter, setFilter] = useState<FilterKey>("all");
  const [reviewItem, setReviewItem] = useState<HrAttendanceExceptionItem | null>(null);

  const query = useQuery({
    queryKey: ["hr-attendance-control", currentBranchId, date],
    enabled: Boolean(currentBranchId),
    queryFn: () => getHrAttendanceControl(currentBranchId!, date),
    refetchInterval: 60_000,
  });

  const rows = useMemo(() => {
    const all = query.data?.employees || [];
    if (filter === "attention") return all.filter(r => r.absent_now || r.late_minutes > 0 || r.pending_exceptions > 0 || r.overdue_tasks > 0);
    if (filter === "present") return all.filter(r => r.checked_in && !r.on_leave);
    if (filter === "late") return all.filter(r => r.late_minutes > 0);
    if (filter === "absent") return all.filter(r => r.absent_now);
    if (filter === "leave") return all.filter(r => r.on_leave);
    return all;
  }, [query.data, filter]);

  const s = query.data?.summary;
  const filters: Array<{ key: FilterKey; label: string }> = [
    { key: "all", label: "الكل" }, { key: "attention", label: "يحتاج متابعة" }, { key: "present", label: "حاضر" },
    { key: "late", label: "متأخر" }, { key: "absent", label: "غائب" }, { key: "leave", label: "إجازة" },
  ];

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-7xl space-y-5 py-4 md:py-6">
        <section className="rounded-3xl bg-gradient-to-l from-[#005931] to-emerald-800 p-5 text-white shadow-lg md:p-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div><div className="flex items-center gap-2"><UserRoundCheck className="h-6 w-6" /><h1 className="text-2xl font-black">مراقبة الحضور</h1></div><p className="mt-2 text-sm text-emerald-50">{currentBranchName || "فرع العمل"} · البيانات مفلترة تلقائيًا حسب نطاقك الإداري.</p></div>
            <div className="flex items-center gap-2 rounded-2xl bg-white/10 p-2 ring-1 ring-white/10"><CalendarDays className="mr-2 h-4 w-4" /><Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-10 border-white/20 bg-white text-slate-900" /></div>
          </div>
        </section>

        {query.isLoading ? <div className="flex min-h-80 items-center justify-center"><Loader2 className="h-9 w-9 animate-spin text-[#005931]" /></div> : query.isError ? (
          <Card className="border-red-200"><CardContent className="p-8 text-center"><AlertTriangle className="mx-auto h-8 w-8 text-red-600" /><div className="mt-3 font-black">تعذر تحميل مركز الحضور</div><p className="mt-2 text-sm text-muted-foreground">راجع صلاحياتك والفرع الحالي ثم حاول مرة أخرى.</p><Button variant="outline" className="mt-4" onClick={() => query.refetch()}>إعادة المحاولة</Button></CardContent></Card>
        ) : <>
          <section className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
            {[
              ["الموظفون", s?.employees || 0, UsersRound], ["وردية اليوم", s?.scheduled_today || 0, CalendarDays], ["حاضر", s?.present || 0, CheckCircle2], ["متأخر", s?.late || 0, Clock3],
              ["غائب", s?.absent || 0, ShieldAlert], ["إجازة", s?.on_leave || 0, CalendarDays], ["استثناءات", s?.pending_exceptions || 0, AlertTriangle], ["مهام متأخرة", s?.overdue_tasks || 0, AlertTriangle],
            ].map(([label, value, Icon]: any) => <Card key={label} className="rounded-2xl"><CardContent className="p-4"><Icon className="h-5 w-5 text-[#005931]" /><div className="mt-3 text-2xl font-black">{Number(value).toLocaleString("ar-EG")}</div><div className="mt-1 text-xs text-muted-foreground">{label}</div></CardContent></Card>)}
          </section>

          <Card className="rounded-2xl">
            <CardHeader className="pb-3"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><CardTitle className="flex items-center gap-2 text-base"><Filter className="h-4 w-4 text-[#005931]" />حالة الفريق</CardTitle><div className="flex gap-2 overflow-x-auto pb-1">{filters.map(item => <Button key={item.key} size="sm" variant={filter === item.key ? "default" : "outline"} className={filter === item.key ? "shrink-0 bg-[#005931] hover:bg-[#004526]" : "shrink-0"} onClick={() => setFilter(item.key)}>{item.label}</Button>)}</div></div></CardHeader>
            <CardContent className="space-y-2">
              {rows.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد نتائج ضمن الفلتر الحالي.</div> : rows.map(row => {
                const state = statusLabel(row);
                return <div key={row.id} className="flex flex-col gap-3 rounded-2xl border p-4 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Link to={`/team/employees/${row.id}`} className="font-black text-slate-950 hover:text-[#005931]">{row.name}</Link><Badge variant="outline" className={state.className}>{state.label}</Badge>{row.pending_exceptions > 0 && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">{row.pending_exceptions} استثناء</Badge>}</div><div className="mt-1 text-xs text-muted-foreground">{row.employee_code || "بدون كود"} · {row.job_title_name || "بدون مسمى"} · {row.department_name || "بدون قسم"}</div></div>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:flex"><div className="rounded-xl bg-slate-50 px-3 py-2"><span className="text-muted-foreground">مهام مفتوحة</span><div className="font-black">{row.open_tasks}</div></div><div className={`rounded-xl px-3 py-2 ${row.overdue_tasks ? "bg-red-50 text-red-800" : "bg-slate-50"}`}><span className="opacity-70">متأخرة</span><div className="font-black">{row.overdue_tasks}</div></div></div>
                </div>;
              })}
            </CardContent>
          </Card>

          {(query.data?.pending_exception_items?.length || 0) > 0 && <Card className="rounded-2xl border-amber-200"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-5 w-5 text-amber-600" />استثناءات حضور معلقة</CardTitle></CardHeader><CardContent className="space-y-3">{query.data!.pending_exception_items.slice(0, 12).map(item => <div key={item.id} className="rounded-2xl border border-amber-100 bg-amber-50 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div className="min-w-0"><div className="font-black text-amber-950">{item.employee_name}</div><div className="mt-1 text-xs text-amber-800">{item.reason}</div><div className="mt-2 flex flex-wrap gap-1.5">{item.verification_photo_path && <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-800"><Camera className="ml-1 h-3 w-3" />صورة Live</Badge>}{item.phone_verified_at && <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-800"><Smartphone className="ml-1 h-3 w-3" />الهاتف متحقق</Badge>}<Badge variant="outline" className="bg-white">{Math.round(Number(item.distance_m || 0)).toLocaleString("ar-EG")} م خارج النطاق</Badge></div></div><Button size="sm" className="shrink-0 bg-[#005931] hover:bg-[#004526]" onClick={() => setReviewItem(item)}>مراجعة الطلب</Button></div></div>)}</CardContent></Card>}
        </>}
      </div>
      <AttendanceExceptionReviewDialog item={reviewItem} open={Boolean(reviewItem)} onOpenChange={open => !open && setReviewItem(null)} onDone={() => query.refetch()} />
    </MainLayout>
  );
}

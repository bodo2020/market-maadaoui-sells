import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck2, ChevronLeft, ChevronRight, Loader2, RefreshCw, UsersRound } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBranchStore } from "@/stores/branchStore";
import { getHrLeaveCalendar, type HrLeaveCalendarItem } from "@/services/hrLeaveService";

const labels: Record<string, string> = { annual: "سنوية", casual: "عارضة", sick: "مرضية", unpaid: "بدون أجر", other: "أخرى" };
const partialLabels: Record<string, string> = { none: "يوم كامل", first_half: "النصف الأول", second_half: "النصف الثاني" };
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const monthRange = (date: Date) => ({ from: iso(new Date(date.getFullYear(), date.getMonth(), 1)), to: iso(new Date(date.getFullYear(), date.getMonth() + 1, 0)) });
const formatDay = (value: string) => new Intl.DateTimeFormat("ar-EG", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));

function daysBetween(from: string, to: string) {
  const start = new Date(`${from}T12:00:00`); const end = new Date(`${to}T12:00:00`); const values: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) values.push(iso(cursor));
  return values;
}

export default function HrLeaveCalendarPage() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [month, setMonth] = useState(() => new Date());
  const range = useMemo(() => monthRange(month), [month]);
  const query = useQuery({
    queryKey: ["hr-leave-calendar-v1", currentBranchId, range.from, range.to],
    enabled: Boolean(currentBranchId),
    queryFn: () => getHrLeaveCalendar(currentBranchId as string, range.from, range.to),
    staleTime: 30_000,
  });
  const items = query.data?.items || [];
  const days = useMemo(() => daysBetween(range.from, range.to), [range]);
  const byDay = useMemo(() => {
    const map = new Map<string, HrLeaveCalendarItem[]>();
    for (const day of days) map.set(day, []);
    for (const item of items) {
      for (const day of days) if (day >= item.start_date && day <= item.end_date) map.get(day)?.push(item);
    }
    return map;
  }, [days, items]);
  const uniqueEmployees = new Set(items.map(item => item.employee_id)).size;
  const leaveDays = days.filter(day => (byDay.get(day)?.length || 0) > 0).length;
  const today = iso(new Date());

  const move = (delta: number) => setMonth(current => new Date(current.getFullYear(), current.getMonth() + delta, 1));

  return <MainLayout><div dir="rtl" className="mx-auto max-w-7xl space-y-5 py-5">
    <section className="rounded-3xl border bg-white p-5 shadow-sm md:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><div className="flex items-center gap-2"><CalendarCheck2 className="h-6 w-6 text-[#005931]" /><h1 className="text-2xl font-black">تقويم إجازات الموظفين</h1></div><p className="mt-2 text-sm text-muted-foreground">{currentBranchName || "الفرع الحالي"} · الإجازات المعتمدة فقط، ومصدرها HR Requests.</p></div>
        <div className="flex items-center gap-2"><Button size="icon" variant="outline" onClick={() => move(-1)}><ChevronRight className="h-4 w-4" /></Button><div className="min-w-40 text-center font-black">{new Intl.DateTimeFormat("ar-EG", { month: "long", year: "numeric" }).format(month)}</div><Button size="icon" variant="outline" onClick={() => move(1)}><ChevronLeft className="h-4 w-4" /></Button><Button size="icon" variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /></Button></div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs text-muted-foreground">إجازات معتمدة</div><div className="mt-1 text-2xl font-black">{items.length.toLocaleString("ar-EG")}</div></div><div className="rounded-2xl bg-violet-50 p-4"><div className="text-xs text-violet-700">موظفون</div><div className="mt-1 text-2xl font-black text-violet-950">{uniqueEmployees.toLocaleString("ar-EG")}</div></div><div className="rounded-2xl bg-emerald-50 p-4"><div className="text-xs text-emerald-700">أيام بها إجازات</div><div className="mt-1 text-2xl font-black text-emerald-950">{leaveDays.toLocaleString("ar-EG")}</div></div></div>
    </section>

    {query.isLoading ? <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#005931]" /></div> : query.isError ? <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-800">{query.error instanceof Error ? query.error.message : "تعذر تحميل تقويم الإجازات."}</div> : <Card><CardHeader><CardTitle className="flex items-center gap-2"><UsersRound className="h-5 w-5 text-[#005931]" />الشهر الحالي</CardTitle></CardHeader><CardContent><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">{days.map(day => { const rows = byDay.get(day) || []; return <div key={day} className={`min-h-32 rounded-2xl border p-3 ${day === today ? "border-[#005931] bg-emerald-50/40" : "bg-white"}`}><div className="flex items-center justify-between"><div className="text-sm font-black">{formatDay(day)}</div>{day === today && <Badge className="bg-[#005931]">اليوم</Badge>}</div><div className="mt-3 space-y-2">{rows.length === 0 ? <div className="text-xs text-muted-foreground">—</div> : rows.map(item => <div key={`${day}-${item.id}`} className="rounded-xl bg-violet-50 p-2 text-xs text-violet-950"><div className="font-black">{item.employee_name}</div><div className="mt-1 text-violet-700">{labels[item.leave_type] || item.leave_type} · {partialLabels[item.partial_day] || item.partial_day}</div></div>)}</div></div>; })}</div></CardContent></Card>}
  </div></MainLayout>;
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarCheck2, CheckCircle2, ClipboardCheck, Clock3, Gauge, ListChecks, PackageCheck, Timer, UserX } from "lucide-react";
import CashierPerformancePanel from "@/components/employees/CashierPerformancePanel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getHrEmployeePerformanceDetail } from "@/services/hrPerformanceService";

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

function pct(value: number | null) {
  return value == null ? "—" : `${Number(value).toLocaleString("ar-EG", { maximumFractionDigits: 1 })}%`;
}

function hours(minutes: number) {
  return (Number(minutes || 0) / 60).toLocaleString("ar-EG", { maximumFractionDigits: 1 });
}

export default function EmployeePerformancePanel({ employeeId, branchId }: { employeeId: string; branchId: string | null }) {
  const [days, setDays] = useState(30);
  const range = rangeFor(days);
  const query = useQuery({
    queryKey: ["hr-employee-performance-detail-v1", employeeId, branchId, days],
    enabled: Boolean(employeeId && branchId),
    queryFn: () => getHrEmployeePerformanceDetail({ employeeId, branchId: branchId as string, ...range }),
  });

  if (!branchId) return <Card><CardContent className="p-6 text-sm text-muted-foreground">اختر فرعًا لعرض مؤشرات الأداء.</CardContent></Card>;
  if (query.isLoading) return <Card><CardContent className="p-8 text-center text-muted-foreground">جاري تجميع مؤشرات الأداء من الحضور والورديات والمهام...</CardContent></Card>;
  if (query.isError || !query.data) return <Card className="border-red-200"><CardContent className="p-6 text-red-700">{query.error instanceof Error ? query.error.message : "تعذر تحميل مؤشرات الأداء."}</CardContent></Card>;

  const p = query.data;
  const hasSchedule = p.attendance.scheduled_days > 0;
  const cards = [
    { label: "نسبة الحضور", value: pct(p.attendance.attendance_rate), suffix: "", icon: CalendarCheck2 },
    { label: "غياب فعلي", value: hasSchedule ? Number(p.attendance.absence_days).toLocaleString("ar-EG") : "—", suffix: hasSchedule ? " يوم" : "", icon: UserX },
    { label: "ساعات العمل المسجلة", value: hours(p.attendance.worked_minutes), suffix: " ساعة", icon: Clock3 },
    { label: "الالتزام بموعد الحضور", value: pct(p.attendance.punctuality_rate), suffix: "", icon: Gauge },
    { label: "إنجاز المهام", value: pct(p.tasks.completion_rate), suffix: "", icon: ListChecks },
    { label: "الالتزام بالـ SLA", value: pct(p.tasks.sla_rate), suffix: "", icon: Timer },
    { label: "دقة مهام الجرد", value: pct(p.inventory.count_accuracy_rate), suffix: "", icon: PackageCheck },
    { label: "مهام متأخرة مفتوحة", value: Number(p.tasks.overdue_open).toLocaleString("ar-EG"), suffix: "", icon: AlertTriangle },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
          <div><CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-[#005931]" />الأداء والالتزام</CardTitle><CardDescription>مؤشرات تشغيلية قابلة للتفسير من الجدول الفعلي والحضور والمهام، بدون درجة Productivity مصطنعة.</CardDescription></div>
          <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="7">آخر 7 أيام</SelectItem><SelectItem value="30">آخر 30 يوم</SelectItem><SelectItem value="90">آخر 90 يوم</SelectItem></SelectContent></Select>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => <div key={card.label} className="rounded-2xl border bg-slate-50/60 p-4"><card.icon className="h-5 w-5 text-[#005931]" /><div className="mt-3 text-2xl font-black">{card.value}{card.suffix}</div><div className="mt-1 text-xs text-muted-foreground">{card.label}</div></div>)}
          </div>

          {!hasSchedule && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">لا توجد وردية مسندة لهذا الموظف خلال الفترة، لذلك النظام لا يعرض غيابًا أو نسبة حضور افتراضية. إسناد جدول ورديات هو شرط حساب الغياب الحقيقي.</div>}

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border p-4"><div className="font-black">الحضور والجدول</div><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><span className="text-muted-foreground">أيام مجدولة:</span> {p.attendance.scheduled_days}</div><div><span className="text-muted-foreground">حضور مجدول:</span> {p.attendance.attended_scheduled_days}</div><div><span className="text-muted-foreground">إجازة معتمدة:</span> {p.attendance.approved_leave_days}</div><div><span className="text-muted-foreground">غياب:</span> {hasSchedule ? p.attendance.absence_days : "—"}</div><div><span className="text-muted-foreground">جلسات فعلية:</span> {p.attendance.sessions}</div><div><span className="text-muted-foreground">في الموعد:</span> {p.attendance.on_time_sessions}</div><div><span className="text-muted-foreground">تأخير:</span> {p.attendance.late_sessions}</div><div><span className="text-muted-foreground">دقائق التأخير:</span> {p.attendance.late_minutes}</div><div><span className="text-muted-foreground">خروج مبكر:</span> {p.attendance.early_departure_sessions}</div><div><span className="text-muted-foreground">دقائقه:</span> {p.attendance.early_departure_minutes}</div></div></div>
            <div className="rounded-2xl border p-4"><div className="font-black">المهام والـSLA</div><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><span className="text-muted-foreground">مسندة:</span> {p.tasks.assigned}</div><div><span className="text-muted-foreground">مكتملة:</span> {p.tasks.completed}</div><div><span className="text-muted-foreground">داخل SLA:</span> {p.tasks.sla_met}</div><div><span className="text-muted-foreground">متأخرة بعد الإكمال:</span> {p.tasks.completed_late}</div><div><span className="text-muted-foreground">متأخرة مفتوحة:</span> {p.tasks.overdue_open}</div><div><span className="text-muted-foreground">نسبة الإكمال:</span> {pct(p.tasks.completion_rate)}</div><div className="col-span-2"><span className="text-muted-foreground">متوسط زمن الإكمال:</span> {Number(p.tasks.avg_completion_minutes).toLocaleString("ar-EG", { maximumFractionDigits: 1 })} دقيقة</div></div></div>
            <div className="rounded-2xl border p-4"><div className="font-black">الجرد</div><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><span className="text-muted-foreground">عمليات عد:</span> {p.inventory.counts_completed}</div><div><span className="text-muted-foreground">مطابق:</span> {p.inventory.matched}</div><div><span className="text-muted-foreground">بفروق:</span> {p.inventory.with_variance}</div><div><span className="text-muted-foreground">إعادة عد:</span> {p.inventory.recounts_completed}</div></div></div>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 text-sm leading-6 text-blue-950"><div className="flex items-center gap-2 font-black"><CheckCircle2 className="h-4 w-4" />تفسير المؤشرات</div><p className="mt-1">الغياب يُحتسب فقط من يوم وردية مسند فعليًا، بدون Check-in وبدون إجازة كاملة معتمدة. لو لا يوجد Schedule، لا نفترض غيابًا.</p><p className="mt-1">دقة الجرد = نسبة مهام العد التي طابقت الرصيد المتوقع. اكتشاف فرق حقيقي قد يكون دليلًا على جودة المراجعة، لذلك لا يُستخدم الرقم وحده للحكم على الموظف.</p></div>
        </CardContent>
      </Card>

      <CashierPerformancePanel employeeId={employeeId} branchId={branchId} />
    </div>
  );
}

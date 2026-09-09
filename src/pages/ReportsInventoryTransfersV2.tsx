import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfDay, startOfMonth, subDays } from "date-fns";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Clock3, RefreshCcw, Route, ShieldCheck, Truck } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import ReportsSectionNav from "@/components/reports/ReportsSectionNav";
import BrandLoader from "@/components/ui/BrandLoader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { siteConfig } from "@/config/site";
import { useBranchStore } from "@/stores/branchStore";
import { fetchReportingInventoryTransfersV2 } from "@/services/supabase/reportingInventoryTransfersV2Service";

type PeriodPreset = "today" | "7d" | "30d" | "month";

const number = (value: number | null | undefined) => Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 3 });
const money = (value: number | null | undefined) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${siteConfig.currency}`;
const percent = (value: number | null | undefined) => `${Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })}%`;

const rangeFor = (preset: PeriodPreset) => {
  const now = new Date();
  if (preset === "today") return { from: startOfDay(now), to: now, label: "اليوم" };
  if (preset === "7d") return { from: startOfDay(subDays(now, 6)), to: now, label: "آخر 7 أيام" };
  if (preset === "month") return { from: startOfMonth(now), to: now, label: "هذا الشهر" };
  return { from: startOfDay(subDays(now, 29)), to: now, label: "آخر 30 يوم" };
};

function Metric({ title, value, hint, icon }: { title: string; value: string; hint: string; icon: React.ReactNode }) {
  return <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-muted-foreground">{title}</p><p className="mt-2 text-2xl font-black">{value}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p></div><div className="rounded-2xl bg-primary/10 p-3 text-primary">{icon}</div></div></CardContent></Card>;
}

function statusLabel(status: string) {
  if (status === "requested") return "بانتظار التجهيز";
  if (status === "dispatched") return "في الطريق";
  if (status === "received") return "مستلم ومطابق";
  if (status === "received_with_variance") return "مستلم بفرق";
  if (status === "cancelled") return "ملغي";
  return status;
}

export default function ReportsInventoryTransfersV2() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [period, setPeriod] = useState<PeriodPreset>("30d");
  const range = useMemo(() => rangeFor(period), [period]);

  const query = useQuery({
    queryKey: ["reporting-inventory-transfers-v2", currentBranchId, period],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchReportingInventoryTransfersV2(currentBranchId!, range.from, range.to),
    staleTime: 30_000,
  });

  if (!currentBranchId) return <MainLayout><div className="mx-auto mt-16 max-w-xl"><Alert><AlertDescription>اختر فرعًا أولًا لعرض تقرير التحويلات.</AlertDescription></Alert></div></MainLayout>;

  const summary = query.data?.summary;
  const canProfit = Boolean(query.data?.permissions.can_view_profit);

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto w-full max-w-[1600px] space-y-5 py-5">
        <ReportsSectionNav />
        <section className="rounded-3xl border bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap gap-2"><Badge variant="secondary">Transfers V2</Badge><Badge variant="outline">{currentBranchName || "الفرع الحالي"}</Badge></div>
              <h1 className="text-2xl font-black md:text-3xl">تحويلات المخزون والبضاعة في الطريق</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">يفصل بين الرصيد الموجود فعليًا في الفرع والبضاعة التي خرجت من المصدر ولم تصل بعد، ويقيس فروق الاستلام وزمن النقل من Transfer V2 نفسه.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={period} onValueChange={(value) => setPeriod(value as PeriodPreset)}><SelectTrigger className="min-w-[170px] rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="today">اليوم</SelectItem><SelectItem value="7d">آخر 7 أيام</SelectItem><SelectItem value="30d">آخر 30 يوم</SelectItem><SelectItem value="month">هذا الشهر</SelectItem></SelectContent></Select>
              <Button variant="outline" className="rounded-xl" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCcw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث</Button>
            </div>
          </div>
        </section>

        {query.isLoading ? <div className="flex min-h-[420px] items-center justify-center"><BrandLoader size="lg" /></div> : query.isError || !summary ? (
          <Alert variant="destructive"><AlertDescription>تعذر تحميل تقرير تحويلات المخزون.</AlertDescription></Alert>
        ) : <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Metric title="وارد في الطريق" value={number(summary.in_transit_incoming_measure)} hint={`${number(summary.in_transit_incoming)} تحويل${canProfit ? ` • ${money(summary.in_transit_incoming_cost)}` : ""}`} icon={<ArrowDownLeft className="h-5 w-5" />} />
            <Metric title="صادر في الطريق" value={number(summary.in_transit_outgoing_measure)} hint={`${number(summary.in_transit_outgoing)} تحويل${canProfit ? ` • ${money(summary.in_transit_outgoing_cost)}` : ""}`} icon={<ArrowUpRight className="h-5 w-5" />} />
            <Metric title="تم استلامها" value={number(summary.received_in_period)} hint={`${number(summary.received_measure_in_period)} وحدة قياس • ${range.label}`} icon={<Truck className="h-5 w-5" />} />
            <Metric title="نسبة فروق الاستلام" value={percent(summary.variance_rate_percent)} hint={`${number(summary.received_with_variance_in_period)} تحويل بفرق • ${number(summary.absolute_variance_measure_in_period)} فرق مطلق`} icon={<AlertTriangle className="h-5 w-5" />} />
            <Metric title="متوسط زمن النقل" value={summary.average_transit_hours == null ? "—" : `${number(summary.average_transit_hours)} ساعة`} hint={`${number(summary.overdue_transfer_tasks)} مهمة متأخرة • ${number(summary.open_variance_tasks)} مراجعة فرق مفتوحة`} icon={<Clock3 className="h-5 w-5" />} />
          </section>

          {summary.open_variance_tasks > 0 && <Alert className="border-amber-200 bg-amber-50/70 text-amber-950"><AlertTriangle className="h-4 w-4" /><AlertDescription>يوجد {number(summary.open_variance_tasks)} فرق استلام لم يُغلق بعد في مركز المهام. قيمة الفرق لا تُسوّى تلقائيًا عند إغلاق المراجعة.</AlertDescription></Alert>}
          {query.data!.data_quality.legacy_rows > 0 && <Alert><AlertDescription>هناك {number(query.data!.data_quality.legacy_rows)} تحويل Legacy غير مبني على Transfer V2؛ يتم عرضه تاريخيًا فقط ولا يُعامل كدورة V2 كاملة.</AlertDescription></Alert>}

          <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
            <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Route className="h-5 w-5" />وضع التحويلات الحالي</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex justify-between rounded-2xl bg-muted/60 p-4"><span>طلبات صادرة تنتظر التجهيز</span><strong>{number(summary.requested_outgoing)}</strong></div><div className="flex justify-between rounded-2xl bg-muted/60 p-4"><span>طلبات واردة تنتظر التجهيز</span><strong>{number(summary.requested_incoming)}</strong></div><div className="flex justify-between rounded-2xl bg-muted/60 p-4"><span>ملغي خلال الفترة</span><strong>{number(summary.cancelled_in_period)}</strong></div></CardContent></Card>
            <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5" />رقابة الاستلام</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex justify-between rounded-2xl bg-muted/60 p-4"><span>فرق مطلق بالكمية</span><strong>{number(summary.absolute_variance_measure_in_period)}</strong></div>{canProfit && <div className="flex justify-between rounded-2xl bg-muted/60 p-4"><span>قيمة الفرق بالتكلفة</span><strong>{money(summary.absolute_variance_cost_in_period)}</strong></div>}<div className="flex justify-between rounded-2xl bg-muted/60 p-4"><span>مهام تحويل متأخرة</span><strong>{number(summary.overdue_transfer_tasks)}</strong></div></CardContent></Card>
          </section>

          <Card className="border-0 shadow-sm ring-1 ring-black/5">
            <CardHeader><CardTitle className="text-lg">آخر التحويلات</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {query.data!.recent_transfers.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">لا توجد تحويلات مخزون مسجلة حتى الآن.</p> : <table className="w-full min-w-[980px] text-sm"><thead><tr className="border-b text-muted-foreground"><th className="px-3 py-3 text-right">التحويل</th><th className="px-3 py-3 text-right">المسار</th><th className="px-3 py-3 text-right">الحالة</th><th className="px-3 py-3 text-left">أصناف</th><th className="px-3 py-3 text-left">مشحون</th><th className="px-3 py-3 text-left">مستلم</th><th className="px-3 py-3 text-left">فرق</th>{canProfit && <th className="px-3 py-3 text-left">تكلفة</th>}</tr></thead><tbody>{query.data!.recent_transfers.map((row) => <tr key={row.id} className="border-b last:border-0"><td className="px-3 py-3 font-semibold">{row.transfer_number}</td><td className="px-3 py-3">{row.from_branch_name} ← {row.to_branch_name}<div className="text-xs text-muted-foreground">{row.direction === "incoming" ? "وارد" : "صادر"}</div></td><td className="px-3 py-3">{statusLabel(row.status)}</td><td className="px-3 py-3 text-left">{number(row.items_count)}</td><td className="px-3 py-3 text-left">{number(row.shipped_measure)}</td><td className="px-3 py-3 text-left">{number(row.received_measure)}</td><td className={`px-3 py-3 text-left font-semibold ${row.variance_measure > 0 ? "text-rose-700" : ""}`}>{number(row.variance_measure)}</td>{canProfit && <td className="px-3 py-3 text-left">{money(row.cost_value)}</td>}</tr>)}</tbody></table>}
            </CardContent>
          </Card>
        </>}
      </div>
    </MainLayout>
  );
}

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfDay, startOfMonth, subDays } from "date-fns";
import { AlertTriangle, Clock3, Package, RefreshCcw, RotateCcw, TrendingDown, Users, WalletCards } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
import { fetchReportingReturnsV2 } from "@/services/supabase/reportingReturnsV2Service";

type PeriodPreset = "today" | "7d" | "30d" | "month";

const money = (value: number | null | undefined) =>
  `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${siteConfig.currency}`;
const number = (value: number | null | undefined) => Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });

const getRange = (preset: PeriodPreset) => {
  const now = new Date();
  if (preset === "today") return { from: startOfDay(now), to: now, label: "اليوم" };
  if (preset === "7d") return { from: startOfDay(subDays(now, 6)), to: now, label: "آخر 7 أيام" };
  if (preset === "month") return { from: startOfMonth(now), to: now, label: "هذا الشهر" };
  return { from: startOfDay(subDays(now, 29)), to: now, label: "آخر 30 يوم" };
};

function Metric({ title, value, hint, icon }: { title: string; value: string; hint: string; icon: React.ReactNode }) {
  return (
    <Card className="border-0 shadow-sm ring-1 ring-black/5">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-2 text-2xl font-black tracking-tight">{value}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

const typeLabel = (type: string) => type === "full" ? "كامل" : type === "partial" ? "جزئي" : "—";

export default function ReportsReturnsV2() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [period, setPeriod] = useState<PeriodPreset>("30d");
  const range = useMemo(() => getRange(period), [period]);

  const query = useQuery({
    queryKey: ["reporting-returns-v2", currentBranchId, period],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchReportingReturnsV2(currentBranchId!, range.from, range.to),
    staleTime: 30_000,
  });

  const chartData = useMemo(
    () => (query.data?.daily || []).map((row) => ({
      ...row,
      label: new Date(`${row.date}T12:00:00`).toLocaleDateString("ar-EG", { day: "numeric", month: "short" }),
    })),
    [query.data?.daily],
  );

  if (!currentBranchId) {
    return <MainLayout><div className="mx-auto mt-16 max-w-xl"><Alert><AlertDescription>اختر فرعًا أولًا لعرض تقرير المرتجعات.</AlertDescription></Alert></div></MainLayout>;
  }

  const summary = query.data?.summary;
  const canProfit = Boolean(query.data?.permissions.can_view_profit);

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto w-full max-w-[1600px] space-y-5 py-5">
        <ReportsSectionNav />

        <section className="rounded-3xl border bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap gap-2"><Badge variant="secondary">Returns V2</Badge><Badge variant="outline">{currentBranchName || "الفرع الحالي"}</Badge></div>
              <h1 className="text-2xl font-black md:text-3xl">تقرير المرتجعات</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                قيمة وعدد المرتجعات، كامل أو جزئي، أسباب المرتجع، الأصناف والكاشير ووسيلة رد المبلغ وتأثير الربح ومهام التحويل المعلقة.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={period} onValueChange={(value) => setPeriod(value as PeriodPreset)}>
                <SelectTrigger className="min-w-[170px] rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="today">اليوم</SelectItem><SelectItem value="7d">آخر 7 أيام</SelectItem><SelectItem value="30d">آخر 30 يوم</SelectItem><SelectItem value="month">هذا الشهر</SelectItem></SelectContent>
              </Select>
              <Button variant="outline" className="rounded-xl" onClick={() => query.refetch()} disabled={query.isFetching}>
                <RefreshCcw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث
              </Button>
            </div>
          </div>
        </section>

        {query.isLoading ? (
          <div className="flex min-h-[420px] items-center justify-center"><BrandLoader size="lg" /></div>
        ) : query.isError || !summary ? (
          <Alert variant="destructive"><AlertDescription>تعذر تحميل تقرير المرتجعات. تأكد من صلاحية التقارير ثم أعد المحاولة.</AlertDescription></Alert>
        ) : (
          <>
            <section className={`grid gap-4 sm:grid-cols-2 ${canProfit ? "xl:grid-cols-6" : "xl:grid-cols-5"}`}>
              <Metric title="قيمة المرتجعات المعتمدة" value={money(summary.approved_value)} hint={`${number(summary.approved_count)} مرتجع معتمد`} icon={<RotateCcw className="h-5 w-5" />} />
              <Metric title="المبالغ المردودة" value={money(summary.completed_refund_value)} hint={`استعادة ولاء ${money(summary.loyalty_restored)}`} icon={<WalletCards className="h-5 w-5" />} />
              <Metric title="كامل / جزئي" value={`${number(summary.full_return_count)} / ${number(summary.partial_return_count)}`} hint="تصنيف مقابل قيمة البيع الأصلية" icon={<Package className="h-5 w-5" />} />
              <Metric title="متوسط زمن التحويل" value={`${number(summary.avg_transfer_minutes)} دقيقة`} hint="من اعتماد المرتجع حتى اكتمال مهمة الرد الإلكتروني" icon={<Clock3 className="h-5 w-5" />} />
              <Metric title="ردود معلقة الآن" value={money(summary.pending_refund_amount)} hint={`${number(summary.pending_refund_tasks)} مهمة تحويل مفتوحة`} icon={<AlertTriangle className="h-5 w-5" />} />
              {canProfit && <Metric title="تأثير الربح" value={money(summary.profit_impact)} hint={`تكلفة بضاعة مرتجعة ${money(summary.returned_cogs)}`} icon={<TrendingDown className="h-5 w-5" />} />}
            </section>

            {(summary.pending_refund_tasks > 0 || summary.pending_review_count > 0) && (
              <Alert className="border-amber-200 bg-amber-50/80 text-amber-950">
                <AlertDescription>يوجد {number(summary.pending_review_count)} طلب مرتجع ينتظر قرارًا و{number(summary.pending_refund_tasks)} مهمة رد مبلغ مفتوحة بقيمة {money(summary.pending_refund_amount)}.</AlertDescription>
              </Alert>
            )}

            <section className="grid gap-5 xl:grid-cols-[1.7fr_1fr]">
              <Card className="border-0 shadow-sm ring-1 ring-black/5">
                <CardHeader><CardTitle className="text-lg">اتجاه المرتجعات</CardTitle><p className="text-xs text-muted-foreground">القيمة المعتمدة مقابل المبالغ التي تم ردها فعليًا.</p></CardHeader>
                <CardContent className="h-[330px] px-2 md:px-6">
                  <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" fontSize={11} /><YAxis fontSize={11} /><Tooltip formatter={(value) => money(Number(value))} /><Bar dataKey="returned_value" name="قيمة المرتجع" fill="hsl(var(--primary))" radius={[6,6,0,0]} /><Bar dataKey="refunded_value" name="المبلغ المردود" fill="hsl(var(--muted-foreground))" radius={[6,6,0,0]} /></BarChart></ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm ring-1 ring-black/5">
                <CardHeader><CardTitle className="text-lg">أسباب المرتجع</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {query.data!.reasons.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">لا توجد مرتجعات معتمدة في الفترة.</p> : query.data!.reasons.slice(0, 8).map((row, index) => (
                    <div key={`${row.reason}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border p-3"><div><p className="font-semibold">{row.reason}</p><p className="mt-1 text-xs text-muted-foreground">{number(row.returns)} مرتجع</p></div><strong>{money(row.value)}</strong></div>
                  ))}
                </CardContent>
              </Card>
            </section>

            <section className="grid gap-5 xl:grid-cols-3">
              <Card className="border-0 shadow-sm ring-1 ring-black/5">
                <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Package className="h-5 w-5" />الأصناف الأعلى مرتجعات</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {query.data!.top_products.slice(0, 8).map((row, index) => (
                    <div key={row.product_id || `${row.product_name}-${index}`} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{index + 1}. {row.product_name}</p><p className="mt-1 text-xs text-muted-foreground">كمية {number(row.quantity)}</p></div><strong>{money(row.value)}</strong></div>{canProfit && row.profit_impact !== null && <p className="mt-2 text-xs text-rose-700">تأثير الربح {money(row.profit_impact)}</p>}</div>
                  ))}
                  {query.data!.top_products.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">لا توجد أصناف مرتجعة.</p>}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm ring-1 ring-black/5">
                <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><WalletCards className="h-5 w-5" />وسائل رد المبلغ</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {query.data!.payments.map((row) => <div key={row.code} className="rounded-xl border p-3"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold">{row.name}</p><p className="mt-1 text-xs text-muted-foreground">{number(row.returns)} مرتجع</p></div><strong>{money(row.refund_value)}</strong></div></div>)}
                  {query.data!.payments.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">لا توجد بيانات رد مبالغ.</p>}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm ring-1 ring-black/5">
                <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5" />المرتجعات حسب الكاشير</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {query.data!.cashiers.map((row, index) => <div key={row.cashier_id || `${row.cashier_name}-${index}`} className="rounded-xl border p-3"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold">{row.cashier_name}</p><p className="mt-1 text-xs text-muted-foreground">{number(row.returns)} مرتجع</p></div><strong>{money(row.value)}</strong></div></div>)}
                  {query.data!.cashiers.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">لا توجد مرتجعات POS.</p>}
                </CardContent>
              </Card>
            </section>

            {query.data!.pending_tasks.length > 0 && (
              <Card className="border-amber-200 bg-amber-50/40 shadow-sm">
                <CardHeader><CardTitle className="text-lg">مهام رد المبالغ المعلقة</CardTitle></CardHeader>
                <CardContent className="space-y-2">{query.data!.pending_tasks.map((task) => <div key={task.id} className="flex flex-col gap-2 rounded-xl border bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold">{task.title}</p><p className="mt-1 text-xs text-muted-foreground">{task.payment_method_name || task.payment_method_code || "وسيلة غير محددة"} • {task.priority}</p></div><div className="text-left"><p className="font-black">{money(task.amount)}</p><Badge variant="outline">{task.status}</Badge></div></div>)}</CardContent>
              </Card>
            )}

            <Card className="border-0 shadow-sm ring-1 ring-black/5">
              <CardHeader><CardTitle className="text-lg">أحدث المرتجعات</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-sm">
                  <thead><tr className="border-b text-muted-foreground"><th className="px-3 py-3 text-right">الفاتورة/الطلب</th><th className="px-3 py-3 text-right">النوع</th><th className="px-3 py-3 text-right">السبب</th><th className="px-3 py-3 text-right">الكاشير</th><th className="px-3 py-3 text-right">الدفع</th><th className="px-3 py-3 text-right">الحالة</th><th className="px-3 py-3 text-right">التاريخ</th><th className="px-3 py-3 text-left">القيمة</th><th className="px-3 py-3 text-left">تم رده</th></tr></thead>
                  <tbody>{query.data!.recent.map((row) => <tr key={row.id} className="border-b last:border-0"><td className="px-3 py-3 font-mono text-xs">{row.document_number}</td><td className="px-3 py-3"><Badge variant="outline">{typeLabel(row.return_type)}</Badge></td><td className="px-3 py-3">{row.reason}</td><td className="px-3 py-3">{row.cashier_name || (row.source === "pos" ? "غير معروف" : "أونلاين")}</td><td className="px-3 py-3">{row.payment_name}</td><td className="px-3 py-3"><Badge variant={row.refund_status === "completed" ? "secondary" : "outline"}>{row.refund_status === "completed" ? "مردود" : row.refund_status || row.status}</Badge></td><td className="px-3 py-3 text-muted-foreground">{row.event_at ? new Date(row.event_at).toLocaleString("ar-EG") : "—"}</td><td className="px-3 py-3 text-left font-semibold">{money(row.total_amount)}</td><td className="px-3 py-3 text-left font-bold">{money(row.money_refund)}</td></tr>)}</tbody>
                </table>
                {query.data!.recent.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">لا توجد مرتجعات في الفترة المختارة.</p>}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  );
}

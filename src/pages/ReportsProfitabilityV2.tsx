import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfDay, startOfMonth, subDays } from "date-fns";
import { Banknote, Boxes, CircleDollarSign, RefreshCcw, TrendingDown, TrendingUp, WalletCards } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
import { fetchReportingProfitabilityV2 } from "@/services/supabase/reportingProfitabilityV2Service";

type PeriodPreset = "today" | "7d" | "30d" | "month";

const money = (value: number | null | undefined) =>
  `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${siteConfig.currency}`;

const getRange = (preset: PeriodPreset) => {
  const now = new Date();
  if (preset === "today") return { from: startOfDay(now), to: now, label: "اليوم" };
  if (preset === "7d") return { from: startOfDay(subDays(now, 6)), to: now, label: "آخر 7 أيام" };
  if (preset === "month") return { from: startOfMonth(now), to: now, label: "هذا الشهر" };
  return { from: startOfDay(subDays(now, 29)), to: now, label: "آخر 30 يوم" };
};

function Metric({ title, value, hint, icon, negative = false }: { title: string; value: string; hint: string; icon: React.ReactNode; negative?: boolean }) {
  return (
    <Card className="border-0 shadow-sm ring-1 ring-black/5">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-sm font-medium text-muted-foreground">{title}</p><p className={`mt-2 text-2xl font-black tracking-tight ${negative ? "text-rose-700" : ""}`}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${negative ? "bg-rose-50 text-rose-700" : "bg-primary/10 text-primary"}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReportsProfitabilityV2() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [period, setPeriod] = useState<PeriodPreset>("30d");
  const range = useMemo(() => getRange(period), [period]);

  const query = useQuery({
    queryKey: ["reporting-profitability-v2", currentBranchId, period],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchReportingProfitabilityV2(currentBranchId!, range.from, range.to),
    staleTime: 30_000,
  });

  const summary = query.data?.summary;
  const daily = useMemo(() => (query.data?.daily || []).map((row) => ({
    ...row,
    label: new Date(`${row.date}T12:00:00`).toLocaleDateString("ar-EG", { day: "numeric", month: "short" }),
  })), [query.data?.daily]);

  if (!currentBranchId) return <MainLayout><div className="mx-auto mt-16 max-w-xl"><Alert><AlertDescription>اختر فرعًا أولًا لعرض تقرير الربحية.</AlertDescription></Alert></div></MainLayout>;

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto w-full max-w-[1600px] space-y-5 py-5">
        <ReportsSectionNav />

        <section className="rounded-3xl border bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap gap-2"><Badge variant="secondary">Profitability V2</Badge><Badge variant="outline">{currentBranchName || "الفرع الحالي"}</Badge><Badge variant="outline">POS Snapshot</Badge></div>
              <h1 className="text-2xl font-black md:text-3xl">الربحية والنتيجة التشغيلية</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">من صافي المبيعات إلى تكلفة البضاعة والرسوم والمصروفات، باستخدام تكلفة محفوظة وقت الفاتورة بدل سعر المنتج الحالي.</p>
            </div>
            <div className="flex gap-2">
              <Select value={period} onValueChange={(v) => setPeriod(v as PeriodPreset)}><SelectTrigger className="w-[180px] rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="today">اليوم</SelectItem><SelectItem value="7d">آخر 7 أيام</SelectItem><SelectItem value="30d">آخر 30 يوم</SelectItem><SelectItem value="month">هذا الشهر</SelectItem></SelectContent></Select>
              <Button variant="outline" className="rounded-xl" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCcw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث</Button>
            </div>
          </div>
        </section>

        {query.isLoading ? <div className="flex min-h-[420px] items-center justify-center"><BrandLoader size="lg" /></div> : query.isError || !summary ? (
          <Alert variant="destructive"><AlertDescription>تعذر تحميل تقرير الربحية. هذه الصفحة تتطلب صلاحية عرض الأرباح.</AlertDescription></Alert>
        ) : (
          <>
            {!query.data?.online_profit_complete && (
              <Alert className="border-amber-200 bg-amber-50 text-amber-950"><AlertDescription>ربحية الأونلاين غير مضافة لهذا التقرير حاليًا لأن الطلبات القديمة لا تحتوي على Cost Snapshot موثوق لكل بند. لن يقوم النظام بافتراض هامش ربح تقديري.</AlertDescription></Alert>
            )}

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
              <Metric title="صافي مبيعات POS" value={money(summary.pos_net_sales)} hint="بعد المرتجعات المؤكدة" icon={<TrendingUp className="h-5 w-5" />} />
              <Metric title="تكلفة البضاعة" value={money(summary.pos_net_cogs)} hint="COGS من Snapshot الأصناف" icon={<Boxes className="h-5 w-5" />} negative />
              <Metric title="إجمالي الربح" value={money(summary.pos_gross_profit)} hint="صافي المبيعات − COGS" icon={<CircleDollarSign className="h-5 w-5" />} />
              <Metric title="رسوم وسائل الدفع" value={money(summary.merchant_payment_fees)} hint="الجزء الذي تتحمله المنشأة" icon={<WalletCards className="h-5 w-5" />} negative />
              <Metric title="المصروفات" value={money(summary.expenses)} hint="المصروفات النشطة في الفترة" icon={<Banknote className="h-5 w-5" />} negative />
              <Metric title="النتيجة التشغيلية" value={money(summary.known_operating_result)} hint="الجزء المعروف والموثوق فقط" icon={Number(summary.known_operating_result || 0) >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />} negative={Number(summary.known_operating_result || 0) < 0} />
            </section>

            <section className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
              <Card className="border-0 shadow-sm ring-1 ring-black/5">
                <CardHeader><CardTitle className="text-lg">اتجاه الربحية اليومية</CardTitle><p className="text-xs text-muted-foreground">المبيعات، إجمالي الربح والنتيجة التشغيلية المعروفة لكل يوم.</p></CardHeader>
                <CardContent className="h-[350px] px-2 md:px-6">
                  <ResponsiveContainer width="100%" height="100%"><AreaChart data={daily}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" fontSize={11} /><YAxis fontSize={11} /><Tooltip formatter={(v) => money(Number(v))} /><Area type="monotone" dataKey="net_sales" name="صافي المبيعات" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.08} strokeWidth={2} /><Area type="monotone" dataKey="gross_profit" name="إجمالي الربح" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2))" fillOpacity={0.04} strokeWidth={2} /><Area type="monotone" dataKey="known_operating_result" name="النتيجة التشغيلية" stroke="hsl(var(--chart-3))" fill="hsl(var(--chart-3))" fillOpacity={0.03} strokeWidth={2} /></AreaChart></ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm ring-1 ring-black/5">
                <CardHeader><CardTitle className="text-lg">مسار تكوين الربح</CardTitle><p className="text-xs text-muted-foreground">Waterfall محاسبي واضح بدل رقم ربح بدون تفسير.</p></CardHeader>
                <CardContent className="space-y-3">
                  {(query.data?.waterfall || []).map((row, index) => (
                    <div key={`${row.key}-${index}`} className={`rounded-2xl border p-4 ${row.value < 0 ? "border-rose-100 bg-rose-50/50" : "bg-muted/30"}`}>
                      <div className="flex items-center justify-between gap-3"><span className="font-semibold">{row.label}</span><strong className={row.value < 0 ? "text-rose-700" : "text-foreground"}>{row.value < 0 ? "−" : ""}{money(Math.abs(row.value))}</strong></div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>

            <Card className="border-0 shadow-sm ring-1 ring-black/5">
              <CardHeader><CardTitle className="text-lg">تعريف النتيجة الحالية</CardTitle></CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">إجمالي الربح</p><p className="mt-1 font-bold">صافي مبيعات POS − صافي تكلفة البضاعة</p></div>
                <div className="rounded-2xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">بعد رسوم الدفع</p><p className="mt-1 font-bold">إجمالي الربح − رسوم المنشأة</p></div>
                <div className="rounded-2xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">النتيجة التشغيلية المعروفة</p><p className="mt-1 font-bold">ربح POS بعد الرسوم − المصروفات المسجلة</p></div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  );
}

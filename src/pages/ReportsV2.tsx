import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfDay, startOfMonth, subDays } from "date-fns";
import { ArrowDownLeft, ArrowUpLeft, Banknote, BarChart3, CreditCard, Package, Receipt, RefreshCcw, RotateCcw, ShoppingBag, ShoppingCart, TrendingUp, WalletCards } from "lucide-react";
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
import { fetchReportingOverviewV2, ReportingMetricsV2, ReportingPaymentV2 } from "@/services/supabase/reportingV2Service";

type PeriodPreset = "today" | "7d" | "30d" | "month";

const money = (value: number | null | undefined) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${siteConfig.currency}`;
const number = (value: number | null | undefined, digits = 0) => Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: digits });

const getRange = (preset: PeriodPreset) => {
  const now = new Date();
  if (preset === "today") return { from: startOfDay(now), to: now, label: "اليوم" };
  if (preset === "7d") return { from: startOfDay(subDays(now, 6)), to: now, label: "آخر 7 أيام" };
  if (preset === "month") return { from: startOfMonth(now), to: now, label: "هذا الشهر" };
  return { from: startOfDay(subDays(now, 29)), to: now, label: "آخر 30 يوم" };
};

const trendFor = (current: number, previous: number) => {
  if (!previous && !current) return { value: 0, label: "بدون تغيير", positive: true };
  if (!previous) return { value: null as number | null, label: "بداية فترة جديدة", positive: true };
  const value = ((current - previous) / Math.abs(previous)) * 100;
  return { value, label: `${Math.abs(value).toLocaleString("ar-EG", { maximumFractionDigits: 1 })}% عن الفترة السابقة`, positive: value >= 0 };
};

function Trend({ current, previous, inverse = false }: { current: number; previous: number; inverse?: boolean }) {
  const trend = trendFor(current, previous);
  if (trend.value === null) return <p className="mt-2 text-xs text-muted-foreground">{trend.label}</p>;
  const positive = inverse ? !trend.positive : trend.positive;
  return <div className={`mt-2 flex items-center gap-1 text-xs ${positive ? "text-emerald-700" : "text-rose-700"}`}>{trend.positive ? <ArrowUpLeft className="h-3.5 w-3.5" /> : <ArrowDownLeft className="h-3.5 w-3.5" />}{trend.label}</div>;
}

function Kpi({ title, value, hint, icon, current, previous, inverse = false }: { title: string; value: string; hint: string; icon: React.ReactNode; current: number; previous: number; inverse?: boolean }) {
  return <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-muted-foreground">{title}</p><p className="mt-2 text-2xl font-black tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></div><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div></div><Trend current={current} previous={previous} inverse={inverse} /></CardContent></Card>;
}

const paymentIcon = (row: ReportingPaymentV2) => row.method_type === "cash" ? <Banknote className="h-4 w-4" /> : row.method_type === "card" ? <CreditCard className="h-4 w-4" /> : <WalletCards className="h-4 w-4" />;

export default function ReportsV2() {
  const [period, setPeriod] = useState<PeriodPreset>("30d");
  const { currentBranchId, currentBranchName } = useBranchStore();
  const range = useMemo(() => getRange(period), [period]);
  const query = useQuery({
    queryKey: ["reporting-v2-overview", currentBranchId, period],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchReportingOverviewV2(currentBranchId!, range.from, range.to),
    staleTime: 30_000,
  });
  const current: ReportingMetricsV2 | undefined = query.data?.current;
  const previous: ReportingMetricsV2 | undefined = query.data?.previous;
  const chartData = useMemo(() => (query.data?.daily || []).map((point) => ({ ...point, label: new Date(`${point.date}T12:00:00`).toLocaleDateString("ar-EG", { day: "numeric", month: "short" }) })), [query.data?.daily]);

  if (!currentBranchId) return <MainLayout><div className="mx-auto mt-16 max-w-xl"><Alert><AlertDescription>اختر فرعًا أولًا من أعلى النظام لعرض التقارير.</AlertDescription></Alert></div></MainLayout>;

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto w-full max-w-[1600px] space-y-5 py-5">
        <ReportsSectionNav />

        <section className="overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="flex flex-col gap-5 p-5 md:p-7 lg:flex-row lg:items-center lg:justify-between">
            <div><div className="mb-2 flex flex-wrap items-center gap-2"><Badge variant="secondary" className="rounded-full">Reporting V2</Badge><Badge variant="outline" className="rounded-full">{currentBranchName || "الفرع الحالي"}</Badge></div><h1 className="text-2xl font-black tracking-tight md:text-3xl">مركز التقارير والتحليلات</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">مركز إدارة موحد مبني على Invoice V2 والمرتجعات ووسائل الدفع، مع مقارنة حقيقية بالفترة السابقة بدل نسب ثابتة.</p></div>
            <div className="flex flex-col gap-2 sm:flex-row"><Select value={period} onValueChange={(v) => setPeriod(v as PeriodPreset)}><SelectTrigger className="min-w-[180px] rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="today">اليوم</SelectItem><SelectItem value="7d">آخر 7 أيام</SelectItem><SelectItem value="30d">آخر 30 يوم</SelectItem><SelectItem value="month">هذا الشهر</SelectItem></SelectContent></Select><Button variant="outline" className="rounded-xl" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCcw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث</Button></div>
          </div>
        </section>

        {query.isLoading ? <div className="flex min-h-[420px] items-center justify-center"><BrandLoader size="lg" /></div> : query.isError || !current || !previous ? (
          <Alert variant="destructive"><AlertDescription>تعذر تحميل التقارير. تأكد من صلاحية عرض التقارير للفرع ثم أعد المحاولة.</AlertDescription></Alert>
        ) : (
          <>
            {!current.online_profit_complete && current.can_view_profit && <Alert className="border-amber-200 bg-amber-50/80 text-amber-950"><AlertDescription>الإيراد يشمل POS والأونلاين، لكن الربحية الحالية تخص POS فقط لأن تكلفة أصناف الأونلاين القديمة ليست محفوظة Snapshot. النظام لن يعرض ربح أونلاين تقديري.</AlertDescription></Alert>}

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi title="صافي المبيعات" value={money(current.net_sales)} hint={`${number(current.transactions)} فاتورة/طلب • ${range.label}`} icon={<TrendingUp className="h-5 w-5" />} current={current.net_sales} previous={previous.net_sales} />
              <Kpi title="عدد العمليات" value={number(current.transactions)} hint={`${number(current.pos_transactions)} POS • ${number(current.online_transactions)} أونلاين`} icon={<Receipt className="h-5 w-5" />} current={current.transactions} previous={previous.transactions} />
              <Kpi title="متوسط الفاتورة" value={money(current.average_ticket)} hint={`${number(current.items_sold, 2)} وحدة/وزن صافي مباع`} icon={<ShoppingCart className="h-5 w-5" />} current={current.average_ticket} previous={previous.average_ticket} />
              <Kpi title="المرتجعات" value={money(current.returns)} hint={`${number(current.return_count)} مرتجع مؤكد`} icon={<RotateCcw className="h-5 w-5" />} current={current.returns} previous={previous.returns} inverse />
            </section>

            {current.can_view_profit && <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi title="إجمالي ربح POS" value={money(current.pos_gross_profit)} hint={`تكلفة صافية ${money(current.pos_net_cogs)}`} icon={<BarChart3 className="h-5 w-5" />} current={Number(current.pos_gross_profit || 0)} previous={Number(previous.pos_gross_profit || 0)} />
              <Kpi title="بعد رسوم الدفع" value={money(current.pos_profit_after_payment_fees)} hint={`رسوم المنشأة ${money(current.merchant_payment_fees)}`} icon={<WalletCards className="h-5 w-5" />} current={Number(current.pos_profit_after_payment_fees || 0)} previous={Number(previous.pos_profit_after_payment_fees || 0)} />
              <Kpi title="المصروفات" value={money(current.expenses)} hint="المصروفات النشطة المسجلة" icon={<Banknote className="h-5 w-5" />} current={current.expenses} previous={previous.expenses} inverse />
              <Kpi title="النتيجة التشغيلية المعروفة" value={money(current.known_operating_result)} hint="ربح POS بعد الرسوم والمصروفات" icon={<TrendingUp className="h-5 w-5" />} current={Number(current.known_operating_result || 0)} previous={Number(previous.known_operating_result || 0)} />
            </section>}

            <section className="grid gap-5 xl:grid-cols-[1.7fr_1fr]">
              <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardHeader><div className="flex items-center justify-between"><div><CardTitle className="text-lg">اتجاه صافي المبيعات</CardTitle><p className="mt-1 text-xs text-muted-foreground">POS + الطلبات المسلمة والمدفوعة − المرتجعات المؤكدة</p></div><Badge variant="outline">{range.label}</Badge></div></CardHeader><CardContent className="h-[330px] px-2 md:px-6"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><defs><linearGradient id="overviewNet" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.22} /><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" fontSize={11} /><YAxis fontSize={11} /><Tooltip formatter={(v) => money(Number(v))} /><Area type="monotone" dataKey="net_sales" name="صافي المبيعات" stroke="hsl(var(--primary))" fill="url(#overviewNet)" strokeWidth={2.5} /></AreaChart></ResponsiveContainer></CardContent></Card>

              <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardHeader><CardTitle className="text-lg">قنوات البيع</CardTitle></CardHeader><CardContent className="space-y-3"><div className="rounded-2xl bg-muted/60 p-4"><div className="flex items-center justify-between"><span className="flex items-center gap-2 font-semibold"><ShoppingCart className="h-4 w-4" />POS</span><strong>{money(current.pos_gross_sales)}</strong></div><p className="mt-1 text-xs text-muted-foreground">{number(current.pos_transactions)} فاتورة</p></div><div className="rounded-2xl bg-muted/60 p-4"><div className="flex items-center justify-between"><span className="flex items-center gap-2 font-semibold"><ShoppingBag className="h-4 w-4" />أونلاين</span><strong>{money(current.online_gross_sales)}</strong></div><p className="mt-1 text-xs text-muted-foreground">{number(current.online_transactions)} طلب مكتمل ومدفوع</p></div><div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4"><div className="flex items-center justify-between"><span className="flex items-center gap-2 font-semibold text-rose-800"><RotateCcw className="h-4 w-4" />مرتجعات</span><strong className="text-rose-800">-{money(current.returns)}</strong></div></div></CardContent></Card>
            </section>

            <section className="grid gap-5 xl:grid-cols-2">
              <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardHeader><CardTitle className="text-lg">وسائل الدفع</CardTitle></CardHeader><CardContent className="space-y-2">{(query.data?.payments || []).map((row) => <div key={row.code} className="rounded-2xl border p-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">{paymentIcon(row)}</div><div><p className="font-bold">{row.name}</p><p className="text-xs text-muted-foreground">{number(row.sale_count)} عملية</p></div></div><strong>{money(row.net_collected)}</strong></div>{row.refunds > 0 && <p className="mt-2 text-xs text-rose-600">مرتجعات مؤكدة: -{money(row.refunds)}</p>}</div>)}</CardContent></Card>

              <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Package className="h-5 w-5" />أفضل المنتجات</CardTitle></CardHeader><CardContent className="space-y-2">{(query.data?.top_products || []).length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">لا توجد بيانات منتجات في الفترة الحالية.</p> : query.data!.top_products.map((row, index) => <div key={row.product_id || `${row.product_name}-${index}`} className="flex items-center justify-between gap-4 rounded-2xl border p-4"><div><p className="font-bold">{index + 1}. {row.product_name}</p><p className="mt-1 text-xs text-muted-foreground">كمية صافية {number(row.quantity, 3)}</p></div><div className="text-left"><p className="font-black">{money(row.revenue)}</p>{current.can_view_profit && row.profit != null && <p className="text-xs text-emerald-700">ربح {money(row.profit)}</p>}</div></div>)}</CardContent></Card>
            </section>
          </>
        )}
      </div>
    </MainLayout>
  );
}

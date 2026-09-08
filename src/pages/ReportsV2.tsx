import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfDay, startOfMonth, subDays } from "date-fns";
import {
  ArrowDownLeft,
  ArrowUpLeft,
  BarChart3,
  Banknote,
  CreditCard,
  Package,
  Receipt,
  RefreshCcw,
  RotateCcw,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import MainLayout from "@/components/layout/MainLayout";
import BrandLoader from "@/components/ui/BrandLoader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { siteConfig } from "@/config/site";
import { useBranchStore } from "@/stores/branchStore";
import {
  fetchReportingOverviewV2,
  ReportingMetricsV2,
  ReportingPaymentV2,
} from "@/services/supabase/reportingV2Service";

type PeriodPreset = "today" | "7d" | "30d" | "month";

const formatMoney = (value: number | null | undefined) =>
  `${Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2, minimumFractionDigits: 2 })} ${siteConfig.currency}`;

const formatNumber = (value: number | null | undefined, digits = 0) =>
  Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: digits });

const getRange = (preset: PeriodPreset) => {
  const now = new Date();
  if (preset === "today") return { from: startOfDay(now), to: now, label: "اليوم" };
  if (preset === "7d") return { from: startOfDay(subDays(now, 6)), to: now, label: "آخر 7 أيام" };
  if (preset === "month") return { from: startOfMonth(now), to: now, label: "هذا الشهر" };
  return { from: startOfDay(subDays(now, 29)), to: now, label: "آخر 30 يوم" };
};

const trendFor = (current: number, previous: number) => {
  if (!previous && !current) return { value: 0, label: "بدون تغيير", positive: true };
  if (!previous) return { value: null, label: "بداية فترة جديدة", positive: true };
  const value = ((current - previous) / Math.abs(previous)) * 100;
  return {
    value,
    label: `${Math.abs(value).toLocaleString("ar-EG", { maximumFractionDigits: 1 })}% عن الفترة السابقة`,
    positive: value >= 0,
  };
};

function TrendLine({ current, previous, inverse = false }: { current: number; previous: number; inverse?: boolean }) {
  const trend = trendFor(current, previous);
  const visuallyPositive = inverse ? !trend.positive : trend.positive;
  return (
    <div className="mt-2 flex items-center gap-1.5 text-xs">
      {trend.value === null ? (
        <span className="text-muted-foreground">{trend.label}</span>
      ) : (
        <>
          {trend.positive ? (
            <ArrowUpLeft className={`h-3.5 w-3.5 ${visuallyPositive ? "text-emerald-600" : "text-rose-600"}`} />
          ) : (
            <ArrowDownLeft className={`h-3.5 w-3.5 ${visuallyPositive ? "text-emerald-600" : "text-rose-600"}`} />
          )}
          <span className={visuallyPositive ? "text-emerald-700" : "text-rose-700"}>{trend.label}</span>
        </>
      )}
    </div>
  );
}

function KpiCard({
  title,
  value,
  hint,
  icon,
  current,
  previous,
  inverse = false,
}: {
  title: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  current: number;
  previous: number;
  inverse?: boolean;
}) {
  return (
    <Card className="border-0 shadow-sm ring-1 ring-black/5">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-2 truncate text-2xl font-black tracking-tight text-foreground">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {icon}
          </div>
        </div>
        <TrendLine current={current} previous={previous} inverse={inverse} />
      </CardContent>
    </Card>
  );
}

const paymentIcon = (payment: ReportingPaymentV2) => {
  if (payment.method_type === "cash") return <Banknote className="h-4 w-4" />;
  if (payment.method_type === "card") return <CreditCard className="h-4 w-4" />;
  return <WalletCards className="h-4 w-4" />;
};

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

  const chartData = useMemo(
    () => (query.data?.daily || []).map((point) => ({
      ...point,
      label: new Date(`${point.date}T12:00:00`).toLocaleDateString("ar-EG", { day: "numeric", month: "short" }),
    })),
    [query.data?.daily],
  );

  if (!currentBranchId) {
    return (
      <MainLayout>
        <div className="mx-auto mt-16 max-w-xl">
          <Alert>
            <AlertDescription>اختر فرعًا أولًا من أعلى النظام لعرض التقارير.</AlertDescription>
          </Alert>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto w-full max-w-[1600px] space-y-6 py-5">
        <section className="overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="flex flex-col gap-5 p-5 md:p-7 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-full">Reporting V2</Badge>
                <Badge variant="outline" className="rounded-full">{currentBranchName || "الفرع الحالي"}</Badge>
              </div>
              <h1 className="text-2xl font-black tracking-tight md:text-3xl">مركز التقارير والتحليلات</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                أرقام تشغيلية ومالية موحدة مبنية من الفواتير والمرتجعات ودفاتر الدفع، مع مقارنة تلقائية بالفترة السابقة.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select value={period} onValueChange={(value) => setPeriod(value as PeriodPreset)}>
                <SelectTrigger className="w-full min-w-[170px] rounded-xl bg-background sm:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">اليوم</SelectItem>
                  <SelectItem value="7d">آخر 7 أيام</SelectItem>
                  <SelectItem value="30d">آخر 30 يوم</SelectItem>
                  <SelectItem value="month">هذا الشهر</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" className="rounded-xl" onClick={() => query.refetch()} disabled={query.isFetching}>
                <RefreshCcw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
                تحديث
              </Button>
            </div>
          </div>
        </section>

        {query.isLoading ? (
          <div className="flex min-h-[420px] items-center justify-center"><BrandLoader size="lg" /></div>
        ) : query.isError || !current || !previous ? (
          <Alert variant="destructive">
            <AlertDescription>
              تعذر تحميل التقارير. تأكد من صلاحية عرض التقارير للفرع ثم أعد المحاولة.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {!current.online_profit_complete && current.can_view_profit && (
              <Alert className="border-amber-200 bg-amber-50/80 text-amber-950">
                <AlertDescription>
                  الإيراد يشمل POS والأونلاين، لكن مؤشرات الربح الحالية تعتمد على POS فقط لأن تكلفة أصناف الأونلاين القديمة ليست محفوظة Snapshot. لن يعرض النظام ربح أونلاين تقديريًا أو وهميًا.
                </AlertDescription>
              </Alert>
            )}

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                title="صافي المبيعات"
                value={formatMoney(current.net_sales)}
                hint={`${formatNumber(current.transactions)} فاتورة/طلب • ${range.label}`}
                icon={<TrendingUp className="h-5 w-5" />}
                current={current.net_sales}
                previous={previous.net_sales}
              />
              <KpiCard
                title="عدد العمليات"
                value={formatNumber(current.transactions)}
                hint={`${formatNumber(current.pos_transactions)} POS • ${formatNumber(current.online_transactions)} أونلاين`}
                icon={<Receipt className="h-5 w-5" />}
                current={current.transactions}
                previous={previous.transactions}
              />
              <KpiCard
                title="متوسط الفاتورة"
                value={formatMoney(current.average_ticket)}
                hint={`${formatNumber(current.items_sold, 2)} وحدة/وزن صافي مباع`}
                icon={<ShoppingCart className="h-5 w-5" />}
                current={current.average_ticket}
                previous={previous.average_ticket}
              />
              <KpiCard
                title="المرتجعات"
                value={formatMoney(current.returns)}
                hint={`${formatNumber(current.return_count)} عملية مرتجع مؤكدة`}
                icon={<RotateCcw className="h-5 w-5" />}
                current={current.returns}
                previous={previous.returns}
                inverse
              />
            </section>

            {current.can_view_profit && (
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  title="إجمالي ربح POS"
                  value={formatMoney(current.pos_gross_profit)}
                  hint={`تكلفة صافية ${formatMoney(current.pos_net_cogs)}`}
                  icon={<BarChart3 className="h-5 w-5" />}
                  current={Number(current.pos_gross_profit || 0)}
                  previous={Number(previous.pos_gross_profit || 0)}
                />
                <KpiCard
                  title="ربح POS بعد رسوم الدفع"
                  value={formatMoney(current.pos_profit_after_payment_fees)}
                  hint={`رسوم على المنشأة ${formatMoney(current.merchant_payment_fees)}`}
                  icon={<WalletCards className="h-5 w-5" />}
                  current={Number(current.pos_profit_after_payment_fees || 0)}
                  previous={Number(previous.pos_profit_after_payment_fees || 0)}
                />
                <KpiCard
                  title="المصروفات"
                  value={formatMoney(current.expenses)}
                  hint="المصروفات النشطة المسجلة على الفرع"
                  icon={<Banknote className="h-5 w-5" />}
                  current={current.expenses}
                  previous={previous.expenses}
                  inverse
                />
                <KpiCard
                  title="النتيجة التشغيلية المعروفة"
                  value={formatMoney(current.known_operating_result)}
                  hint="ربح POS بعد رسوم الدفع والمصروفات"
                  icon={<TrendingUp className="h-5 w-5" />}
                  current={Number(current.known_operating_result || 0)}
                  previous={Number(previous.known_operating_result || 0)}
                />
              </section>
            )}

            <section className="grid gap-5 xl:grid-cols-[1.7fr_1fr]">
              <Card className="border-0 shadow-sm ring-1 ring-black/5">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">اتجاه صافي المبيعات</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">POS + الطلبات المسلمة والمدفوعة − المرتجعات المؤكدة</p>
                  </div>
                  <Badge variant="outline">{range.label}</Badge>
                </CardHeader>
                <CardContent className="h-[330px] px-2 md:px-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="netSalesGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.24} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={20} />
                      <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={58} />
                      <Tooltip
                        formatter={(value: number) => [formatMoney(value), "صافي المبيعات"]}
                        labelStyle={{ textAlign: "right" }}
                      />
                      <Area type="monotone" dataKey="net_sales" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#netSalesGradient)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm ring-1 ring-black/5">
                <CardHeader>
                  <CardTitle className="text-lg">قنوات البيع</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl border bg-muted/20 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-primary" /><span className="font-semibold">نقطة البيع</span></div>
                      <span className="font-black">{formatMoney(current.pos_net_sales)}</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{formatNumber(current.pos_transactions)} فاتورة</p>
                  </div>
                  <div className="rounded-2xl border bg-muted/20 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><ShoppingBag className="h-4 w-4 text-primary" /><span className="font-semibold">الأونلاين</span></div>
                      <span className="font-black">{formatMoney(current.online_net_sales)}</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{formatNumber(current.online_transactions)} طلب مكتمل ومدفوع</p>
                  </div>
                  <div className="rounded-2xl border border-dashed p-4 text-xs leading-6 text-muted-foreground">
                    الخصومات: {formatMoney(current.product_discounts + current.loyalty_discounts)}<br />
                    المرتجعات المؤكدة: {formatMoney(current.returns)}
                  </div>
                </CardContent>
              </Card>
            </section>

            <section className="grid gap-5 xl:grid-cols-2">
              <Card className="border-0 shadow-sm ring-1 ring-black/5">
                <CardHeader>
                  <CardTitle className="text-lg">وسائل الدفع</CardTitle>
                  <p className="text-xs text-muted-foreground">التحصيل والمرتجعات لكل وسيلة بدون خلط المحافظ بالنقدي أو البطاقات</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {query.data.payments.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">لا توجد عمليات دفع في هذه الفترة.</p>
                  ) : query.data.payments.map((payment) => (
                    <div key={payment.code} className="flex items-center gap-3 rounded-2xl border p-3.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">{paymentIcon(payment)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate font-semibold">{payment.name}</p>
                          <p className="font-black">{formatMoney(payment.net_collected)}</p>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <span>تحصيل {formatMoney(payment.gross_collected)}</span>
                          {payment.refunds > 0 && <span className="text-rose-600">مرتجع -{formatMoney(payment.refunds)}</span>}
                          <span>{formatNumber(payment.sale_count)} عملية</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm ring-1 ring-black/5">
                <CardHeader>
                  <CardTitle className="text-lg">أعلى المنتجات</CardTitle>
                  <p className="text-xs text-muted-foreground">حسب صافي الإيراد من POS بعد المرتجعات المسجلة خلال الفترة</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {query.data.top_products.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">لا توجد مبيعات منتجات في هذه الفترة.</p>
                  ) : query.data.top_products.map((product, index) => (
                    <div key={`${product.product_id || product.product_name}-${index}`} className="flex items-center gap-3 rounded-2xl border p-3.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted font-black text-muted-foreground">{index + 1}</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{product.product_name}</p>
                        <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                          <span>{formatNumber(product.quantity, 3)} كمية</span>
                          {product.profit !== null && <span>ربح {formatMoney(product.profit)}</span>}
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="font-black">{formatMoney(product.revenue)}</p>
                        <Package className="mr-auto mt-1 h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>
          </>
        )}
      </div>
    </MainLayout>
  );
}

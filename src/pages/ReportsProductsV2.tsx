import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfDay, startOfMonth, subDays } from "date-fns";
import { AlertTriangle, Boxes, CircleDollarSign, RefreshCcw, RotateCcw, Search, ShieldCheck, ShoppingBasket, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import MainLayout from "@/components/layout/MainLayout";
import ReportsSectionNav from "@/components/reports/ReportsSectionNav";
import BrandLoader from "@/components/ui/BrandLoader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { siteConfig } from "@/config/site";
import { useBranchStore } from "@/stores/branchStore";
import { fetchReportingProductsV2 } from "@/services/supabase/reportingProductsV2Service";

type PeriodPreset = "today" | "7d" | "30d" | "month";

const money = (value: number | null | undefined) =>
  `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${siteConfig.currency}`;
const number = (value: number | null | undefined) => Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 3 });
const percent = (value: number | null | undefined) => value == null ? "—" : `${Number(value).toLocaleString("ar-EG", { maximumFractionDigits: 2 })}%`;

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
          <div><p className="text-sm font-medium text-muted-foreground">{title}</p><p className="mt-2 text-2xl font-black tracking-tight">{value}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p></div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReportsProductsV2() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [period, setPeriod] = useState<PeriodPreset>("30d");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const range = useMemo(() => getRange(period), [period]);

  const query = useQuery({
    queryKey: ["reporting-products-v2", currentBranchId, period],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchReportingProductsV2(currentBranchId!, range.from, range.to, 200),
    staleTime: 30_000,
  });

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (query.data?.products || []).filter((row) => {
      if (category !== "all" && row.category_name !== category) return false;
      if (!q) return true;
      return row.product_name.toLowerCase().includes(q) || (row.barcode || "").toLowerCase().includes(q) || row.category_name.toLowerCase().includes(q);
    });
  }, [query.data?.products, search, category]);

  const categoryOptions = useMemo(() => Array.from(new Set((query.data?.products || []).map((row) => row.category_name))).sort(), [query.data?.products]);
  const chartData = useMemo(() => (query.data?.categories || []).slice(0, 12).map((row) => ({ ...row, label: row.category_name.length > 18 ? `${row.category_name.slice(0, 18)}…` : row.category_name })), [query.data?.categories]);

  if (!currentBranchId) return <MainLayout><div className="mx-auto mt-16 max-w-xl"><Alert><AlertDescription>اختر فرعًا أولًا لعرض تقرير المنتجات.</AlertDescription></Alert></div></MainLayout>;

  const summary = query.data?.summary;
  const canProfit = Boolean(query.data?.permissions.can_view_profit);
  const reconciled = Math.abs(summary?.reconciliation_difference || 0) < 0.005;

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto w-full max-w-[1600px] space-y-5 py-5">
        <ReportsSectionNav />

        <section className="rounded-3xl border bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap gap-2"><Badge variant="secondary">Products V2</Badge><Badge variant="outline">{currentBranchName || "الفرع الحالي"}</Badge></div>
              <h1 className="text-2xl font-black md:text-3xl">أداء المنتجات والأقسام</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">صافي إيراد وربحية المنتجات من Invoice V2 بعد توزيع خصم الولاء على السطور وخصم المرتجعات المعتمدة بنفس النسبة.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Select value={period} onValueChange={(v) => setPeriod(v as PeriodPreset)}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="today">اليوم</SelectItem><SelectItem value="7d">آخر 7 أيام</SelectItem><SelectItem value="30d">آخر 30 يوم</SelectItem><SelectItem value="month">هذا الشهر</SelectItem></SelectContent></Select>
              <Select value={category} onValueChange={setCategory}><SelectTrigger className="rounded-xl"><SelectValue placeholder="القسم" /></SelectTrigger><SelectContent><SelectItem value="all">كل الأقسام</SelectItem>{categoryOptions.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select>
              <div className="relative"><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-xl pr-9" placeholder="منتج أو باركود" /></div>
              <Button variant="outline" className="rounded-xl" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCcw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث</Button>
            </div>
          </div>
        </section>

        {query.isLoading ? <div className="flex min-h-[420px] items-center justify-center"><BrandLoader size="lg" /></div> : query.isError || !summary ? (
          <Alert variant="destructive"><AlertDescription>تعذر تحميل تقرير المنتجات. تأكد من صلاحية التقارير ثم أعد المحاولة.</AlertDescription></Alert>
        ) : (
          <>
            <section className={`grid gap-4 sm:grid-cols-2 ${canProfit ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>
              <Metric title="صافي إيراد المنتجات" value={money(summary.net_revenue)} hint={`قبل الولاء ${money(summary.item_revenue_before_loyalty)} • موزع ولاء ${money(summary.loyalty_allocated)}`} icon={<TrendingUp className="h-5 w-5" />} />
              <Metric title="منتجات مباعة" value={number(summary.products_sold)} hint={`صافي حركة ${number(summary.net_measure)} • ${range.label}`} icon={<ShoppingBasket className="h-5 w-5" />} />
              <Metric title="مرتجعات المنتجات" value={money(summary.returns)} hint={`${number(summary.products_returned)} منتج متأثر`} icon={<RotateCcw className="h-5 w-5" />} />
              <Metric title="خصومات السطور" value={money(summary.discounts)} hint={`خصم ولاء موزع ${money(summary.loyalty_allocated)}`} icon={<Boxes className="h-5 w-5" />} />
              {canProfit && <Metric title="صافي الربح" value={money(summary.net_profit)} hint={`هامش ${percent(summary.margin_percent)} • تكلفة ${money(summary.net_cogs)}`} icon={<CircleDollarSign className="h-5 w-5" />} />}
            </section>

            <Alert className={reconciled ? "border-emerald-200 bg-emerald-50/70 text-emerald-950" : "border-rose-200 bg-rose-50/70 text-rose-950"}>
              {reconciled ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              <AlertDescription>{reconciled ? `المطابقة المحاسبية سليمة: صافي المنتجات ${money(summary.net_revenue)} يطابق صافي POS المعتمد بفارق ${money(summary.reconciliation_difference)}.` : `يوجد فرق مطابقة بقيمة ${money(summary.reconciliation_difference)} بين تفاصيل المنتجات وصافي POS ويحتاج مراجعة.`}</AlertDescription>
            </Alert>

            {query.data?.data_quality.online_product_level_included === false && (
              <Alert><AlertDescription>تحليل مستوى الصنف هنا خاص بـPOS حاليًا؛ أصناف الأونلاين لم تُضم لأنها لا تملك بعد Cost Snapshot موحدًا، لذلك لم يتم اختلاق ربحية لها.</AlertDescription></Alert>
            )}

            <section className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
              <Card className="border-0 shadow-sm ring-1 ring-black/5">
                <CardHeader><CardTitle className="text-lg">الإيراد حسب القسم</CardTitle><p className="text-xs text-muted-foreground">صافي الإيراد بعد الولاء والمرتجعات المعتمدة.</p></CardHeader>
                <CardContent className="h-[340px] px-2 md:px-6"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} layout="vertical" margin={{ right: 16 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" fontSize={11} /><YAxis dataKey="label" type="category" width={120} fontSize={11} /><Tooltip formatter={(v) => money(Number(v))} /><Bar dataKey="net_revenue" name="صافي الإيراد" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></CardContent>
              </Card>

              <Card className="border-0 shadow-sm ring-1 ring-black/5">
                <CardHeader><CardTitle className="text-lg">توزيع طرق البيع</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between rounded-2xl bg-muted/60 p-4"><div><p className="font-semibold">وحدات</p><p className="text-xs text-muted-foreground">بيع بالقطعة</p></div><strong>{number(summary.unit_qty)}</strong></div>
                  <div className="flex items-center justify-between rounded-2xl bg-muted/60 p-4"><div><p className="font-semibold">جملة</p><p className="text-xs text-muted-foreground">Sale mode bulk</p></div><strong>{number(summary.bulk_qty)}</strong></div>
                  <div className="flex items-center justify-between rounded-2xl bg-muted/60 p-4"><div><p className="font-semibold">وزن</p><p className="text-xs text-muted-foreground">الكمية الموزونة</p></div><strong>{number(summary.weight_qty)}</strong></div>
                  <div className="rounded-2xl border p-4"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">الإيراد المعترف به قبل المرتجع</span><strong>{money(summary.recognized_revenue)}</strong></div><div className="mt-2 flex items-center justify-between"><span className="text-sm text-muted-foreground">المرتجعات</span><strong className="text-rose-700">-{money(summary.returns)}</strong></div></div>
                </CardContent>
              </Card>
            </section>

            <Card className="border-0 shadow-sm ring-1 ring-black/5">
              <CardHeader><CardTitle className="text-lg">تفصيل أداء المنتجات</CardTitle><p className="text-xs text-muted-foreground">{number(filteredProducts.length)} منتج مطابق للفلاتر الحالية.</p></CardHeader>
              <CardContent className="overflow-x-auto">
                {filteredProducts.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">لا توجد منتجات ضمن الفترة أو الفلاتر الحالية.</p> : (
                  <table className="w-full min-w-[1100px] text-sm"><thead><tr className="border-b text-muted-foreground"><th className="px-3 py-3 text-right">المنتج</th><th className="px-3 py-3 text-right">القسم</th><th className="px-3 py-3 text-left">فواتير</th><th className="px-3 py-3 text-left">صافي حركة</th><th className="px-3 py-3 text-left">إيراد</th><th className="px-3 py-3 text-left">مرتجع</th><th className="px-3 py-3 text-left">المساهمة</th>{canProfit && <><th className="px-3 py-3 text-left">الربح</th><th className="px-3 py-3 text-left">الهامش</th></>}</tr></thead><tbody>{filteredProducts.map((row) => <tr key={row.product_id} className="border-b last:border-0 hover:bg-muted/40"><td className="px-3 py-3"><div className="font-semibold">{row.product_name}</div><div className="mt-1 text-xs text-muted-foreground">{row.barcode || "بدون باركود"}</div></td><td className="px-3 py-3"><div>{row.category_name}</div><div className="text-xs text-muted-foreground">{row.subcategory_name}</div></td><td className="px-3 py-3 text-left">{number(row.invoices)}</td><td className="px-3 py-3 text-left">{number(row.net_measure)}</td><td className="px-3 py-3 text-left font-semibold">{money(row.net_revenue)}</td><td className="px-3 py-3 text-left text-rose-700">{money(row.returns)}</td><td className="px-3 py-3 text-left">{percent(row.contribution_percent)}</td>{canProfit && <><td className="px-3 py-3 text-left font-semibold">{money(row.net_profit)}</td><td className="px-3 py-3 text-left">{percent(row.margin_percent)}</td></>}</tr>)}</tbody></table>
                )}
              </CardContent>
            </Card>

            <section className="grid gap-5 xl:grid-cols-2">
              <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardHeader><CardTitle className="text-lg">بطيئة الحركة داخل الفترة</CardTitle></CardHeader><CardContent className="space-y-2">{query.data!.slow_movers.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">لا توجد حركة مبيعات في الفترة.</p> : query.data!.slow_movers.map((row) => <div key={row.product_id} className="flex items-center justify-between gap-4 rounded-2xl border p-4"><div><p className="font-semibold">{row.product_name}</p><p className="mt-1 text-xs text-muted-foreground">مخزون {number(row.stock_quantity)} • {number(row.invoices)} فاتورة</p></div><strong>{money(row.recognized_revenue)}</strong></div>)}</CardContent></Card>
              <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardHeader><CardTitle className="text-lg">مخزون بلا حركة</CardTitle><p className="text-xs text-muted-foreground">أعلى 30 صنفًا بالقيمة الشرائية ولم يتحرك في الفترة.</p></CardHeader><CardContent className="space-y-2">{query.data!.no_movement.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">لا توجد أصناف ساكنة ضمن المخزون الحالي.</p> : query.data!.no_movement.map((row) => <div key={row.product_id} className="flex items-center justify-between gap-4 rounded-2xl border p-4"><div><p className="font-semibold">{row.product_name}</p><p className="mt-1 text-xs text-muted-foreground">{row.category_name} • مخزون {number(row.stock_quantity)}</p></div><strong>{money(row.purchase_value)}</strong></div>)}</CardContent></Card>
            </section>
          </>
        )}
      </div>
    </MainLayout>
  );
}

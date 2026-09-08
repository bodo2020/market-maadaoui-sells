import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfDay, startOfMonth, subDays } from "date-fns";
import { AlertTriangle, Archive, Boxes, CalendarClock, ClipboardCheck, PackageMinus, RefreshCcw, ShoppingBag, TrendingUp } from "lucide-react";
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
import { fetchReportingInventoryV2, ReportingInventoryProductV2 } from "@/services/supabase/reportingInventoryV2Service";

type PeriodPreset = "today" | "7d" | "30d" | "month";

const money = (value: number | null | undefined) =>
  `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${siteConfig.currency}`;
const number = (value: number | null | undefined) => Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 3 });

const getRange = (preset: PeriodPreset) => {
  const now = new Date();
  if (preset === "today") return { from: startOfDay(now), to: now, label: "اليوم" };
  if (preset === "7d") return { from: startOfDay(subDays(now, 6)), to: now, label: "آخر 7 أيام" };
  if (preset === "month") return { from: startOfMonth(now), to: now, label: "هذا الشهر" };
  return { from: startOfDay(subDays(now, 29)), to: now, label: "آخر 30 يوم" };
};

function Metric({ title, value, hint, icon }: { title: string; value: string; hint: string; icon: React.ReactNode }) {
  return (
    <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-muted-foreground">{title}</p><p className="mt-2 text-2xl font-black tracking-tight">{value}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p></div><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div></div></CardContent></Card>
  );
}

function ProductList({ rows, empty, mode }: { rows: ReportingInventoryProductV2[]; empty: string; mode: "low" | "out" | "idle" | "cover" }) {
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  return <div className="space-y-2">{rows.map((row) => <div key={row.product_id} className="flex items-center justify-between gap-4 rounded-2xl border p-4"><div className="min-w-0"><p className="truncate font-semibold">{row.product_name}</p><p className="mt-1 text-xs text-muted-foreground">{row.category_name} • {row.barcode || "بدون باركود"}</p></div><div className="shrink-0 text-left"><strong>{number(row.quantity)}</strong>{mode === "low" && <p className="mt-1 text-xs text-muted-foreground">حد {number(row.threshold)}</p>}{mode === "idle" && <p className="mt-1 text-xs text-muted-foreground">{money(row.purchase_value)}</p>}{mode === "cover" && <p className="mt-1 text-xs text-muted-foreground">تغطية {number(row.days_cover)} يوم</p>}{mode === "out" && <p className="mt-1 text-xs text-rose-700">نافد</p>}</div></div>)}</div>;
}

export default function ReportsInventoryV2() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [period, setPeriod] = useState<PeriodPreset>("30d");
  const range = useMemo(() => getRange(period), [period]);

  const query = useQuery({
    queryKey: ["reporting-inventory-v2", currentBranchId, period],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchReportingInventoryV2(currentBranchId!, range.from, range.to),
    staleTime: 30_000,
  });

  const chartData = useMemo(() => (query.data?.categories || []).slice(0, 12).map((row) => ({ ...row, label: row.category_name.length > 18 ? `${row.category_name.slice(0, 18)}…` : row.category_name })), [query.data?.categories]);

  if (!currentBranchId) return <MainLayout><div className="mx-auto mt-16 max-w-xl"><Alert><AlertDescription>اختر فرعًا أولًا لعرض تقرير المخزون.</AlertDescription></Alert></div></MainLayout>;

  const summary = query.data?.summary;
  const stocktake = query.data?.stocktake;

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto w-full max-w-[1600px] space-y-5 py-5">
        <ReportsSectionNav />

        <section className="rounded-3xl border bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap gap-2"><Badge variant="secondary">Inventory V2</Badge><Badge variant="outline">{currentBranchName || "الفرع الحالي"}</Badge></div>
              <h1 className="text-2xl font-black md:text-3xl">صحة وقيمة المخزون</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Snapshot حي للمخزون الحالي مع حركة POS خلال الفترة المختارة، تنبيهات النفاد، التغطية، الصلاحية والجرد. قيمة المخزون لا تُعامل كمبيعات الفترة.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={period} onValueChange={(v) => setPeriod(v as PeriodPreset)}><SelectTrigger className="min-w-[170px] rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="today">اليوم</SelectItem><SelectItem value="7d">آخر 7 أيام</SelectItem><SelectItem value="30d">آخر 30 يوم</SelectItem><SelectItem value="month">هذا الشهر</SelectItem></SelectContent></Select>
              <Button variant="outline" className="rounded-xl" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCcw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث</Button>
            </div>
          </div>
        </section>

        {query.isLoading ? <div className="flex min-h-[420px] items-center justify-center"><BrandLoader size="lg" /></div> : query.isError || !summary || !stocktake ? (
          <Alert variant="destructive"><AlertDescription>تعذر تحميل تقرير المخزون. تأكد من صلاحية التقارير ثم أعد المحاولة.</AlertDescription></Alert>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <Metric title="قيمة الشراء الحالية" value={money(summary.purchase_value)} hint={`${number(summary.positive_stock_rows)} صف مخزون موجب`} icon={<Archive className="h-5 w-5" />} />
              <Metric title="قيمة البيع الحالية" value={money(summary.retail_value)} hint={`هامش محتمل ${money(summary.potential_margin_value)}`} icon={<TrendingUp className="h-5 w-5" />} />
              <Metric title="نافد من المخزون" value={number(summary.out_of_stock_rows)} hint={`من ${number(summary.inventory_rows)} صف مخزون`} icon={<PackageMinus className="h-5 w-5" />} />
              <Metric title="مخزون منخفض" value={number(summary.low_stock_rows)} hint={`${number(summary.overstock_rows)} أعلى من الحد الأقصى`} icon={<AlertTriangle className="h-5 w-5" />} />
              <Metric title="بدون حركة" value={number(summary.no_movement_rows)} hint={`حركة POS ${number(summary.period_pos_sold_measure)} خلال ${range.label}`} icon={<Boxes className="h-5 w-5" />} />
            </section>

            {!summary.stock_turnover_available && <Alert className="border-amber-200 bg-amber-50/70 text-amber-950"><AlertTriangle className="h-4 w-4" /><AlertDescription>Stock Turnover غير معروض عمدًا لأن متوسطات المخزون التاريخية الحديثة غير متاحة. لن يتم توليد نسبة تقديرية تبدو صحيحة وهي غير قابلة للمراجعة.</AlertDescription></Alert>}
            {query.data!.data_quality.damaged_products_included === false && <Alert><AlertDescription>التالف القديم غير داخل في KPI الفرع لأن مصدر `damaged_products` القديم غير مربوط بالفرع. سيظل مستبعدًا إلى أن يصبح مصدره branch-aware.</AlertDescription></Alert>}
            {summary.unlinked_inventory_rows > 0 && <Alert className="border-rose-200 bg-rose-50/70 text-rose-950"><AlertTriangle className="h-4 w-4" /><AlertDescription>هناك {number(summary.unlinked_inventory_rows)} صف مخزون غير مربوط بكتالوج منتج صالح، لذلك لا يدخل في تقييم الشراء/البيع الكامل ويحتاج تنظيف بيانات.</AlertDescription></Alert>}

            <section className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
              <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardHeader><CardTitle className="text-lg">قيمة المخزون حسب القسم</CardTitle><p className="text-xs text-muted-foreground">القيمة الشرائية الحالية، وليست إيراد مبيعات.</p></CardHeader><CardContent className="h-[350px] px-2 md:px-6"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} layout="vertical" margin={{ right: 16 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" fontSize={11} /><YAxis dataKey="label" type="category" width={120} fontSize={11} /><Tooltip formatter={(v) => money(Number(v))} /><Bar dataKey="purchase_value" name="قيمة الشراء" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></CardContent></Card>

              <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ClipboardCheck className="h-5 w-5" />ملخص الجرد في الفترة</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex items-center justify-between rounded-2xl bg-muted/60 p-4"><span className="text-sm text-muted-foreground">سجلات الجرد</span><strong>{number(stocktake.records)}</strong></div><div className="flex items-center justify-between rounded-2xl bg-muted/60 p-4"><span className="text-sm text-muted-foreground">أصناف تم عدّها</span><strong>{number(stocktake.products_counted)}</strong></div><div className="flex items-center justify-between rounded-2xl bg-muted/60 p-4"><span className="text-sm text-muted-foreground">فرق مطلق بالقيمة</span><strong>{money(stocktake.absolute_difference_value)}</strong></div><div className="flex items-center justify-between rounded-2xl border p-4"><span className="text-sm text-muted-foreground">آخر جرد</span><strong>{stocktake.latest_inventory_date ? new Date(`${stocktake.latest_inventory_date}T12:00:00`).toLocaleDateString("ar-EG") : "لا يوجد خلال الفترة"}</strong></div></CardContent></Card>
            </section>

            <section className="grid gap-5 xl:grid-cols-2">
              <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardHeader><CardTitle className="text-lg">مخزون منخفض</CardTitle><p className="text-xs text-muted-foreground">أكثر الحالات إلحاحًا مقارنة بحد إعادة الطلب.</p></CardHeader><CardContent><ProductList rows={query.data!.low_stock} empty="لا توجد حالات Low Stock ضمن النتائج الحالية." mode="low" /></CardContent></Card>
              <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardHeader><CardTitle className="text-lg">نافد من المخزون</CardTitle><p className="text-xs text-muted-foreground">أول 50 صنفًا نافدًا من مصدر المخزون الفعلي.</p></CardHeader><CardContent><ProductList rows={query.data!.out_of_stock} empty="لا توجد أصناف نافدة." mode="out" /></CardContent></Card>
              <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardHeader><CardTitle className="text-lg">بدون حركة</CardTitle><p className="text-xs text-muted-foreground">أعلى الأصناف الساكنة بالقيمة الشرائية.</p></CardHeader><CardContent><ProductList rows={query.data!.no_movement} empty="لا توجد أصناف ساكنة خلال الفترة." mode="idle" /></CardContent></Card>
              <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardHeader><CardTitle className="text-lg">خطر نفاد حسب التغطية</CardTitle><p className="text-xs text-muted-foreground">أصناف بتغطية 14 يومًا أو أقل وفق صافي حركة POS للفترة.</p></CardHeader><CardContent><ProductList rows={query.data!.coverage_risk} empty="لا توجد حالات تغطية أقل من 14 يومًا." mode="cover" /></CardContent></Card>
            </section>

            <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><CalendarClock className="h-5 w-5" />صلاحية خلال 30 يوم</CardTitle></CardHeader><CardContent className="overflow-x-auto">{query.data!.near_expiry.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">لا توجد دفعات قريبة الصلاحية ضمن 30 يومًا.</p> : <table className="w-full min-w-[800px] text-sm"><thead><tr className="border-b text-muted-foreground"><th className="px-3 py-3 text-right">المنتج</th><th className="px-3 py-3 text-right">الدفعة</th><th className="px-3 py-3 text-right">الصلاحية</th><th className="px-3 py-3 text-left">الأيام</th><th className="px-3 py-3 text-left">الكمية</th><th className="px-3 py-3 text-left">قيمة الشراء</th></tr></thead><tbody>{query.data!.near_expiry.map((row) => <tr key={row.batch_id} className="border-b last:border-0"><td className="px-3 py-3 font-semibold">{row.product_name}</td><td className="px-3 py-3">{row.batch_number || "—"}</td><td className="px-3 py-3">{row.expiry_date ? new Date(`${row.expiry_date}T12:00:00`).toLocaleDateString("ar-EG") : "—"}</td><td className="px-3 py-3 text-left">{number(row.days_to_expiry)}</td><td className="px-3 py-3 text-left">{number(row.quantity)}</td><td className="px-3 py-3 text-left">{money(row.purchase_value)}</td></tr>)}</tbody></table>}</CardContent></Card>

            <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ShoppingBag className="h-5 w-5" />الأقسام والمخزون</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b text-muted-foreground"><th className="px-3 py-3 text-right">القسم</th><th className="px-3 py-3 text-left">SKU</th><th className="px-3 py-3 text-left">متاح</th><th className="px-3 py-3 text-left">نافد</th><th className="px-3 py-3 text-left">قيمة الشراء</th><th className="px-3 py-3 text-left">قيمة البيع</th></tr></thead><tbody>{query.data!.categories.map((row) => <tr key={row.category_id} className="border-b last:border-0 hover:bg-muted/40"><td className="px-3 py-3 font-semibold">{row.category_name}</td><td className="px-3 py-3 text-left">{number(row.sku_rows)}</td><td className="px-3 py-3 text-left">{number(row.in_stock_rows)}</td><td className="px-3 py-3 text-left">{number(row.out_of_stock_rows)}</td><td className="px-3 py-3 text-left">{money(row.purchase_value)}</td><td className="px-3 py-3 text-left">{money(row.retail_value)}</td></tr>)}</tbody></table></CardContent></Card>
          </>
        )}
      </div>
    </MainLayout>
  );
}

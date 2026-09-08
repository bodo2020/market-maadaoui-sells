import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfDay, startOfMonth, subDays } from "date-fns";
import { AlertTriangle, BadgeCheck, CircleDollarSign, PackageCheck, RefreshCcw, Search, ShoppingCart, Truck, Users } from "lucide-react";
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
import { fetchReportingOnlineV2 } from "@/services/supabase/reportingOnlineV2Service";
import { useBranchStore } from "@/stores/branchStore";

type PeriodPreset = "today" | "7d" | "30d" | "month";

const money = (value: number | null | undefined) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${siteConfig.currency}`;
const number = (value: number | null | undefined) => Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
const percent = (value: number | null | undefined) => `${Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })}%`;

const getRange = (preset: PeriodPreset) => {
  const now = new Date();
  if (preset === "today") return { from: startOfDay(now), to: now, label: "اليوم" };
  if (preset === "7d") return { from: startOfDay(subDays(now, 6)), to: now, label: "آخر 7 أيام" };
  if (preset === "month") return { from: startOfMonth(now), to: now, label: "هذا الشهر" };
  return { from: startOfDay(subDays(now, 29)), to: now, label: "آخر 30 يوم" };
};

const statusLabel = (status: string) => ({
  pending: "جديد",
  confirmed: "مؤكد",
  preparing: "قيد التجهيز",
  ready: "جاهز",
  shipped: "خرج للتوصيل",
  delivered: "تم التوصيل",
  cancelled: "ملغي",
}[status] || status);

const paymentStatusLabel = (status: string) => ({
  pending: "بانتظار الدفع",
  paid: "مدفوع",
  failed: "فشل الدفع",
  refunded: "تم رد المبلغ",
}[status] || status);

function Metric({ title, value, hint, icon }: { title: string; value: string; hint: string; icon: React.ReactNode }) {
  return <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-muted-foreground">{title}</p><p className="mt-2 text-2xl font-black tracking-tight">{value}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p></div><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div></div></CardContent></Card>;
}

export default function ReportsOnlineV2() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [period, setPeriod] = useState<PeriodPreset>("30d");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const range = useMemo(() => getRange(period), [period]);

  const query = useQuery({
    queryKey: ["reporting-online-v2", currentBranchId, period],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchReportingOnlineV2(currentBranchId!, range.from, range.to, 200),
    staleTime: 30_000,
  });

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (query.data?.orders || []).filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!q) return true;
      return row.customer_name.toLowerCase().includes(q) || (row.customer_phone || "").toLowerCase().includes(q) || (row.tracking_number || "").toLowerCase().includes(q) || row.order_id.toLowerCase().includes(q);
    });
  }, [query.data?.orders, status, search]);

  const chartData = useMemo(() => (query.data?.daily || []).map((row) => ({ ...row, label: new Date(`${row.day}T12:00:00`).toLocaleDateString("ar-EG", { day: "numeric", month: "short" }) })), [query.data?.daily]);

  if (!currentBranchId) return <MainLayout><div className="mx-auto mt-16 max-w-xl"><Alert><AlertDescription>اختر فرعًا أولًا لعرض تقرير الطلبات الإلكترونية.</AlertDescription></Alert></div></MainLayout>;

  const summary = query.data?.summary;

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto w-full max-w-[1600px] space-y-5 py-5">
        <ReportsSectionNav />

        <section className="rounded-3xl border bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap gap-2"><Badge variant="secondary">Online V2</Badge><Badge variant="outline">{currentBranchName || "الفرع الحالي"}</Badge></div>
              <h1 className="text-2xl font-black md:text-3xl">الطلبات الإلكترونية والتوصيل</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">Current-state reporting للطلبات المنشأة داخل الفترة: الحالات الحالية، الدفع، قيمة الطلبات، الشحن والعملاء. الربحية وزمن التوصيل التاريخي غير معروضين حتى يكون المصدر قابلًا للمراجعة.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Select value={period} onValueChange={(value) => setPeriod(value as PeriodPreset)}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="today">اليوم</SelectItem><SelectItem value="7d">آخر 7 أيام</SelectItem><SelectItem value="30d">آخر 30 يوم</SelectItem><SelectItem value="month">هذا الشهر</SelectItem></SelectContent></Select>
              <Select value={status} onValueChange={setStatus}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل الحالات</SelectItem><SelectItem value="pending">جديد</SelectItem><SelectItem value="confirmed">مؤكد</SelectItem><SelectItem value="preparing">قيد التجهيز</SelectItem><SelectItem value="ready">جاهز</SelectItem><SelectItem value="shipped">خرج للتوصيل</SelectItem><SelectItem value="delivered">تم التوصيل</SelectItem><SelectItem value="cancelled">ملغي</SelectItem></SelectContent></Select>
              <div className="relative"><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="rounded-xl pr-9" placeholder="عميل / هاتف / تتبع" /></div>
              <Button variant="outline" className="rounded-xl" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCcw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث</Button>
            </div>
          </div>
        </section>

        {query.isLoading ? <div className="flex min-h-[420px] items-center justify-center"><BrandLoader size="lg" /></div> : query.isError || !summary ? (
          <Alert variant="destructive"><AlertDescription>تعذر تحميل تقرير الأونلاين. تأكد من صلاحية التقارير ثم أعد المحاولة.</AlertDescription></Alert>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
              <Metric title="طلبات الفترة" value={number(summary.order_count)} hint={`${number(summary.active_orders)} نشطة الآن`} icon={<ShoppingCart className="h-5 w-5" />} />
              <Metric title="قيمة الطلبات" value={money(summary.gross_order_value)} hint={`متوسط ${money(summary.average_order_value)}`} icon={<CircleDollarSign className="h-5 w-5" />} />
              <Metric title="تم التوصيل" value={number(summary.delivered_orders)} hint={`معدل ${percent(summary.delivery_rate_percent)} • ${money(summary.delivered_order_value)}`} icon={<PackageCheck className="h-5 w-5" />} />
              <Metric title="ملغي" value={number(summary.cancelled_orders)} hint={`معدل ${percent(summary.cancellation_rate_percent)} • ${money(summary.cancelled_order_value)}`} icon={<AlertTriangle className="h-5 w-5" />} />
              <Metric title="عملاء مرتبطون" value={number(summary.distinct_customers)} hint={`${number(summary.linked_customer_orders)} طلب مرتبط بعميل`} icon={<Users className="h-5 w-5" />} />
              <Metric title="الشحن المحمل" value={money(summary.shipping_charged)} hint={`للطلبات المُسلمة ${money(summary.delivered_shipping_charged)}`} icon={<Truck className="h-5 w-5" />} />
            </section>

            {query.data!.data_quality.profit_available === false && <Alert><AlertDescription>ربحية الأونلاين غير معروضة عمدًا: `online_orders.items` لا يملك حتى الآن Cost Snapshot موحدًا لكل صنف، لذلك لن نستخدم سعر الشراء الحالي أو هامشًا تقديريًا.</AlertDescription></Alert>}
            {query.data!.data_quality.delivery_duration_available === false && <Alert className="border-amber-200 bg-amber-50/70 text-amber-950"><AlertTriangle className="h-4 w-4" /><AlertDescription>Average Delivery Time غير معروض تاريخيًا لأن `order_status_history` القديم يحتوي على Bulk status rewrites؛ هنبدأ قياس SLA بمجرد تثبيت Timeline نظيف قابل للتدقيق.</AlertDescription></Alert>}

            <section className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
              <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardHeader><CardTitle className="text-lg">الطلبات حسب يوم الإنشاء</CardTitle><p className="text-xs text-muted-foreground">الحالة المعروضة هي الحالة الحالية للطلب داخل Cohort يوم إنشائه.</p></CardHeader><CardContent className="h-[330px] px-2 md:px-6"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Bar dataKey="orders" name="الطلبات" fill="hsl(var(--primary))" radius={[6,6,0,0]} /></BarChart></ResponsiveContainer></CardContent></Card>

              <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardHeader><CardTitle className="text-lg">الحالات الحالية</CardTitle></CardHeader><CardContent className="space-y-3">{query.data!.statuses.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">لا توجد طلبات في الفترة.</p> : query.data!.statuses.map((row) => <div key={row.status} className="flex items-center justify-between rounded-2xl border p-4"><div><p className="font-semibold">{statusLabel(row.status)}</p><p className="mt-1 text-xs text-muted-foreground">{money(row.order_value)}</p></div><Badge variant="secondary">{number(row.orders)}</Badge></div>)}</CardContent></Card>
            </section>

            <section className="grid gap-5 xl:grid-cols-2">
              <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><BadgeCheck className="h-5 w-5" />حالة الدفع</CardTitle></CardHeader><CardContent className="space-y-3">{query.data!.payment_statuses.map((row) => <div key={row.payment_status} className="flex items-center justify-between rounded-2xl bg-muted/50 p-4"><div><p className="font-semibold">{paymentStatusLabel(row.payment_status)}</p><p className="mt-1 text-xs text-muted-foreground">{money(row.order_value)}</p></div><strong>{number(row.orders)}</strong></div>)}</CardContent></Card>
              <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardHeader><CardTitle className="text-lg">وسائل الدفع</CardTitle></CardHeader><CardContent className="space-y-3">{query.data!.payment_methods.map((row) => <div key={row.payment_method} className="rounded-2xl border p-4"><div className="flex items-center justify-between"><strong>{row.payment_method}</strong><span>{number(row.orders)} طلب</span></div><div className="mt-2 flex items-center justify-between text-sm text-muted-foreground"><span>إجمالي {money(row.order_value)}</span><span>مسلم {money(row.delivered_value)}</span></div></div>)}</CardContent></Card>
            </section>

            <Card className="border-0 shadow-sm ring-1 ring-black/5">
              <CardHeader><CardTitle className="text-lg">الطلبات</CardTitle><p className="text-xs text-muted-foreground">{number(filteredOrders.length)} طلب مطابق للفلاتر الحالية.</p></CardHeader>
              <CardContent className="overflow-x-auto">
                {filteredOrders.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">لا توجد طلبات مطابقة.</p> : <table className="w-full min-w-[1150px] text-sm"><thead><tr className="border-b text-muted-foreground"><th className="px-3 py-3 text-right">العميل</th><th className="px-3 py-3 text-right">الحالة</th><th className="px-3 py-3 text-right">الدفع</th><th className="px-3 py-3 text-left">القيمة</th><th className="px-3 py-3 text-left">الشحن</th><th className="px-3 py-3 text-left">الأصناف</th><th className="px-3 py-3 text-right">العنوان</th><th className="px-3 py-3 text-right">وقت الطلب</th></tr></thead><tbody>{filteredOrders.map((row) => <tr key={row.order_id} className="border-b last:border-0 hover:bg-muted/40"><td className="px-3 py-3"><div className="font-semibold">{row.customer_name}</div><div className="mt-1 text-xs text-muted-foreground">{row.customer_phone || row.tracking_number || "—"}</div></td><td className="px-3 py-3"><Badge variant={row.status === "cancelled" ? "outline" : row.status === "delivered" ? "secondary" : "default"}>{statusLabel(row.status)}</Badge></td><td className="px-3 py-3"><div>{row.payment_method || "غير محدد"}</div><div className="text-xs text-muted-foreground">{paymentStatusLabel(row.payment_status)}</div></td><td className="px-3 py-3 text-left font-semibold">{money(row.total)}</td><td className="px-3 py-3 text-left">{money(row.shipping_cost)}</td><td className="px-3 py-3 text-left">{number(row.item_count)}</td><td className="max-w-[260px] truncate px-3 py-3">{row.shipping_address || "—"}</td><td className="px-3 py-3">{new Date(row.created_at).toLocaleString("ar-EG")}</td></tr>)}</tbody></table>}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  );
}

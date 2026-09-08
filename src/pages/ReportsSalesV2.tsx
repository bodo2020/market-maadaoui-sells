import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfDay, startOfMonth, subDays } from "date-fns";
import { Banknote, Filter, ReceiptText, RefreshCcw, RotateCcw, ShoppingCart, TrendingUp, Users } from "lucide-react";
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
import { fetchReportingSalesV2, ReportingSalesChannel } from "@/services/supabase/reportingSalesV2Service";

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
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReportsSalesV2() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [period, setPeriod] = useState<PeriodPreset>("30d");
  const [channel, setChannel] = useState<ReportingSalesChannel>("all");
  const [cashier, setCashier] = useState("all");
  const [payment, setPayment] = useState("all");
  const range = useMemo(() => getRange(period), [period]);

  const optionsQuery = useQuery({
    queryKey: ["reporting-sales-v2-options", currentBranchId, period],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchReportingSalesV2({ branchId: currentBranchId!, from: range.from, to: range.to }),
    staleTime: 60_000,
  });

  const query = useQuery({
    queryKey: ["reporting-sales-v2", currentBranchId, period, channel, cashier, payment],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchReportingSalesV2({
      branchId: currentBranchId!,
      from: range.from,
      to: range.to,
      channel,
      cashierId: cashier === "all" ? null : cashier,
      paymentCode: payment === "all" ? null : payment,
    }),
    staleTime: 30_000,
  });

  const summary = query.data?.summary;
  const hourly = useMemo(
    () => (query.data?.hourly || []).map((row) => ({ ...row, label: `${String(row.hour).padStart(2, "0")}:00` })),
    [query.data?.hourly],
  );

  if (!currentBranchId) {
    return <MainLayout><div className="mx-auto mt-16 max-w-xl"><Alert><AlertDescription>اختر فرعًا أولًا لعرض تقرير المبيعات.</AlertDescription></Alert></div></MainLayout>;
  }

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto w-full max-w-[1600px] space-y-5 py-5">
        <ReportsSectionNav />

        <section className="rounded-3xl border bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap gap-2"><Badge variant="secondary">Sales V2</Badge><Badge variant="outline">{currentBranchName || "الفرع الحالي"}</Badge></div>
              <h1 className="text-2xl font-black md:text-3xl">تقرير المبيعات</h1>
              <p className="mt-2 text-sm text-muted-foreground">تحليل POS والأونلاين حسب الوقت والكاشير ووسيلة الدفع، مع خصم المرتجعات المؤكدة.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <Select value={period} onValueChange={(v) => setPeriod(v as PeriodPreset)}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="today">اليوم</SelectItem><SelectItem value="7d">آخر 7 أيام</SelectItem><SelectItem value="30d">آخر 30 يوم</SelectItem><SelectItem value="month">هذا الشهر</SelectItem></SelectContent></Select>
              <Select value={channel} onValueChange={(v) => { setChannel(v as ReportingSalesChannel); if (v === "online") { setCashier("all"); setPayment("all"); } }}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل القنوات</SelectItem><SelectItem value="pos">POS فقط</SelectItem><SelectItem value="online">أونلاين فقط</SelectItem></SelectContent></Select>
              <Select value={cashier} onValueChange={setCashier} disabled={channel === "online"}><SelectTrigger className="rounded-xl"><SelectValue placeholder="الكاشير" /></SelectTrigger><SelectContent><SelectItem value="all">كل الكاشيرين</SelectItem>{(optionsQuery.data?.cashiers || []).filter((x) => x.cashier_id).map((x) => <SelectItem key={x.cashier_id!} value={x.cashier_id!}>{x.cashier_name}</SelectItem>)}</SelectContent></Select>
              <Select value={payment} onValueChange={setPayment} disabled={channel === "online"}><SelectTrigger className="rounded-xl"><SelectValue placeholder="وسيلة الدفع" /></SelectTrigger><SelectContent><SelectItem value="all">كل وسائل الدفع</SelectItem>{(optionsQuery.data?.payments || []).map((x) => <SelectItem key={x.code} value={x.code}>{x.name}</SelectItem>)}</SelectContent></Select>
              <Button variant="outline" className="rounded-xl" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCcw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث</Button>
            </div>
          </div>
        </section>

        {query.isLoading ? <div className="flex min-h-[420px] items-center justify-center"><BrandLoader size="lg" /></div> : query.isError || !summary ? (
          <Alert variant="destructive"><AlertDescription>تعذر تحميل تقرير المبيعات. تأكد من صلاحية التقارير وحاول مرة أخرى.</AlertDescription></Alert>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <Metric title="صافي المبيعات" value={money(summary.net_sales)} hint={`${number(summary.transactions)} عملية`} icon={<TrendingUp className="h-5 w-5" />} />
              <Metric title="إجمالي المبيعات" value={money(summary.gross_sales)} hint={`POS ${money(summary.pos_sales)} • أونلاين ${money(summary.online_sales)}`} icon={<ShoppingCart className="h-5 w-5" />} />
              <Metric title="متوسط الفاتورة" value={money(summary.average_ticket)} hint="بعد المرتجعات المؤكدة" icon={<ReceiptText className="h-5 w-5" />} />
              <Metric title="المرتجعات" value={money(summary.refunds)} hint={`${number(summary.return_count)} مرتجع`} icon={<RotateCcw className="h-5 w-5" />} />
              <Metric title="خصومات وولاء" value={money(summary.product_discounts + summary.loyalty_discounts)} hint={`رسوم منشأة ${money(summary.merchant_payment_fees)}`} icon={<Filter className="h-5 w-5" />} />
            </section>

            <section className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
              <Card className="border-0 shadow-sm ring-1 ring-black/5">
                <CardHeader><CardTitle className="text-lg">المبيعات حسب الساعة</CardTitle><p className="text-xs text-muted-foreground">يساعدك على معرفة ساعات الذروة الفعلية خلال الفترة المختارة.</p></CardHeader>
                <CardContent className="h-[330px] px-2 md:px-6">
                  <ResponsiveContainer width="100%" height="100%"><BarChart data={hourly}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" fontSize={11} interval={2} /><YAxis fontSize={11} /><Tooltip formatter={(v) => money(Number(v))} /><Bar dataKey="net_sales" name="صافي المبيعات" fill="hsl(var(--primary))" radius={[6,6,0,0]} /></BarChart></ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm ring-1 ring-black/5">
                <CardHeader><CardTitle className="text-lg">قنوات البيع</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl bg-muted/60 p-4"><div className="flex items-center justify-between"><span className="flex items-center gap-2 font-semibold"><ReceiptText className="h-4 w-4" />POS</span><strong>{money(summary.pos_sales)}</strong></div><p className="mt-1 text-xs text-muted-foreground">{number(summary.pos_transactions)} فاتورة</p></div>
                  <div className="rounded-2xl bg-muted/60 p-4"><div className="flex items-center justify-between"><span className="flex items-center gap-2 font-semibold"><ShoppingCart className="h-4 w-4" />أونلاين</span><strong>{money(summary.online_sales)}</strong></div><p className="mt-1 text-xs text-muted-foreground">{number(summary.online_transactions)} طلب مكتمل ومدفوع</p></div>
                  <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4"><div className="flex items-center justify-between"><span className="flex items-center gap-2 font-semibold text-rose-800"><RotateCcw className="h-4 w-4" />مرتجعات</span><strong className="text-rose-800">-{money(summary.refunds)}</strong></div></div>
                </CardContent>
              </Card>
            </section>

            <section className="grid gap-5 xl:grid-cols-2">
              <Card className="border-0 shadow-sm ring-1 ring-black/5">
                <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5" />أداء الكاشير</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {(query.data?.cashiers || []).length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">لا توجد مبيعات POS ضمن الفلاتر الحالية.</p> : query.data!.cashiers.map((row, index) => (
                    <div key={row.cashier_id || `${row.cashier_name}-${index}`} className="flex items-center justify-between gap-4 rounded-2xl border p-4">
                      <div><p className="font-bold">{index + 1}. {row.cashier_name}</p><p className="mt-1 text-xs text-muted-foreground">{number(row.invoices)} فاتورة • متوسط {money(row.average_ticket)} • {number(row.returns)} مرتجع</p></div>
                      <div className="text-left"><p className="font-black">{money(row.net_sales)}</p>{row.refunds > 0 && <p className="text-xs text-rose-600">مرتجع -{money(row.refunds)}</p>}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm ring-1 ring-black/5">
                <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Banknote className="h-5 w-5" />وسائل الدفع</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {(query.data?.payments || []).map((row) => (
                    <div key={row.code} className="rounded-2xl border p-4">
                      <div className="flex items-center justify-between gap-3"><div><p className="font-bold">{row.name}</p><p className="text-xs text-muted-foreground">{number(row.transactions)} عملية • {row.method_type}</p></div><strong>{money(row.net_collected)}</strong></div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground"><span>محصل {money(row.gross_collected)}</span><span>مرتجع {money(row.refunds)}</span><span>رسوم {money(row.merchant_fees)}</span></div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>

            <Card className="border-0 shadow-sm ring-1 ring-black/5">
              <CardHeader><CardTitle className="text-lg">أحدث العمليات</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead><tr className="border-b text-muted-foreground"><th className="px-3 py-3 text-right">المرجع</th><th className="px-3 py-3 text-right">القناة</th><th className="px-3 py-3 text-right">الكاشير/المصدر</th><th className="px-3 py-3 text-right">الدفع</th><th className="px-3 py-3 text-right">التاريخ</th><th className="px-3 py-3 text-left">المبلغ</th></tr></thead>
                  <tbody>{(query.data?.recent || []).map((row) => <tr key={`${row.channel}-${row.entity_id}`} className="border-b last:border-0"><td className="px-3 py-3 font-mono text-xs">{row.reference}</td><td className="px-3 py-3"><Badge variant="outline">{row.channel === "pos" ? "POS" : "أونلاين"}</Badge></td><td className="px-3 py-3">{row.actor_name}</td><td className="px-3 py-3">{row.payment_name}</td><td className="px-3 py-3 text-muted-foreground">{new Date(row.occurred_at).toLocaleString("ar-EG")}</td><td className="px-3 py-3 text-left font-bold">{money(row.amount)}</td></tr>)}</tbody>
                </table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  );
}

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfDay, startOfMonth, subDays } from "date-fns";
import { Banknote, CreditCard, Landmark, RefreshCcw, RotateCcw, WalletCards } from "lucide-react";
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
import { fetchReportingPaymentsV2, ReportingPaymentMethodV2 } from "@/services/supabase/reportingPaymentsV2Service";

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

const methodIcon = (method: ReportingPaymentMethodV2) => {
  if (method.method_type === "cash") return <Banknote className="h-5 w-5" />;
  if (method.method_type === "card") return <CreditCard className="h-5 w-5" />;
  return <WalletCards className="h-5 w-5" />;
};

const feeLabel = (method: ReportingPaymentMethodV2) => {
  if (!method.fee_type || method.fee_type === "none" || !method.fee_value) return "بدون عمولة إعداد";
  const value = method.fee_type === "percent" ? `${number(method.fee_value)}%` : money(method.fee_value);
  const bearer = method.fee_bearer === "customer" ? "على العميل" : "على المنشأة";
  return `${value} • ${bearer}`;
};

export default function ReportsPaymentsV2() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [period, setPeriod] = useState<PeriodPreset>("30d");
  const range = useMemo(() => getRange(period), [period]);

  const query = useQuery({
    queryKey: ["reporting-payments-v2", currentBranchId, period],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchReportingPaymentsV2(currentBranchId!, range.from, range.to),
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
    return <MainLayout><div className="mx-auto mt-16 max-w-xl"><Alert><AlertDescription>اختر فرعًا أولًا لعرض تقرير وسائل الدفع.</AlertDescription></Alert></div></MainLayout>;
  }

  const summary = query.data?.summary;
  const canFinance = Boolean(query.data?.permissions.can_view_finance);

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto w-full max-w-[1600px] space-y-5 py-5">
        <ReportsSectionNav />

        <section className="rounded-3xl border bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap gap-2"><Badge variant="secondary">Payments V2</Badge><Badge variant="outline">{currentBranchName || "الفرع الحالي"}</Badge></div>
              <h1 className="text-2xl font-black md:text-3xl">وسائل الدفع والتسويات</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                التحصيل والعمولات والمرتجعات والحركة الصافية لكل وسيلة. أرصدة الحسابات الحية منفصلة عن أرقام الفترة حتى لا تختلط المبيعات بالتسويات.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={period} onValueChange={(value) => setPeriod(value as PeriodPreset)}>
                <SelectTrigger className="min-w-[170px] rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">اليوم</SelectItem><SelectItem value="7d">آخر 7 أيام</SelectItem><SelectItem value="30d">آخر 30 يوم</SelectItem><SelectItem value="month">هذا الشهر</SelectItem>
                </SelectContent>
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
          <Alert variant="destructive"><AlertDescription>تعذر تحميل تقرير وسائل الدفع. تأكد من صلاحية التقارير ثم أعد المحاولة.</AlertDescription></Alert>
        ) : (
          <>
            <section className={`grid gap-4 sm:grid-cols-2 ${canFinance ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>
              <Metric title="إجمالي المحصل" value={money(summary.gross_collected)} hint={`${number(summary.transactions)} عملية خلال ${range.label}`} icon={<WalletCards className="h-5 w-5" />} />
              <Metric title="الحركة الصافية للفترة" value={money(summary.net_period_movement)} hint="المحصل − رسوم الدفع − المرتجعات المكتملة" icon={<Landmark className="h-5 w-5" />} />
              <Metric title="المرتجعات" value={money(summary.refunds)} hint={`${number(summary.refund_count)} عملية • معلق ${money(summary.pending_refund_amount)}`} icon={<RotateCcw className="h-5 w-5" />} />
              <Metric title="رسوم وسائل الدفع" value={money(summary.payment_fees)} hint={`على المنشأة ${money(summary.merchant_fees)} • على العميل ${money(summary.customer_fees)}`} icon={<CreditCard className="h-5 w-5" />} />
              {canFinance && <Metric title="الرصيد الإلكتروني الحي" value={money(summary.live_electronic_balance)} hint="رصيد Ledger الحالي وليس مبيعات الفترة" icon={<Banknote className="h-5 w-5" />} />}
            </section>

            {summary.pending_refund_count > 0 && (
              <Alert className="border-amber-200 bg-amber-50/80 text-amber-950"><AlertDescription>هناك {number(summary.pending_refund_count)} عملية رد إلكتروني معلقة بقيمة {money(summary.pending_refund_amount)} وتحتاج متابعة تشغيلية.</AlertDescription></Alert>
            )}

            <Card className="border-0 shadow-sm ring-1 ring-black/5">
              <CardHeader><CardTitle className="text-lg">حركة التحصيل خلال الفترة</CardTitle><p className="text-xs text-muted-foreground">إجمالي التحصيل مقابل الحركة الصافية بعد الرسوم والمرتجعات.</p></CardHeader>
              <CardContent className="h-[330px] px-2 md:px-6">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" fontSize={11} /><YAxis fontSize={11} /><Tooltip formatter={(value) => money(Number(value))} />
                    <Area type="monotone" dataKey="gross_collected" name="المحصل" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.12} />
                    <Area type="monotone" dataKey="net_movement" name="الحركة الصافية" stroke="hsl(var(--foreground))" fill="hsl(var(--foreground))" fillOpacity={0.04} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <section className="space-y-3">
              <div><h2 className="text-lg font-black">تفصيل وسائل الدفع</h2><p className="text-xs text-muted-foreground">يشمل الوسائل المستخدمة خلال الفترة والوسائل المفعلة في إعدادات الفرع.</p></div>
              <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {query.data!.methods.map((method) => (
                  <Card key={method.code} className="border-0 shadow-sm ring-1 ring-black/5">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">{methodIcon(method)}</div>
                          <div><p className="font-black">{method.name}</p><p className="mt-1 text-xs text-muted-foreground">{feeLabel(method)}</p></div>
                        </div>
                        <Badge variant={method.active ? "secondary" : "outline"}>{method.active ? "مفعلة" : "غير مفعلة"}</Badge>
                      </div>
                      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl bg-muted/60 p-3"><p className="text-xs text-muted-foreground">المحصل</p><strong className="mt-1 block">{money(method.gross_collected)}</strong><p className="mt-1 text-xs text-muted-foreground">{number(method.transactions)} عملية</p></div>
                        <div className="rounded-xl bg-muted/60 p-3"><p className="text-xs text-muted-foreground">الحركة الصافية</p><strong className="mt-1 block">{money(method.net_period_movement)}</strong><p className="mt-1 text-xs text-muted-foreground">مرتجع {money(method.refunds)}</p></div>
                        <div className="rounded-xl bg-muted/60 p-3"><p className="text-xs text-muted-foreground">رسوم فعلية</p><strong className="mt-1 block">{money(method.payment_fees)}</strong><p className="mt-1 text-xs text-muted-foreground">منشأة {money(method.merchant_fees)}</p></div>
                        <div className="rounded-xl bg-muted/60 p-3"><p className="text-xs text-muted-foreground">ردود معلقة</p><strong className="mt-1 block">{money(method.pending_refund_amount)}</strong><p className="mt-1 text-xs text-muted-foreground">{number(method.pending_refund_count)} مهمة</p></div>
                      </div>
                      {canFinance && method.live_account_balance !== null && (
                        <div className="mt-3 flex items-center justify-between rounded-xl border p-3 text-sm"><span className="text-muted-foreground">الرصيد الحي غير المسوى</span><strong>{money(method.unsettled_balance)}</strong></div>
                      )}
                      {canFinance && method.settlement_count !== null && (
                        <div className="mt-2 flex items-center justify-between px-1 text-xs text-muted-foreground"><span>تسويات الفترة: {number(method.settlement_count)}</span><span>صافي مسوى: {money(method.settled_net)}</span></div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            {canFinance && (
              <Card className="border-0 shadow-sm ring-1 ring-black/5">
                <CardHeader><CardTitle className="text-lg">آخر التسويات في الفترة</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  {query.data!.recent_settlements.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">لا توجد تسويات مسجلة في الفترة المختارة.</p> : (
                    <table className="w-full min-w-[760px] text-sm">
                      <thead><tr className="border-b text-muted-foreground"><th className="px-3 py-3 text-right">الوسيلة</th><th className="px-3 py-3 text-right">المرجع</th><th className="px-3 py-3 text-right">التاريخ</th><th className="px-3 py-3 text-left">إجمالي</th><th className="px-3 py-3 text-left">رسوم</th><th className="px-3 py-3 text-left">صافي</th></tr></thead>
                      <tbody>{query.data!.recent_settlements.map((row) => <tr key={row.id} className="border-b last:border-0"><td className="px-3 py-3 font-semibold">{row.payment_method}</td><td className="px-3 py-3 font-mono text-xs">{row.provider_reference || "—"}</td><td className="px-3 py-3 text-muted-foreground">{row.settled_at ? new Date(row.settled_at).toLocaleString("ar-EG") : "—"}</td><td className="px-3 py-3 text-left">{money(row.gross_amount)}</td><td className="px-3 py-3 text-left">{money(row.fee_amount)}</td><td className="px-3 py-3 text-left font-bold">{money(row.net_amount)}</td></tr>)}</tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}

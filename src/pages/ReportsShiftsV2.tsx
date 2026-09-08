import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfDay, startOfMonth, subDays } from "date-fns";
import {
  AlertTriangle,
  Banknote,
  Clock,
  CreditCard,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldCheck,
  Store,
  UserRoundCheck,
  Users,
  WalletCards,
} from "lucide-react";
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
import { fetchReportingShiftsV2 } from "@/services/supabase/reportingShiftsV2Service";
import { useBranchStore } from "@/stores/branchStore";

type PeriodPreset = "today" | "7d" | "30d" | "month";
type ShiftStatus = "all" | "open" | "closed";

const money = (value: number | null | undefined) =>
  `${Number(value || 0).toLocaleString("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${siteConfig.currency}`;

const number = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });

const percent = (value: number | null | undefined) =>
  `${Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })}%`;

const duration = (minutes: number | null | undefined) => {
  const value = Math.max(0, Number(minutes || 0));
  const hours = Math.floor(value / 60);
  const mins = Math.round(value % 60);
  if (!hours) return `${mins} د`;
  return `${hours} س ${mins} د`;
};

const getRange = (preset: PeriodPreset) => {
  const now = new Date();
  if (preset === "today") return { from: startOfDay(now), to: now, label: "اليوم" };
  if (preset === "7d") return { from: startOfDay(subDays(now, 6)), to: now, label: "آخر 7 أيام" };
  if (preset === "month") return { from: startOfMonth(now), to: now, label: "هذا الشهر" };
  return { from: startOfDay(subDays(now, 29)), to: now, label: "آخر 30 يوم" };
};

function Metric({
  title,
  value,
  hint,
  icon,
}: {
  title: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border-0 shadow-sm ring-1 ring-black/5">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-2 text-2xl font-black tracking-tight">{value}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const shiftStatusLabel = (status: string) => (status === "open" ? "مفتوحة" : "مغلقة");

export default function ReportsShiftsV2() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [period, setPeriod] = useState<PeriodPreset>("30d");
  const [status, setStatus] = useState<ShiftStatus>("all");
  const [cashier, setCashier] = useState("all");
  const [search, setSearch] = useState("");
  const range = useMemo(() => getRange(period), [period]);

  const query = useQuery({
    queryKey: ["reporting-shifts-v2", currentBranchId, period],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchReportingShiftsV2(currentBranchId!, range.from, range.to, 200),
    staleTime: 30_000,
  });

  const filteredShifts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (query.data?.shifts || []).filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (cashier !== "all" && row.cashier_id !== cashier) return false;
      if (!q) return true;
      return (
        row.cashier_name.toLowerCase().includes(q) ||
        row.device_name.toLowerCase().includes(q) ||
        (row.device_code || "").toLowerCase().includes(q)
      );
    });
  }, [query.data?.shifts, status, cashier, search]);

  if (!currentBranchId) {
    return (
      <MainLayout>
        <div className="mx-auto mt-16 max-w-xl">
          <Alert><AlertDescription>اختر فرعًا أولًا لعرض تقرير الكاشير والورديات.</AlertDescription></Alert>
        </div>
      </MainLayout>
    );
  }

  const summary = query.data?.summary;
  const canCashControl = Boolean(query.data?.permissions.can_view_cash_control);
  const hasLegacyGap = Number(summary?.payment_legacy_gap || 0) > 0.005;
  const electronicActualUnavailable = query.data?.data_quality.electronic_actual_available === false;

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto w-full max-w-[1650px] space-y-5 py-5">
        <ReportsSectionNav />

        <section className="rounded-3xl border bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap gap-2">
                <Badge variant="secondary">Shifts V2</Badge>
                <Badge variant="outline">{currentBranchName || "الفرع الحالي"}</Badge>
              </div>
              <h1 className="text-2xl font-black md:text-3xl">الكاشير والورديات</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
                أداء الكاشير، الفواتير والمرتجعات داخل الفترة، تغطية سجلات الدفع، ومطابقة النقدية عند إغلاق الوردية. الوردية العابرة لحدود الفترة تظهر، لكن حركة البيع والمرتجع تُحسب داخل الفترة فقط.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              <Select value={period} onValueChange={(value) => setPeriod(value as PeriodPreset)}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">اليوم</SelectItem>
                  <SelectItem value="7d">آخر 7 أيام</SelectItem>
                  <SelectItem value="30d">آخر 30 يوم</SelectItem>
                  <SelectItem value="month">هذا الشهر</SelectItem>
                </SelectContent>
              </Select>

              <Select value={status} onValueChange={(value) => setStatus(value as ShiftStatus)}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الورديات</SelectItem>
                  <SelectItem value="open">المفتوحة</SelectItem>
                  <SelectItem value="closed">المغلقة</SelectItem>
                </SelectContent>
              </Select>

              <Select value={cashier} onValueChange={setCashier}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="الكاشير" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الكاشير</SelectItem>
                  {(query.data?.cashiers || []).map((row) => (
                    <SelectItem key={row.cashier_id} value={row.cashier_id}>{row.cashier_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="relative">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} className="rounded-xl pr-9" placeholder="كاشير أو جهاز" />
              </div>

              <Button variant="outline" className="rounded-xl" onClick={() => query.refetch()} disabled={query.isFetching}>
                <RefreshCcw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
                تحديث
              </Button>
            </div>
          </div>
        </section>

        {query.isLoading ? (
          <div className="flex min-h-[420px] items-center justify-center"><BrandLoader size="lg" /></div>
        ) : query.isError || !summary ? (
          <Alert variant="destructive"><AlertDescription>تعذر تحميل تقرير الورديات. تأكد من صلاحية التقارير ثم أعد المحاولة.</AlertDescription></Alert>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
              <Metric title="صافي مبيعات الورديات" value={money(summary.net_sales)} hint={`${number(summary.invoice_count)} فاتورة • مرتجعات ${money(summary.approved_returns)}`} icon={<Banknote className="h-5 w-5" />} />
              <Metric title="متوسط الفاتورة" value={money(summary.average_ticket)} hint={`إجمالي قبل المرتجع ${money(summary.recognized_sales)}`} icon={<Store className="h-5 w-5" />} />
              <Metric title="الورديات" value={number(summary.overlapping_shifts)} hint={`${number(summary.open_now)} مفتوحة الآن • ${number(summary.shifts_closed_in_range)} أُغلقت بالفترة`} icon={<Clock className="h-5 w-5" />} />
              <Metric title="الكاشير" value={number(summary.cashiers)} hint={`${number(summary.devices)} جهاز POS`} icon={<Users className="h-5 w-5" />} />
              <Metric title="تغطية سجل الدفع" value={percent(summary.payment_coverage_percent)} hint={`${money(summary.recorded_payment_base)} مسجل • Gap ${money(summary.payment_legacy_gap)}`} icon={<WalletCards className="h-5 w-5" />} />
              <Metric title="ردود إلكترونية مؤكدة" value={money(summary.confirmed_electronic_refunds)} hint={`معلق ${money(summary.pending_electronic_refunds)}`} icon={<RotateCcw className="h-5 w-5" />} />
            </section>

            {canCashControl && (
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric title="ورديات بفارق نقدي" value={number(summary.variance_shifts)} hint={`من ${number(summary.closed_reconciliations)} إغلاق مسجل`} icon={<AlertTriangle className="h-5 w-5" />} />
                <Metric title="إجمالي الفرق المطلق" value={money(summary.cash_variance_absolute)} hint="مجموع العجز والزيادة بدون إلغاء بعضهما" icon={<Banknote className="h-5 w-5" />} />
                <Metric title="صافي فرق النقدية" value={money(summary.cash_variance_signed)} hint="موجب = زيادة • سالب = عجز" icon={<ShieldCheck className="h-5 w-5" />} />
                <Metric title="فرق افتتاح الورديات" value={money(summary.opening_variance_absolute)} hint="إجمالي الفروق المطلقة وقت الافتتاح" icon={<UserRoundCheck className="h-5 w-5" />} />
              </section>
            )}

            {hasLegacyGap && (
              <Alert className="border-amber-200 bg-amber-50/70 text-amber-950">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  يوجد {money(summary.payment_legacy_gap)} من فواتير الفترة أقدم من تغطية Payment Ledger الحديثة. المبيعات نفسها مأخوذة من Invoice V2 وتظل معتمدة؛ نسبة التغطية توضح فقط جودة تاريخ بيانات الدفع ولا تُخصم من المبيعات.
                </AlertDescription>
              </Alert>
            )}

            {electronicActualUnavailable && (
              <Alert>
                <CreditCard className="h-4 w-4" />
                <AlertDescription>
                  المبالغ الفعلية المعدودة لكل وسيلة إلكترونية غير محفوظة تاريخيًا حتى الآن. لذلك يعرض التقرير Expected/Recorded للبطاقات والمحافظ ولا يخترع Actual أو Variance إلكتروني. النقدية فقط لها Counted فعلي محفوظ عند إغلاق الوردية.
                </AlertDescription>
              </Alert>
            )}

            {(query.data?.data_quality.unassigned_invoice_count || 0) > 0 && (
              <Alert className="border-rose-200 bg-rose-50/70 text-rose-950">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  يوجد {number(query.data?.data_quality.unassigned_invoice_count)} فاتورة بقيمة {money(query.data?.data_quality.unassigned_invoice_amount)} داخل الفترة بدون Shift ID، لذلك لا تدخل في أداء كاشير بعينه.
                </AlertDescription>
              </Alert>
            )}

            <section className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
              <Card className="border-0 shadow-sm ring-1 ring-black/5">
                <CardHeader>
                  <CardTitle className="text-lg">أداء الكاشير</CardTitle>
                  <p className="text-xs text-muted-foreground">مبيعات ومرتجعات وساعات الوردية وتغطية بيانات الدفع لكل موظف.</p>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {(query.data?.cashiers || []).length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">لا توجد ورديات في الفترة.</p>
                  ) : (
                    <table className="w-full min-w-[950px] text-sm">
                      <thead><tr className="border-b text-muted-foreground"><th className="px-3 py-3 text-right">الكاشير</th><th className="px-3 py-3 text-left">ورديات</th><th className="px-3 py-3 text-left">ساعات</th><th className="px-3 py-3 text-left">فواتير</th><th className="px-3 py-3 text-left">صافي المبيعات</th><th className="px-3 py-3 text-left">متوسط الفاتورة</th><th className="px-3 py-3 text-left">مبيعات/ساعة</th><th className="px-3 py-3 text-left">تغطية الدفع</th>{canCashControl && <th className="px-3 py-3 text-left">فرق نقدي مطلق</th>}</tr></thead>
                      <tbody>
                        {query.data!.cashiers.map((row) => (
                          <tr key={row.cashier_id} className="border-b last:border-0 hover:bg-muted/40">
                            <td className="px-3 py-3"><div className="font-semibold">{row.cashier_name}</div><div className="mt-1 text-xs text-muted-foreground">{number(row.open_shifts)} مفتوحة • {number(row.closed_shifts)} مغلقة</div></td>
                            <td className="px-3 py-3 text-left">{number(row.shift_count)}</td>
                            <td className="px-3 py-3 text-left">{duration(row.duration_minutes)}</td>
                            <td className="px-3 py-3 text-left">{number(row.invoice_count)}</td>
                            <td className="px-3 py-3 text-left font-semibold">{money(row.net_sales)}</td>
                            <td className="px-3 py-3 text-left">{money(row.average_ticket)}</td>
                            <td className="px-3 py-3 text-left">{money(row.sales_per_hour)}</td>
                            <td className="px-3 py-3 text-left"><Badge variant={row.payment_coverage_percent >= 99.99 ? "secondary" : "outline"}>{percent(row.payment_coverage_percent)}</Badge></td>
                            {canCashControl && <td className="px-3 py-3 text-left">{money(row.cash_variance_absolute)}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm ring-1 ring-black/5">
                <CardHeader><CardTitle className="text-lg">وسائل الدفع داخل الورديات</CardTitle><p className="text-xs text-muted-foreground">Invoice amount مقابل السجلات الحديثة المتاحة.</p></CardHeader>
                <CardContent className="space-y-3">
                  {(query.data?.payment_methods || []).length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">لا توجد مدفوعات داخل ورديات الفترة.</p> : query.data!.payment_methods.map((method) => (
                    <div key={`${method.payment_method_id || "legacy"}-${method.code}`} className="rounded-2xl border p-4">
                      <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{method.name}</p><p className="mt-1 text-xs text-muted-foreground">{number(method.invoice_count)} فاتورة • {method.method_type}</p></div><Badge variant={method.coverage_percent >= 99.99 ? "secondary" : "outline"}>{percent(method.coverage_percent)}</Badge></div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">قيمة الفواتير</p><strong>{money(method.invoice_amount)}</strong></div><div><p className="text-xs text-muted-foreground">مسجل بالدفع</p><strong>{money(method.recorded_payment_base)}</strong></div><div><p className="text-xs text-muted-foreground">Merchant fees</p><strong>{money(method.merchant_fee_amount)}</strong></div><div><p className="text-xs text-muted-foreground">Legacy gap</p><strong className={method.legacy_gap > 0.005 ? "text-amber-700" : ""}>{money(method.legacy_gap)}</strong></div></div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>

            <Card className="border-0 shadow-sm ring-1 ring-black/5">
              <CardHeader>
                <CardTitle className="text-lg">الورديات</CardTitle>
                <p className="text-xs text-muted-foreground">{number(filteredShifts.length)} وردية مطابقة للفلاتر الحالية.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {filteredShifts.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">لا توجد ورديات مطابقة للفلاتر.</p>
                ) : filteredShifts.map((shift) => (
                  <details key={shift.shift_id} className="group rounded-2xl border bg-background">
                    <summary className="cursor-pointer list-none p-4 md:p-5">
                      <div className="grid gap-4 md:grid-cols-[1.25fr_.8fr_.8fr_.8fr_.8fr] md:items-center">
                        <div><div className="flex flex-wrap items-center gap-2"><strong>{shift.cashier_name}</strong><Badge variant={shift.status === "open" ? "default" : "secondary"}>{shiftStatusLabel(shift.status)}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{shift.device_name} {shift.device_code ? `• ${shift.device_code}` : ""} • {new Date(shift.opened_at).toLocaleString("ar-EG")}</p></div>
                        <div><p className="text-xs text-muted-foreground">صافي المبيعات</p><strong>{money(shift.net_sales)}</strong></div>
                        <div><p className="text-xs text-muted-foreground">الفواتير</p><strong>{number(shift.invoice_count)}</strong></div>
                        <div><p className="text-xs text-muted-foreground">تغطية الدفع</p><strong>{percent(shift.payment_coverage_percent)}</strong></div>
                        <div><p className="text-xs text-muted-foreground">المدة بالفترة</p><strong>{duration(shift.duration_minutes_in_range)}</strong></div>
                      </div>
                    </summary>
                    <div className="border-t p-4 md:p-5">
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">المبيعات قبل المرتجع</p><strong>{money(shift.recognized_sales)}</strong><p className="mt-1 text-xs text-muted-foreground">متوسط {money(shift.average_ticket)}</p></div>
                        <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">المرتجعات</p><strong className="text-rose-700">{money(shift.approved_returns)}</strong><p className="mt-1 text-xs text-muted-foreground">{number(shift.return_count)} مرتجع</p></div>
                        <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Payment Ledger</p><strong>{money(shift.recorded_payment_base)}</strong><p className="mt-1 text-xs text-muted-foreground">Gap {money(shift.payment_legacy_gap)}</p></div>
                        <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">رد إلكتروني مؤكد</p><strong>{money(shift.confirmed_electronic_refunds)}</strong><p className="mt-1 text-xs text-muted-foreground">معلق {money(shift.pending_electronic_refunds)}</p></div>
                      </div>

                      {canCashControl && (
                        <div className="mt-4 grid gap-3 rounded-2xl border p-4 sm:grid-cols-2 xl:grid-cols-5">
                          <div><p className="text-xs text-muted-foreground">افتتاح فعلي</p><strong>{shift.opening_cash == null ? "—" : money(shift.opening_cash)}</strong></div>
                          <div><p className="text-xs text-muted-foreground">افتتاح النظام</p><strong>{shift.opening_system_balance == null ? "—" : money(shift.opening_system_balance)}</strong></div>
                          <div><p className="text-xs text-muted-foreground">Expected Cash</p><strong>{shift.expected_cash == null ? "—" : money(shift.expected_cash)}</strong></div>
                          <div><p className="text-xs text-muted-foreground">Closing Count</p><strong>{shift.closing_cash == null ? "—" : money(shift.closing_cash)}</strong></div>
                          <div><p className="text-xs text-muted-foreground">الفرق</p><strong className={Math.abs(shift.cash_difference || 0) > 0.005 ? "text-rose-700" : "text-emerald-700"}>{shift.cash_difference == null ? "—" : money(shift.cash_difference)}</strong></div>
                        </div>
                      )}

                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full min-w-[760px] text-sm">
                          <thead><tr className="border-b text-muted-foreground"><th className="px-3 py-2 text-right">الوسيلة</th><th className="px-3 py-2 text-left">فواتير</th><th className="px-3 py-2 text-left">Invoice amount</th><th className="px-3 py-2 text-left">Recorded</th><th className="px-3 py-2 text-left">Coverage</th><th className="px-3 py-2 text-left">Actual</th></tr></thead>
                          <tbody>{shift.payment_breakdown.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">لا توجد وسائل دفع في الوردية خلال الفترة.</td></tr> : shift.payment_breakdown.map((method) => <tr key={`${shift.shift_id}-${method.payment_method_id || method.code}`} className="border-b last:border-0"><td className="px-3 py-3 font-semibold">{method.name}</td><td className="px-3 py-3 text-left">{number(method.invoice_count)}</td><td className="px-3 py-3 text-left">{money(method.invoice_amount)}</td><td className="px-3 py-3 text-left">{money(method.recorded_payment_base)}</td><td className="px-3 py-3 text-left">{percent(method.coverage_percent)}</td><td className="px-3 py-3 text-left">{method.actual_available ? money(method.actual_counted_amount) : "غير محفوظ تاريخيًا"}</td></tr>)}</tbody>
                        </table>
                      </div>
                    </div>
                  </details>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  );
}

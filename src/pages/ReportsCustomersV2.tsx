import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfDay, startOfMonth, subDays } from "date-fns";
import { AlertTriangle, BadgePercent, RefreshCcw, Search, ShoppingBag, UserCheck, UserRoundSearch, Users } from "lucide-react";
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
import { fetchReportingCustomersV2 } from "@/services/supabase/reportingCustomersV2Service";
import { useBranchStore } from "@/stores/branchStore";

type PeriodPreset = "today" | "7d" | "30d" | "month";

type CustomerStage = "all" | "prospect" | "new" | "returning" | "engaged";

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

const stageLabel = (stage: string) => ({ prospect: "فرصة / لم يشترِ", new: "عميل جديد", returning: "عميل عائد", engaged: "متفاعل" }[stage] || stage);

function Metric({ title, value, hint, icon }: { title: string; value: string; hint: string; icon: React.ReactNode }) {
  return <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-muted-foreground">{title}</p><p className="mt-2 text-2xl font-black tracking-tight">{value}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p></div><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div></div></CardContent></Card>;
}

export default function ReportsCustomersV2() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [period, setPeriod] = useState<PeriodPreset>("30d");
  const [stage, setStage] = useState<CustomerStage>("all");
  const [search, setSearch] = useState("");
  const range = useMemo(() => getRange(period), [period]);

  const query = useQuery({
    queryKey: ["reporting-customers-v2", currentBranchId, period],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchReportingCustomersV2(currentBranchId!, range.from, range.to, 200),
    staleTime: 30_000,
  });

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (query.data?.customers || []).filter((row) => {
      if (stage !== "all" && row.customer_stage !== stage) return false;
      if (!q) return true;
      return row.customer_name.toLowerCase().includes(q) || (row.phone || "").toLowerCase().includes(q) || (row.membership_number || "").toLowerCase().includes(q);
    });
  }, [query.data?.customers, stage, search]);

  if (!currentBranchId) return <MainLayout><div className="mx-auto mt-16 max-w-xl"><Alert><AlertDescription>اختر فرعًا أولًا لعرض تقرير العملاء.</AlertDescription></Alert></div></MainLayout>;

  const summary = query.data?.summary;

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto w-full max-w-[1600px] space-y-5 py-5">
        <ReportsSectionNav />

        <section className="rounded-3xl border bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap gap-2"><Badge variant="secondary">Customers V2</Badge><Badge variant="outline">{currentBranchName || "الفرع الحالي"}</Badge></div>
              <h1 className="text-2xl font-black md:text-3xl">العملاء وجودة الربط</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">Customer Intelligence مبني فقط على `customer_id` الحقيقي. لا ندمج الاسم أو الموبايل تلقائيًا، لذلك المبيعات غير المرتبطة تظل Anonymous حتى لا نصنع LTV أو تكرار شراء غير موثوق.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Select value={period} onValueChange={(value) => setPeriod(value as PeriodPreset)}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="today">اليوم</SelectItem><SelectItem value="7d">آخر 7 أيام</SelectItem><SelectItem value="30d">آخر 30 يوم</SelectItem><SelectItem value="month">هذا الشهر</SelectItem></SelectContent></Select>
              <Select value={stage} onValueChange={(value) => setStage(value as CustomerStage)}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل العملاء المعروفين</SelectItem><SelectItem value="prospect">فرص لم تشترِ</SelectItem><SelectItem value="new">جدد</SelectItem><SelectItem value="returning">عائدون</SelectItem><SelectItem value="engaged">متفاعلون</SelectItem></SelectContent></Select>
              <div className="relative"><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="rounded-xl pr-9" placeholder="اسم / هاتف / عضوية" /></div>
              <Button variant="outline" className="rounded-xl" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCcw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث</Button>
            </div>
          </div>
        </section>

        {query.isLoading ? <div className="flex min-h-[420px] items-center justify-center"><BrandLoader size="lg" /></div> : query.isError || !summary ? (
          <Alert variant="destructive"><AlertDescription>تعذر تحميل تقرير العملاء. تأكد من صلاحية التقارير ثم أعد المحاولة.</AlertDescription></Alert>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
              <Metric title="عملاء معروفون بالفترة" value={number(summary.known_customers_in_period)} hint={`${number(summary.realized_customers_in_period)} لديهم شراء محقق`} icon={<Users className="h-5 w-5" />} />
              <Metric title="عملاء جدد" value={number(summary.new_realized_customers)} hint={`${number(summary.returning_realized_customers)} عائدون`} icon={<UserCheck className="h-5 w-5" />} />
              <Metric title="قيمة محققة معروفة" value={money(summary.known_realized_value)} hint="مرتبطة بهوية عميل موثوقة" icon={<ShoppingBag className="h-5 w-5" />} />
              <Metric title="قيمة محققة مجهولة" value={money(summary.anonymous_realized_value)} hint="لا تدخل في LTV العميل" icon={<UserRoundSearch className="h-5 w-5" />} />
              <Metric title="تغطية الهوية" value={percent(summary.overall_identity_coverage_percent)} hint={`POS ${percent(summary.pos_identity_coverage_percent)} • Online ${percent(summary.online_identity_coverage_percent)}`} icon={<BadgePercent className="h-5 w-5" />} />
              <Metric title="CRM متأخر" value={number(query.data!.crm.overdue_now)} hint={`${number(query.data!.crm.pending_now)} متابعة معلقة الآن`} icon={<AlertTriangle className="h-5 w-5" />} />
            </section>

            {query.data!.data_quality.pos_customer_linking_available === false && (
              <Alert className="border-amber-200 bg-amber-50/70 text-amber-950"><AlertTriangle className="h-4 w-4" /><AlertDescription>ربط عملاء POS غير متاح في البيانات الحالية: فواتير POS في هذا الفرع لا تحمل `customer_id`. لذلك تقرير العميل لا ينسب مبيعات الكاشير لأي شخص بالاسم أو الهاتف حتى يتم إصلاح الربط من لحظة البيع.</AlertDescription></Alert>
            )}

            <section className="grid gap-5 xl:grid-cols-3">
              <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardHeader><CardTitle className="text-lg">POS وهوية العميل</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex items-center justify-between rounded-2xl bg-muted/50 p-4"><span>الفواتير</span><strong>{number(summary.pos_transactions)}</strong></div><div className="flex items-center justify-between rounded-2xl bg-muted/50 p-4"><span>مرتبطة</span><strong>{number(summary.pos_linked_transactions)}</strong></div><div className="flex items-center justify-between rounded-2xl bg-muted/50 p-4"><span>غير مرتبطة</span><strong>{number(summary.pos_anonymous_transactions)}</strong></div><div className="flex items-center justify-between rounded-2xl border p-4"><span>قيمة غير معروفة الهوية</span><strong>{money(summary.pos_anonymous_value)}</strong></div></CardContent></Card>
              <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardHeader><CardTitle className="text-lg">Online وهوية العميل</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex items-center justify-between rounded-2xl bg-muted/50 p-4"><span>الطلبات</span><strong>{number(summary.online_orders)}</strong></div><div className="flex items-center justify-between rounded-2xl bg-muted/50 p-4"><span>مرتبطة</span><strong>{number(summary.online_linked_orders)}</strong></div><div className="flex items-center justify-between rounded-2xl bg-muted/50 p-4"><span>غير مرتبطة</span><strong>{number(summary.online_anonymous_orders)}</strong></div><div className="flex items-center justify-between rounded-2xl border p-4"><span>Gross مرتبط</span><strong>{money(summary.online_linked_gross_value)}</strong></div></CardContent></Card>
              <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardHeader><CardTitle className="text-lg">الولاء والمتابعة</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex items-center justify-between rounded-2xl bg-muted/50 p-4"><span>حسابات ولاء</span><strong>{number(query.data!.loyalty.accounts)}</strong></div><div className="flex items-center justify-between rounded-2xl bg-muted/50 p-4"><span>رصيد النقاط المخزن</span><strong>{number(query.data!.loyalty.points_balance)}</strong></div><div className="flex items-center justify-between rounded-2xl bg-muted/50 p-4"><span>متابعات أُنشئت بالفترة</span><strong>{number(query.data!.crm.created_in_period)}</strong></div><div className="flex items-center justify-between rounded-2xl border p-4"><span>متابعات مكتملة</span><strong>{number(query.data!.crm.completed_in_period)}</strong></div></CardContent></Card>
            </section>

            <Card className="border-0 shadow-sm ring-1 ring-black/5">
              <CardHeader><CardTitle className="text-lg">العملاء المعروفون في الفترة</CardTitle><p className="text-xs text-muted-foreground">{number(filteredCustomers.length)} عميل مطابق للفلاتر. LTV هنا خاص بهذا الفرع فقط.</p></CardHeader>
              <CardContent className="overflow-x-auto">
                {filteredCustomers.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">لا توجد هوية عميل مرتبطة بالنشاط داخل الفترة الحالية.</p> : (
                  <table className="w-full min-w-[1200px] text-sm"><thead><tr className="border-b text-muted-foreground"><th className="px-3 py-3 text-right">العميل</th><th className="px-3 py-3 text-right">المرحلة</th><th className="px-3 py-3 text-left">POS</th><th className="px-3 py-3 text-left">Online</th><th className="px-3 py-3 text-left">طلبات مفتوحة</th><th className="px-3 py-3 text-left">قيمة محققة</th><th className="px-3 py-3 text-left">LTV الفرع</th><th className="px-3 py-3 text-left">النقاط</th><th className="px-3 py-3 text-right">آخر نشاط</th></tr></thead><tbody>{filteredCustomers.map((row) => <tr key={row.customer_id} className="border-b last:border-0 hover:bg-muted/40"><td className="px-3 py-3"><div className="font-semibold">{row.customer_name}</div><div className="mt-1 text-xs text-muted-foreground">{row.phone || row.membership_number || "—"}</div></td><td className="px-3 py-3"><Badge variant={row.customer_stage === "prospect" ? "outline" : "secondary"}>{stageLabel(row.customer_stage)}</Badge></td><td className="px-3 py-3 text-left"><div>{number(row.pos_invoices)} فاتورة</div><div className="text-xs text-muted-foreground">{money(row.pos_sales)}</div></td><td className="px-3 py-3 text-left"><div>{number(row.online_orders)} طلب</div><div className="text-xs text-muted-foreground">مسلم {money(row.online_delivered_value)}</div></td><td className="px-3 py-3 text-left">{money(row.open_online_value)}</td><td className="px-3 py-3 text-left font-semibold">{money(row.period_realized_value)}</td><td className="px-3 py-3 text-left font-semibold">{money(row.lifetime_realized_value)}</td><td className="px-3 py-3 text-left">{number(row.points_balance)}</td><td className="px-3 py-3">{row.last_activity_at ? new Date(row.last_activity_at).toLocaleString("ar-EG") : "—"}</td></tr>)}</tbody></table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  );
}

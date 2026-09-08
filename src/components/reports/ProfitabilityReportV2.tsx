import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote, CircleDollarSign, Receipt, TrendingDown, TrendingUp, WalletCards } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import BrandLoader from "@/components/ui/BrandLoader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { siteConfig } from "@/config/site";
import { fetchProfitabilityReportV2 } from "@/services/supabase/profitabilityReportV2Service";

const money = (value: number | null | undefined) =>
  `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${siteConfig.currency}`;

function ProfitMetric({ title, value, note, icon, negative = false }: {
  title: string;
  value: number | null | undefined;
  note: string;
  icon: React.ReactNode;
  negative?: boolean;
}) {
  return (
    <Card className="border-0 shadow-sm ring-1 ring-black/5">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-muted-foreground">{title}</p>
            <p className={`mt-2 text-2xl font-black ${negative ? "text-rose-700" : "text-foreground"}`}>{money(value)}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{note}</p>
          </div>
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${negative ? "bg-rose-50 text-rose-700" : "bg-primary/10 text-primary"}`}>
            {icon}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProfitabilityReportV2({ branchId, from, to, periodLabel }: {
  branchId: string;
  from: Date;
  to: Date;
  periodLabel: string;
}) {
  const query = useQuery({
    queryKey: ["reporting-v2-profitability", branchId, from.toISOString(), to.toISOString()],
    queryFn: () => fetchProfitabilityReportV2(branchId, from, to),
    staleTime: 30_000,
  });

  const daily = useMemo(
    () => (query.data?.daily || []).map((row) => ({
      ...row,
      label: new Date(`${row.date}T12:00:00`).toLocaleDateString("ar-EG", { day: "numeric", month: "short" }),
    })),
    [query.data?.daily],
  );

  const waterfall = useMemo(
    () => (query.data?.waterfall || []).map((row) => ({ ...row, amount: Math.abs(row.value) })),
    [query.data?.waterfall],
  );

  if (query.isLoading) return <div className="flex min-h-[360px] items-center justify-center"><BrandLoader size="lg" /></div>;
  if (query.isError || !query.data) {
    return <Alert variant="destructive"><AlertDescription>تعذر تحميل تقرير الربحية أو أن حسابك لا يملك صلاحية عرض الأرباح.</AlertDescription></Alert>;
  }

  const summary = query.data.summary;

  return (
    <div className="space-y-5">
      {!query.data.online_profit_complete && (
        <Alert className="border-amber-200 bg-amber-50/80 text-amber-950">
          <AlertDescription>
            تقرير الربحية الحالي موثوق لـPOS لأنه يستخدم تكلفة الشراء المحفوظة داخل Snapshot الفاتورة. أرباح الأونلاين لا تُضاف للربح حتى نحفظ تكلفة أصناف الطلب وقت البيع، لذلك لن يعرض النظام هامشًا تقديريًا.
          </AlertDescription>
        </Alert>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <ProfitMetric title="صافي مبيعات POS" value={summary.pos_net_sales} note={`${periodLabel} بعد المرتجعات`} icon={<Receipt className="h-5 w-5" />} />
        <ProfitMetric title="تكلفة البضاعة" value={summary.pos_net_cogs} note="من Snapshot تكلفة البيع" icon={<TrendingDown className="h-5 w-5" />} negative />
        <ProfitMetric title="إجمالي الربح" value={summary.pos_gross_profit} note="المبيعات − التكلفة" icon={<TrendingUp className="h-5 w-5" />} />
        <ProfitMetric title="رسوم الدفع" value={summary.merchant_payment_fees} note="العمولة التي تتحملها المنشأة" icon={<WalletCards className="h-5 w-5" />} negative />
        <ProfitMetric title="المصروفات" value={summary.expenses} note="المصروفات النشطة المسجلة" icon={<Banknote className="h-5 w-5" />} negative />
        <ProfitMetric title="النتيجة التشغيلية" value={summary.known_operating_result} note="الربح المعروف بعد الرسوم والمصروفات" icon={<CircleDollarSign className="h-5 w-5" />} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <Card className="border-0 shadow-sm ring-1 ring-black/5">
          <CardHeader>
            <CardTitle className="text-lg">تطور الربحية اليومية</CardTitle>
            <p className="text-xs text-muted-foreground">صافي المبيعات، إجمالي الربح والنتيجة التشغيلية المعروفة.</p>
          </CardHeader>
          <CardContent className="h-[330px] px-2 md:px-5">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={18} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={56} />
                <Tooltip formatter={(value: number) => money(value)} labelStyle={{ textAlign: "right" }} />
                <Area type="monotone" dataKey="net_sales" name="صافي المبيعات" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.08} strokeWidth={2} />
                <Area type="monotone" dataKey="gross_profit" name="إجمالي الربح" stroke="currentColor" fill="transparent" strokeWidth={2} />
                <Area type="monotone" dataKey="known_operating_result" name="النتيجة التشغيلية" stroke="currentColor" fill="transparent" strokeDasharray="5 4" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm ring-1 ring-black/5">
          <CardHeader>
            <CardTitle className="text-lg">جسر الربحية</CardTitle>
            <p className="text-xs text-muted-foreground">من صافي المبيعات حتى النتيجة التشغيلية المعروفة.</p>
          </CardHeader>
          <CardContent className="h-[330px] px-2 md:px-5">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={waterfall} layout="vertical" margin={{ top: 4, right: 16, left: 22, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.25} />
                <XAxis type="number" hide />
                <YAxis dataKey="label" type="category" tick={{ fontSize: 10 }} width={105} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value: number, _name, item) => [money(item.payload.value), item.payload.label]} />
                <Bar dataKey="amount" name="القيمة" fill="hsl(var(--primary))" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>

      <Card className="border-0 shadow-sm ring-1 ring-black/5">
        <CardHeader><CardTitle className="text-lg">تعريف الرقم النهائي</CardTitle></CardHeader>
        <CardContent className="text-sm leading-7 text-muted-foreground">
          النتيجة التشغيلية المعروفة = صافي مبيعات POS − صافي تكلفة البضاعة بعد المرتجعات − رسوم وسائل الدفع التي تتحملها المنشأة − المصروفات النشطة. الرواتب وربح الأونلاين لا يتم افتراضهما في الرقم حتى يصبح لهما مصدر تكلفة موثوق ومؤرخ.
        </CardContent>
      </Card>
    </div>
  );
}

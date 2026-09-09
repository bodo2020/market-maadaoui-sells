import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, GitCompareArrows, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getHrManagerTeamPeriodComparison, HrManagerPeriodSnapshot } from "@/services/hrManagerPeriodComparisonService";

type MetricKey = keyof HrManagerPeriodSnapshot;
type Direction = "higher" | "lower" | "neutral";

type MetricDefinition = {
  key: MetricKey;
  label: string;
  direction: Direction;
  format?: "number" | "percent" | "money" | "minutes";
};

const qualityMetrics: MetricDefinition[] = [
  { key: "attendance_rate", label: "نسبة الحضور", direction: "higher", format: "percent" },
  { key: "absence_days", label: "أيام الغياب", direction: "lower" },
  { key: "late_minutes", label: "دقائق التأخير", direction: "lower", format: "minutes" },
  { key: "overdue_open_tasks", label: "المهام المتأخرة المفتوحة", direction: "lower" },
  { key: "cash_variance", label: "فروق النقد", direction: "lower", format: "money" },
  { key: "payment_variance", label: "فروق وسائل الدفع", direction: "lower", format: "money" },
  { key: "inventory_completion_rate", label: "إنجاز مهام الجرد", direction: "higher", format: "percent" },
  { key: "followup_completion_rate", label: "إغلاق متابعات العملاء", direction: "higher", format: "percent" },
  { key: "followups_overdue_open", label: "متابعات العملاء المتأخرة", direction: "lower" },
];

const volumeMetrics: MetricDefinition[] = [
  { key: "completed_tasks", label: "المهام المكتملة", direction: "neutral" },
  { key: "delivery_delivered", label: "طلبات تم توصيلها", direction: "neutral" },
  { key: "online_handled_orders", label: "طلبات أونلاين تم التعامل معها", direction: "neutral" },
];

const number = (value: number) => Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 1 });
const money = (value: number) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;

function formatValue(value: number | null, format: MetricDefinition["format"] = "number") {
  if (value == null) return "لا بيانات";
  if (format === "percent") return `${number(value)}%`;
  if (format === "money") return money(value);
  if (format === "minutes") return `${number(value)} د`;
  return number(value);
}

function trend(current: number | null, previous: number | null, direction: Direction) {
  if (current == null || previous == null) return { state: "unknown" as const, delta: null as number | null };
  const delta = current - previous;
  if (Math.abs(delta) < 0.0001) return { state: "same" as const, delta };
  if (direction === "neutral") return { state: delta > 0 ? "up" as const : "down" as const, delta };
  const improved = direction === "higher" ? delta > 0 : delta < 0;
  return { state: improved ? "better" as const : "worse" as const, delta };
}

function formatPeriod(from: string, to: string) {
  return `${from} → ${to}`;
}

export default function ManagerPeriodComparisonPanel({ branchId, from, to }: { branchId: string; from: string; to: string }) {
  const query = useQuery({
    queryKey: ["hr-manager-team-period-comparison-v1", branchId, from, to],
    enabled: Boolean(branchId && from && to && from <= to),
    queryFn: () => getHrManagerTeamPeriodComparison({ branchId, from, to }),
    refetchOnWindowFocus: true,
  });

  const qualitySummary = useMemo(() => {
    if (!query.data) return { better: 0, worse: 0, same: 0, comparable: 0 };
    return qualityMetrics.reduce((acc, metric) => {
      const result = trend(query.data!.current[metric.key] as number | null, query.data!.previous[metric.key] as number | null, metric.direction);
      if (result.state === "better") acc.better += 1;
      if (result.state === "worse") acc.worse += 1;
      if (result.state === "same") acc.same += 1;
      if (result.state !== "unknown") acc.comparable += 1;
      return acc;
    }, { better: 0, worse: 0, same: 0, comparable: 0 });
  }, [query.data]);

  if (query.isLoading) return <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">جاري مقارنة الفترة الحالية بالفترة السابقة...</CardContent></Card>;
  if (query.isError || !query.data) return null;

  const data = query.data;
  const scheduleChanged = data.context.current_scheduled_days !== data.context.previous_scheduled_days;

  return (
    <Card className="overflow-hidden border-[#005931]/15">
      <CardHeader className="border-b bg-gradient-to-l from-[#005931]/10 to-white">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><GitCompareArrows className="h-5 w-5 text-[#005931]" />مقارنة بالفترة السابقة</CardTitle>
            <CardDescription className="mt-1">مقارنة مباشرة بنفس عدد الأيام. كل مؤشر يُقرأ مستقلًا ولا يتحول إلى Score موحد.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className="bg-white">الحالية: {formatPeriod(data.current_period.from, data.current_period.to)}</Badge>
            <Badge variant="outline" className="bg-white">السابقة: {formatPeriod(data.previous_period.from, data.previous_period.to)}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-4 md:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Summary label="مؤشرات قابلة للمقارنة" value={qualitySummary.comparable} />
          <Summary label="تحسنت" value={qualitySummary.better} tone="good" />
          <Summary label="تراجعت" value={qualitySummary.worse} tone="bad" />
          <Summary label="بدون تغيير" value={qualitySummary.same} />
        </div>

        {scheduleChanged && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
            أيام الورديات المجدولة اختلفت بين الفترتين: الحالية {number(data.context.current_scheduled_days)} مقابل السابقة {number(data.context.previous_scheduled_days)}. اقرأ الأرقام المطلقة مثل الغياب والتأخير مع هذا الاختلاف.
          </div>
        )}
        {data.context.current_scheduled_days === 0 && data.context.previous_scheduled_days === 0 && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm leading-6 text-blue-950">لا توجد ورديات مجدولة في الفترتين؛ لذلك نسبة الحضور لا تُقارن ولا تتحول إلى 0%.</div>
        )}

        <section>
          <div className="mb-3 font-black">الجودة والانضباط</div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {qualityMetrics.map((metric) => <ComparisonMetric key={metric.key} metric={metric} current={data.current} previous={data.previous} />)}
          </div>
        </section>

        <section>
          <div className="mb-1 font-black">حجم التشغيل</div>
          <div className="mb-3 text-xs text-muted-foreground">الزيادة أو الانخفاض هنا لا تعني تلقائيًا تحسنًا أو تراجعًا؛ حجم الطلب والعمل قد يكون مختلفًا بين الفترتين.</div>
          <div className="grid gap-3 md:grid-cols-3">
            {volumeMetrics.map((metric) => <ComparisonMetric key={metric.key} metric={metric} current={data.current} previous={data.previous} />)}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function ComparisonMetric({ metric, current, previous }: { metric: MetricDefinition; current: HrManagerPeriodSnapshot; previous: HrManagerPeriodSnapshot }) {
  const currentValue = current[metric.key] as number | null;
  const previousValue = previous[metric.key] as number | null;
  const result = trend(currentValue, previousValue, metric.direction);
  const deltaText = result.delta == null ? "لا توجد عينات مشتركة" : `${result.delta > 0 ? "+" : ""}${formatValue(result.delta, metric.format)}`;

  const status = result.state === "better"
    ? { text: "تحسن", className: "text-emerald-700 bg-emerald-50 border-emerald-200", Icon: ArrowUpRight }
    : result.state === "worse"
      ? { text: "تراجع", className: "text-red-700 bg-red-50 border-red-200", Icon: ArrowDownRight }
      : result.state === "up"
        ? { text: "زيادة", className: "text-slate-700 bg-slate-50 border-slate-200", Icon: ArrowUpRight }
        : result.state === "down"
          ? { text: "انخفاض", className: "text-slate-700 bg-slate-50 border-slate-200", Icon: ArrowDownRight }
          : result.state === "same"
            ? { text: "ثابت", className: "text-slate-600 bg-slate-50 border-slate-200", Icon: Minus }
            : { text: "غير قابل للمقارنة", className: "text-slate-500 bg-slate-50 border-slate-200", Icon: Minus };

  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="font-bold">{metric.label}</div>
        <Badge variant="outline" className={status.className}><status.Icon className="ml-1 h-3 w-3" />{status.text}</Badge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div><div className="text-xs text-muted-foreground">الفترة الحالية</div><div className="mt-1 text-lg font-black">{formatValue(currentValue, metric.format)}</div></div>
        <div><div className="text-xs text-muted-foreground">الفترة السابقة</div><div className="mt-1 text-lg font-black text-slate-600">{formatValue(previousValue, metric.format)}</div></div>
      </div>
      <div className="mt-3 border-t pt-2 text-xs text-muted-foreground">الفرق: <span className="font-bold text-foreground">{deltaText}</span></div>
    </div>
  );
}

function Summary({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "good" | "bad" }) {
  const className = tone === "good" ? "border-emerald-200 bg-emerald-50" : tone === "bad" ? "border-red-200 bg-red-50" : "bg-white";
  return <div className={`rounded-xl border p-3 ${className}`}><div className="text-xs text-muted-foreground">{label}</div><div className="mt-2 text-2xl font-black">{value.toLocaleString("ar-EG")}</div></div>;
}

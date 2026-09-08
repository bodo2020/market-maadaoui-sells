import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfDay, startOfMonth, subDays } from "date-fns";
import { Link } from "react-router-dom";
import { ArrowLeft, BrainCircuit, CircleAlert, Info, Lightbulb, RefreshCcw, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import ReportsSectionNav from "@/components/reports/ReportsSectionNav";
import BrandLoader from "@/components/ui/BrandLoader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { siteConfig } from "@/config/site";
import { fetchReportingInsightsV2, InsightSeverity, ReportingInsightV2 } from "@/services/supabase/reportingInsightsV2Service";
import { useBranchStore } from "@/stores/branchStore";

type PeriodPreset = "today" | "7d" | "30d" | "month" | "year";

const getRange = (preset: PeriodPreset) => {
  const now = new Date();
  if (preset === "today") return { from: startOfDay(now), to: now, label: "اليوم" };
  if (preset === "7d") return { from: startOfDay(subDays(now, 6)), to: now, label: "آخر 7 أيام" };
  if (preset === "month") return { from: startOfMonth(now), to: now, label: "هذا الشهر" };
  if (preset === "year") return { from: new Date(now.getFullYear(), 0, 1), to: now, label: "هذه السنة" };
  return { from: startOfDay(subDays(now, 29)), to: now, label: "آخر 30 يوم" };
};

const severityMeta: Record<InsightSeverity, { label: string; card: string; badge: string }> = {
  critical: { label: "عاجل", card: "border-red-200 bg-red-50/40", badge: "bg-red-100 text-red-800 hover:bg-red-100" },
  warning: { label: "تحذير", card: "border-amber-200 bg-amber-50/40", badge: "bg-amber-100 text-amber-800 hover:bg-amber-100" },
  opportunity: { label: "فرصة", card: "border-emerald-200 bg-emerald-50/40", badge: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" },
  info: { label: "معلومة", card: "border-sky-200 bg-sky-50/40", badge: "bg-sky-100 text-sky-800 hover:bg-sky-100" },
};

const categoryLabels: Record<string, string> = {
  inventory: "المخزون",
  returns: "المرتجعات",
  shifts: "الورديات",
  online: "الأونلاين",
  customers: "العملاء",
  data_quality: "جودة البيانات",
};

const metric = (insight: ReportingInsightV2) => {
  const value = Number(insight.metric_value || 0);
  if (insight.metric_unit === "percent") return `${value.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}٪`;
  if (insight.metric_unit === "EGP") return `${value.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${siteConfig.currency}`;
  if (insight.metric_unit === "rows") return `${value.toLocaleString("ar-EG")} صف`;
  if (insight.metric_unit === "orders") return `${value.toLocaleString("ar-EG")} طلب`;
  if (insight.metric_unit === "not_available") return "غير متاح";
  return value.toLocaleString("ar-EG", { maximumFractionDigits: 2 });
};

function SeverityIcon({ severity }: { severity: InsightSeverity }) {
  if (severity === "critical") return <CircleAlert className="h-5 w-5" />;
  if (severity === "warning") return <TriangleAlert className="h-5 w-5" />;
  if (severity === "opportunity") return <Lightbulb className="h-5 w-5" />;
  return <Info className="h-5 w-5" />;
}

function SummaryCard({ title, value, hint, icon }: { title: string; value: number; hint: string; icon: React.ReactNode }) {
  return (
    <Card className="border-0 shadow-sm ring-1 ring-black/5">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-2 text-3xl font-black">{value.toLocaleString("ar-EG")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReportsInsightsV2() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [period, setPeriod] = useState<PeriodPreset>("30d");
  const range = useMemo(() => getRange(period), [period]);
  const query = useQuery({
    queryKey: ["reporting-insights-v2", currentBranchId, period],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchReportingInsightsV2(currentBranchId!, range.from, range.to),
    staleTime: 30_000,
  });

  if (!currentBranchId) {
    return <MainLayout><div className="mx-auto mt-16 max-w-xl"><Alert><AlertDescription>اختر فرعًا أولًا لعرض مركز الإشارات الذكية.</AlertDescription></Alert></div></MainLayout>;
  }

  const summary = query.data?.summary;
  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto w-full max-w-[1600px] space-y-5 py-5">
        <ReportsSectionNav />

        <section className="overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="p-5 md:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="mb-2 flex flex-wrap gap-2">
                  <Badge variant="secondary" className="gap-1"><BrainCircuit className="h-3.5 w-3.5" /> Smart Insights V2</Badge>
                  <Badge variant="outline">Rule Engine {query.data?.rule_version || 1}</Badge>
                  <Badge variant="outline">{currentBranchName || "الفرع الحالي"}</Badge>
                </div>
                <h1 className="text-2xl font-black md:text-3xl">مركز القرار والإشارات الذكية</h1>
                <p className="mt-2 max-w-4xl text-sm leading-7 text-muted-foreground">
                  يحول مؤشرات Reporting V2 الموثقة إلى قائمة أولويات قابلة للتنفيذ. لا يتم اختلاق هامش مستهدف، ولا مطابقة العملاء بالاسم أو الهاتف، ولا استخدام ذكاء توليدي لتغيير الأرقام.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={period} onValueChange={(value) => setPeriod(value as PeriodPreset)}>
                  <SelectTrigger className="min-w-[170px] rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">اليوم</SelectItem>
                    <SelectItem value="7d">آخر 7 أيام</SelectItem>
                    <SelectItem value="30d">آخر 30 يوم</SelectItem>
                    <SelectItem value="month">هذا الشهر</SelectItem>
                    <SelectItem value="year">هذه السنة</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" className="rounded-xl" onClick={() => query.refetch()} disabled={query.isFetching}>
                  <RefreshCcw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> تحديث
                </Button>
              </div>
            </div>
          </div>
        </section>

        {query.isLoading ? (
          <div className="flex min-h-[420px] items-center justify-center"><BrandLoader size="lg" /></div>
        ) : query.isError || !summary ? (
          <Alert variant="destructive"><AlertDescription>تعذر تحميل Smart Insights لهذا الفرع.</AlertDescription></Alert>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryCard title="إجمالي الإشارات" value={summary.total} hint={`داخل ${range.label}`} icon={<Sparkles className="h-5 w-5" />} />
              <SummaryCard title="عاجل" value={summary.critical} hint="يحتاج أولوية تشغيلية" icon={<CircleAlert className="h-5 w-5" />} />
              <SummaryCard title="تحذيرات" value={summary.warning} hint="يحتاج مراجعة" icon={<TriangleAlert className="h-5 w-5" />} />
              <SummaryCard title="فرص" value={summary.opportunity} hint="تحسين قابل للتنفيذ" icon={<Lightbulb className="h-5 w-5" />} />
              <SummaryCard title="معلومات" value={summary.info} hint="جودة بيانات وسياق" icon={<Info className="h-5 w-5" />} />
            </section>

            <Alert className="border-emerald-200 bg-emerald-50/70">
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription>
                مصدر القرار: قواعد Deterministic فوق Reporting V2. Generative AI = {query.data!.data_quality.generative_ai_used ? "مستخدم" : "غير مستخدم"}، ومطابقة العملاء الخام = {query.data!.data_quality.raw_customer_matching_used ? "مستخدمة" : "غير مستخدمة"}.
              </AlertDescription>
            </Alert>

            {query.data!.insights.length === 0 ? (
              <Card className="border-0 shadow-sm ring-1 ring-black/5"><CardContent className="py-16 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-primary" /><h2 className="mt-4 text-xl font-black">لا توجد إشارات تحتاج إجراء في الفترة الحالية</h2><p className="mt-2 text-sm text-muted-foreground">سيظهر هنا أي تغير موضوعي تلتقطه قواعد Reporting V2.</p></CardContent></Card>
            ) : (
              <section className="grid gap-4 xl:grid-cols-2">
                {query.data!.insights.map((insight) => {
                  const meta = severityMeta[insight.severity];
                  return (
                    <Card key={insight.id} className={`overflow-hidden shadow-sm ${meta.card}`}>
                      <CardContent className="p-5 md:p-6">
                        <div className="flex flex-col gap-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/80 shadow-sm"><SeverityIcon severity={insight.severity} /></div>
                              <div>
                                <div className="mb-1 flex flex-wrap gap-2">
                                  <Badge className={meta.badge}>{meta.label}</Badge>
                                  <Badge variant="outline">{categoryLabels[insight.category] || insight.category}</Badge>
                                  <Badge variant="outline">أولوية {insight.priority}</Badge>
                                </div>
                                <h2 className="text-lg font-black leading-7">{insight.title}</h2>
                              </div>
                            </div>
                            <div className="min-w-[130px] rounded-2xl bg-white/80 px-4 py-3 text-center shadow-sm">
                              <p className="text-xs text-muted-foreground">{insight.metric_label}</p>
                              <p className="mt-1 text-lg font-black">{metric(insight)}</p>
                            </div>
                          </div>

                          <p className="text-sm leading-7 text-foreground/80">{insight.message}</p>
                          <div className="rounded-2xl border border-white/80 bg-white/70 p-4">
                            <p className="text-xs font-bold text-muted-foreground">الإجراء المقترح</p>
                            <p className="mt-1 text-sm font-semibold leading-6">{insight.action}</p>
                          </div>
                          <div className="flex justify-end">
                            <Button asChild variant="outline" className="rounded-xl bg-white/80">
                              <Link to={insight.href}>فتح التقرير المسؤول <ArrowLeft className="mr-2 h-4 w-4" /></Link>
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </section>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}

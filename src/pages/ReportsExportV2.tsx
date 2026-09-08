import { useMemo, useState } from "react";
import { startOfDay, startOfMonth, subDays } from "date-fns";
import { Database, FileDown, FileSpreadsheet, FileText, ShieldCheck, Sparkles, Table2 } from "lucide-react";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import ReportsSectionNav from "@/components/reports/ReportsSectionNav";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  exportReportingCsvV2,
  exportReportingWorkbookV2,
  fetchReportingExportBundleV2,
  openReportingPdfPreviewV2,
  REPORTING_EXPORT_DATASETS,
  ReportingExportDataset,
} from "@/services/reportingExportV2Service";
import { useBranchStore } from "@/stores/branchStore";

type PeriodPreset = "today" | "7d" | "30d" | "month" | "year";
type ExportKind = "xlsx" | "csv" | "pdf";

const getRange = (preset: PeriodPreset) => {
  const now = new Date();
  if (preset === "today") return { from: startOfDay(now), to: now, label: "اليوم" };
  if (preset === "7d") return { from: startOfDay(subDays(now, 6)), to: now, label: "آخر 7 أيام" };
  if (preset === "month") return { from: startOfMonth(now), to: now, label: "هذا الشهر" };
  if (preset === "year") return { from: new Date(now.getFullYear(), 0, 1), to: now, label: "هذه السنة" };
  return { from: startOfDay(subDays(now, 29)), to: now, label: "آخر 30 يوم" };
};

export default function ReportsExportV2() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [period, setPeriod] = useState<PeriodPreset>("30d");
  const [dataset, setDataset] = useState<ReportingExportDataset>("sales");
  const [working, setWorking] = useState<ExportKind | null>(null);
  const range = useMemo(() => getRange(period), [period]);

  const runExport = async (kind: ExportKind) => {
    if (!currentBranchId || working) return;
    const previewWindow = kind === "pdf" ? window.open("", "_blank") : null;
    if (kind === "pdf" && !previewWindow) {
      toast.error("المتصفح منع نافذة معاينة PDF. اسمح بالنوافذ المنبثقة لهذه الصفحة ثم حاول مرة أخرى.");
      return;
    }

    setWorking(kind);
    try {
      if (previewWindow) {
        previewWindow.document.write("<!doctype html><html lang='ar' dir='rtl'><body style='font-family:Arial;padding:32px'>جاري تجهيز تقرير Reporting V2...</body></html>");
      }
      const bundle = await fetchReportingExportBundleV2(currentBranchId, range.from, range.to);
      if (kind === "xlsx") await exportReportingWorkbookV2(bundle);
      if (kind === "csv") exportReportingCsvV2(bundle, dataset);
      if (kind === "pdf") openReportingPdfPreviewV2(bundle, previewWindow);
      toast.success(kind === "pdf" ? "تم تجهيز معاينة PDF." : "تم تجهيز ملف التصدير بنجاح.");
    } catch (error) {
      previewWindow?.close();
      console.error("Reporting V2 export failed", error);
      toast.error("تعذر تجهيز التصدير. لم يتم تغيير أي بيانات.");
    } finally {
      setWorking(null);
    }
  };

  if (!currentBranchId) {
    return <MainLayout><div className="mx-auto mt-16 max-w-xl"><Alert><AlertDescription>اختر فرعًا أولًا قبل تصدير التقارير.</AlertDescription></Alert></div></MainLayout>;
  }

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto w-full max-w-[1600px] space-y-5 py-5">
        <ReportsSectionNav />

        <section className="rounded-3xl border bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap gap-2">
                <Badge variant="secondary" className="gap-1"><FileDown className="h-3.5 w-3.5" /> Export Center V2</Badge>
                <Badge variant="outline">{currentBranchName || "الفرع الحالي"}</Badge>
                <Badge variant="outline">Reporting APIs فقط</Badge>
              </div>
              <h1 className="text-2xl font-black md:text-3xl">مركز تصدير التقارير</h1>
              <p className="mt-2 max-w-4xl text-sm leading-7 text-muted-foreground">
                Excel وCSV وPDF من نفس Reporting V2 الذي يغذي الشاشات. لا يوجد رجوع للجداول القديمة أو إعادة حساب منفصلة داخل المتصفح، لذلك الملف المعروض يظل متسقًا مع لوحة التقارير.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
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
              <Select value={dataset} onValueChange={(value) => setDataset(value as ReportingExportDataset)}>
                <SelectTrigger className="min-w-[210px] rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{REPORTING_EXPORT_DATASETS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <Alert className="border-emerald-200 bg-emerald-50/70">
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>التصدير قراءة فقط. صلاحيات إخفاء الربح/التكلفة تظل مطبقة لأن البيانات تأتي من نفس RPCs المحمية المستخدمة في الواجهة.</AlertDescription>
        </Alert>

        <section className="grid gap-5 lg:grid-cols-3">
          <Card className="border-0 shadow-sm ring-1 ring-black/5">
            <CardHeader><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FileSpreadsheet className="h-5 w-5" /></div><CardTitle className="pt-2">Excel شامل</CardTitle></CardHeader>
            <CardContent className="space-y-4"><p className="text-sm leading-7 text-muted-foreground">Workbook متعدد الشيتات: الملخص، المبيعات، الدفع، المرتجعات، المخزون، الورديات، الأونلاين، العملاء، المصروفات والموردون، والإشارات الذكية.</p><Button className="w-full rounded-xl" onClick={() => runExport("xlsx")} disabled={Boolean(working)}>{working === "xlsx" ? "جاري تجهيز Excel..." : "تنزيل Excel V2"}</Button></CardContent>
          </Card>

          <Card className="border-0 shadow-sm ring-1 ring-black/5">
            <CardHeader><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Table2 className="h-5 w-5" /></div><CardTitle className="pt-2">CSV للقسم المختار</CardTitle></CardHeader>
            <CardContent className="space-y-4"><p className="text-sm leading-7 text-muted-foreground">ملف خفيف للتحليل أو الاستيراد في أدوات أخرى. القسم الحالي: <strong>{REPORTING_EXPORT_DATASETS.find((item) => item.value === dataset)?.label}</strong>.</p><Button variant="outline" className="w-full rounded-xl" onClick={() => runExport("csv")} disabled={Boolean(working)}>{working === "csv" ? "جاري تجهيز CSV..." : "تنزيل CSV"}</Button></CardContent>
          </Card>

          <Card className="border-0 shadow-sm ring-1 ring-black/5">
            <CardHeader><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FileText className="h-5 w-5" /></div><CardTitle className="pt-2">PDF تنفيذي</CardTitle></CardHeader>
            <CardContent className="space-y-4"><p className="text-sm leading-7 text-muted-foreground">معاينة A4 عربية RTL تحتوي أهم مؤشرات الفترة وSmart Insights. يتم استخدام طباعة المتصفح لضمان سلامة العربية، ثم اختر “حفظ كملف PDF”.</p><Button variant="outline" className="w-full rounded-xl" onClick={() => runExport("pdf")} disabled={Boolean(working)}>{working === "pdf" ? "جاري تجهيز PDF..." : "فتح PDF التنفيذي"}</Button></CardContent>
          </Card>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
          <Card className="border-0 shadow-sm ring-1 ring-black/5">
            <CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" /> ما الذي يدخل في Excel V2؟</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {REPORTING_EXPORT_DATASETS.map((item) => <div key={item.value} className="rounded-2xl border p-4"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><strong>{item.label}</strong></div><p className="mt-1 text-xs leading-5 text-muted-foreground">من عقد Reporting V2 المحمي للفرع والفترة.</p></div>)}
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm ring-1 ring-black/5">
            <CardHeader><CardTitle>نطاق التصدير الحالي</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm"><div className="flex justify-between rounded-xl bg-muted/50 p-3"><span>الفترة</span><strong>{range.label}</strong></div><div className="flex justify-between rounded-xl bg-muted/50 p-3"><span>من</span><strong>{range.from.toLocaleDateString("ar-EG")}</strong></div><div className="flex justify-between rounded-xl bg-muted/50 p-3"><span>إلى</span><strong>{range.to.toLocaleDateString("ar-EG")}</strong></div><div className="flex justify-between rounded-xl bg-muted/50 p-3"><span>CSV</span><strong>{REPORTING_EXPORT_DATASETS.find((item) => item.value === dataset)?.label}</strong></div></CardContent>
          </Card>
        </section>
      </div>
    </MainLayout>
  );
}

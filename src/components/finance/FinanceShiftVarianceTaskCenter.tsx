import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, RefreshCw, Scale, UserRoundCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { siteConfig } from "@/config/site";
import { fetchOperationsTasks, isShiftReconciliationTask, type OperationsTask } from "@/services/supabase/operationsTaskService";
import { useBranchStore } from "@/stores/branchStore";

const activeStatuses = new Set(["open", "claimed", "in_progress", "failed"]);
const money = (value: number | null | undefined) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${siteConfig.currency}`;

function slaLabel(task: OperationsTask) {
  if (!task.due_at) return "بدون موعد";
  const diff = new Date(task.due_at).getTime() - Date.now();
  const mins = Math.max(1, Math.round(Math.abs(diff) / 60000));
  if (diff <= 0) return mins < 60 ? `متأخرة ${mins.toLocaleString("ar-EG")} د` : `متأخرة ${(mins / 60).toFixed(1)} س`;
  return mins < 60 ? `متبقي ${mins.toLocaleString("ar-EG")} د` : `متبقي ${(mins / 60).toFixed(1)} س`;
}

function sortTasks(a: OperationsTask, b: OperationsTask) {
  if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
  const rank: Record<string, number> = { urgent: 0, high: 1, normal: 2 };
  const priority = (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3);
  if (priority) return priority;
  return (a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER) - (b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER);
}

export default function FinanceShiftVarianceTaskCenter() {
  const navigate = useNavigate();
  const { currentBranchId } = useBranchStore();
  const query = useQuery({
    queryKey: ["finance-shift-variance-task-center", currentBranchId],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchOperationsTasks(currentBranchId as string, "all", 250),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });

  const active = useMemo(() => (query.data || []).filter(task => isShiftReconciliationTask(task) && activeStatuses.has(task.status)).sort(sortTasks), [query.data]);
  const available = useMemo(() => active.filter(task => task.status === "open"), [active]);
  const mine = useMemo(() => active.filter(task => task.is_mine), [active]);
  const overdue = useMemo(() => active.filter(task => task.is_overdue), [active]);
  const totalVariance = useMemo(() => active.reduce((sum, task) => sum + Math.abs(Number(task.variance_amount ?? task.amount ?? 0)), 0), [active]);
  const preview = active.slice(0, 4);

  if (!currentBranchId) return null;

  return (
    <section dir="rtl" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><Scale className="h-5 w-5 text-violet-700" /><h2 className="text-lg font-black">مراجعة فروق تسوية الورديات</h2><Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100">SLA 4h</Badge>{overdue.length > 0 && <Badge className="bg-red-600">{overdue.length.toLocaleString("ar-EG")} متأخرة</Badge>}</div>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">أي فرق بين المتوقع والمبلغ الذي أكده الكاشير أو المدير يتحول تلقائيًا لمهمة مراجعة. إغلاق المهمة يوثّق نتيجة التحقيق فقط ولا ينشئ قيدًا ماليًا جديدًا ولا يغيّر التسوية الأصلية.</p>
        </div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> تحديث</Button><Button onClick={() => navigate("/tasks")}>فتح مركز المهام <ArrowLeft className="h-4 w-4" /></Button></div>
      </div>

      {query.isError && <Alert variant="destructive"><AlertDescription>{query.error instanceof Error ? query.error.message : "تعذر تحميل فروق الورديات."}</AlertDescription></Alert>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-slate-100"><CardContent className="p-4"><p className="text-xs text-slate-500">مراجعات نشطة</p><strong className="mt-1 block text-2xl">{active.length.toLocaleString("ar-EG")}</strong><p className="mt-1 text-[11px] text-slate-400">كل الفروق المفتوحة</p></CardContent></Card>
        <Card className="border-slate-100"><CardContent className="p-4"><p className="text-xs text-slate-500">متاحة / مهامي</p><strong className="mt-1 block text-2xl text-violet-700">{available.length.toLocaleString("ar-EG")} / {mine.length.toLocaleString("ar-EG")}</strong><p className="mt-1 text-[11px] text-slate-400">مسؤولية المراجعة</p></CardContent></Card>
        <Card className={overdue.length ? "border-red-200 bg-red-50/40" : "border-slate-100"}><CardContent className="p-4"><p className="text-xs text-slate-500">متأخرة</p><strong className={`mt-1 block text-2xl ${overdue.length ? "text-red-700" : "text-slate-900"}`}>{overdue.length.toLocaleString("ar-EG")}</strong><p className="mt-1 text-[11px] text-slate-400">تجاوزت SLA</p></CardContent></Card>
        <Card className="border-slate-100"><CardContent className="p-4"><p className="text-xs text-slate-500">إجمالي الفروق قيد المراجعة</p><strong className="mt-1 block text-xl text-red-700">{money(totalVariance)}</strong><p className="mt-1 text-[11px] text-slate-400">قيمة مراجعة وليست قيدًا ماليًا</p></CardContent></Card>
      </div>

      {query.isLoading ? <Card className="h-36 animate-pulse border-slate-100 bg-slate-50" /> : active.length === 0 ? (
        <Alert className="border-emerald-200 bg-emerald-50"><CheckCircle2 className="h-4 w-4 text-emerald-700" /><AlertDescription className="text-emerald-800">لا توجد فروق تسوية ورديات تحتاج مراجعة حاليًا.</AlertDescription></Alert>
      ) : (
        <Card className="border-slate-100 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-base">أعلى أولوية للمراجعة</CardTitle></CardHeader><CardContent className="space-y-2">
          {preview.map(task => (
            <button key={task.id} type="button" onClick={() => navigate("/tasks")} className={`w-full rounded-2xl border p-4 text-right transition hover:bg-slate-50 ${task.is_overdue ? "border-red-200 bg-red-50/40" : "border-slate-100"}`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong>{task.payment_method_name || task.method_code || "وسيلة دفع"}</strong><Badge variant="outline">{task.reference_number || "وردية"}</Badge><Badge variant="outline" className={task.is_overdue ? "border-red-200 text-red-700" : ""}><Clock3 className="ml-1 h-3.5 w-3.5" />{slaLabel(task)}</Badge></div><div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500"><span>الكاشير: {task.cashier_name || "غير متاح"}</span><span className="inline-flex items-center gap-1"><UserRoundCheck className="h-3.5 w-3.5" />{task.claimed_by_name || "متاحة للفريق"}</span>{task.variance_reason && <span>السبب: {task.variance_reason}</span>}</div></div>
                <div className="grid min-w-[330px] grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-slate-50 p-2"><div className="text-[10px] text-slate-500">المتوقع</div><strong className="text-sm">{money(task.expected_amount)}</strong></div><div className="rounded-xl bg-slate-50 p-2"><div className="text-[10px] text-slate-500">المؤكد</div><strong className="text-sm">{money(task.counted_amount)}</strong></div><div className="rounded-xl bg-red-50 p-2"><div className="text-[10px] text-red-500">الفرق</div><strong className="text-sm text-red-700">{money(task.variance_amount ?? task.amount)}</strong></div></div>
              </div>
              {task.is_overdue && <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-red-700"><AlertTriangle className="h-3.5 w-3.5" />تحتاج متابعة فورية</div>}
            </button>
          ))}
          {active.length > preview.length && <Button variant="ghost" className="w-full" onClick={() => navigate("/tasks")}>عرض كل {active.length.toLocaleString("ar-EG")} مراجعة</Button>}
        </CardContent></Card>
      )}
    </section>
  );
}

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, RefreshCw, UserRoundCheck, WalletCards } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { siteConfig } from "@/config/site";
import { fetchOperationsTasks, isRefundTransferTask, type OperationsTask } from "@/services/supabase/operationsTaskService";
import { useBranchStore } from "@/stores/branchStore";

const tasksHref = "/tasks?type=refund";
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

export default function FinanceRefundTaskCenter() {
  const navigate = useNavigate();
  const { currentBranchId } = useBranchStore();
  const query = useQuery({
    queryKey: ["finance-refund-task-center", currentBranchId],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchOperationsTasks(currentBranchId as string, "all", 250),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });

  const active = useMemo(() => (query.data || []).filter(task => isRefundTransferTask(task) && activeStatuses.has(task.status)).sort(sortTasks), [query.data]);
  const available = useMemo(() => active.filter(task => task.status === "open"), [active]);
  const mine = useMemo(() => active.filter(task => task.is_mine), [active]);
  const overdue = useMemo(() => active.filter(task => task.is_overdue), [active]);
  const dueSoon = useMemo(() => {
    const now = Date.now();
    return active.filter(task => task.due_at && !task.is_overdue && new Date(task.due_at).getTime() - now <= 3_600_000);
  }, [active]);
  const activeAmount = useMemo(() => active.reduce((sum, task) => sum + Number(task.amount || 0), 0), [active]);
  const preview = active.slice(0, 4);

  if (!currentBranchId) return null;

  return (
    <section dir="rtl" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><WalletCards className="h-5 w-5 text-primary" /><h2 className="text-lg font-black">مهام رد المبالغ الإلكترونية</h2><Badge variant="secondary">SLA 4h</Badge>{overdue.length > 0 && <Badge className="bg-red-600">{overdue.length.toLocaleString("ar-EG")} متأخرة</Badge>}</div>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">كل مرتجع إلكتروني يحتاج تحويل فعلي يظل ظاهرًا للفريق حتى يستلمه موظف. هذا المركز لا يخلط فروق الورديات بمبالغ المرتجعات.</p>
        </div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> تحديث</Button><Button onClick={() => navigate(tasksHref)}>فتح مهام المرتجعات <ArrowLeft className="h-4 w-4" /></Button></div>
      </div>

      {query.isError && <Alert variant="destructive"><AlertDescription>{query.error instanceof Error ? query.error.message : "تعذر تحميل مهام رد المبالغ."}</AlertDescription></Alert>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-slate-500">متاحة للفريق</p><strong className="mt-1 block text-2xl">{available.length.toLocaleString("ar-EG")}</strong></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-slate-500">مهامي الحالية</p><strong className="mt-1 block text-2xl text-blue-700">{mine.length.toLocaleString("ar-EG")}</strong></CardContent></Card>
        <Card className={overdue.length ? "border-red-200 bg-red-50/40" : ""}><CardContent className="p-4"><p className="text-xs text-slate-500">متأخرة / أقل من ساعة</p><strong className={overdue.length ? "mt-1 block text-2xl text-red-700" : "mt-1 block text-2xl text-amber-700"}>{overdue.length.toLocaleString("ar-EG")} / {dueSoon.length.toLocaleString("ar-EG")}</strong></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-slate-500">إجمالي مبالغ معلقة</p><strong className="mt-1 block text-xl text-[#005931]">{money(activeAmount)}</strong></CardContent></Card>
      </div>

      {query.isLoading ? <Card className="h-36 animate-pulse bg-slate-50" /> : active.length === 0 ? (
        <Alert className="border-emerald-200 bg-emerald-50"><CheckCircle2 className="h-4 w-4 text-emerald-700" /><AlertDescription className="text-emerald-800">لا توجد حاليًا مبالغ مرتجعات إلكترونية تنتظر التحويل.</AlertDescription></Alert>
      ) : (
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">الأولوية الآن</CardTitle></CardHeader><CardContent className="space-y-2">
          {preview.map(task => <button key={task.id} type="button" onClick={() => navigate(tasksHref)} className={`flex w-full flex-col gap-3 rounded-2xl border p-3 text-right transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between ${task.is_overdue ? "border-red-200 bg-red-50/50" : ""}`}><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="truncate">{task.title}</strong><Badge variant="outline">{task.payment_method_name || task.payment_method_code || "إلكتروني"}</Badge><Badge variant="outline" className={task.is_overdue ? "border-red-200 text-red-700" : ""}><Clock3 className="ml-1 h-3.5 w-3.5" />{slaLabel(task)}</Badge></div><div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500"><span>{task.reference_number || task.invoice_number || "مرتجع إلكتروني"}</span><span>{task.customer_name || "عميل غير مرتبط"}</span><span className="inline-flex items-center gap-1"><UserRoundCheck className="h-3.5 w-3.5" />{task.claimed_by_name || "متاحة للفريق"}</span></div></div><div className="flex items-center gap-2">{task.is_overdue && <AlertTriangle className="h-5 w-5 text-red-600" />}<strong className="whitespace-nowrap text-lg text-[#005931]">{money(task.amount)}</strong></div></button>)}
          {active.length > preview.length && <Button variant="ghost" className="w-full" onClick={() => navigate(tasksHref)}>عرض كل {active.length.toLocaleString("ar-EG")} مهمة مرتجع</Button>}
        </CardContent></Card>
      )}
    </section>
  );
}

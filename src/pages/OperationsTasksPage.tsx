import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  History,
  Loader2,
  PackageCheck,
  Play,
  RefreshCw,
  RotateCcw,
  Scale,
  ScanLine,
  UserRoundCheck,
  WalletCards,
} from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useBranchStore } from "@/stores/branchStore";
import { siteConfig } from "@/config/site";
import {
  claimOperationsTask,
  completeOperationsTask,
  completeRefundTransferTask,
  failOperationsTask,
  fetchOperationsTaskEvents,
  fetchOperationsTasks,
  isCashHandoffVarianceTask,
  isInventoryAdjustmentReviewTask,
  isInventoryCountTask,
  isInventoryRecountTask,
  isInventoryTask,
  isOperationsReviewTask,
  isRefundTransferTask,
  isShiftReconciliationTask,
  releaseOperationsTask,
  startOperationsTask,
  type OperationsTask,
  type OperationsTaskEvent,
} from "@/services/supabase/operationsTaskService";
import {
  ensureDailyInventoryAuditTasksV2,
  fetchInventoryAuditTaskV2,
  submitInventoryCountV2,
  submitInventoryRecountV2,
  type InventoryAuditTaskDetail,
} from "@/services/supabase/inventoryAuditV2Service";

type TaskTypeFilter = "all" | "refund" | "shift" | "cash_handoff" | "inventory";

const formatMoney = (value: number | null | undefined) =>
  `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${siteConfig.currency}`;

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "—";
  }
};

const statusClass: Record<string, string> = {
  open: "border-emerald-200 bg-emerald-50 text-emerald-800",
  claimed: "border-blue-200 bg-blue-50 text-blue-800",
  in_progress: "border-amber-200 bg-amber-50 text-amber-800",
  completed: "border-slate-200 bg-slate-50 text-slate-700",
  failed: "border-red-200 bg-red-50 text-red-800",
  cancelled: "border-slate-200 bg-slate-50 text-slate-500",
};

function statusLabel(task: OperationsTask) {
  if (isInventoryTask(task)) {
    if (task.status === "open") return "متاحة للمراجعة";
    if (task.status === "claimed") return "مسندة";
    if (task.status === "in_progress") return isInventoryAdjustmentReviewTask(task) ? "قيد الاعتماد" : "جاري العد";
    if (task.status === "completed") return "تم التسليم";
    if (task.status === "failed") return "تعذر التنفيذ";
  }
  const review = isOperationsReviewTask(task);
  if (task.status === "open") return "متاحة للجميع";
  if (task.status === "claimed") return "تم الاستلام";
  if (task.status === "in_progress") return review ? "قيد المراجعة" : "جاري التحويل";
  if (task.status === "completed") return review ? "تمت المراجعة" : "تم التحويل";
  if (task.status === "failed") return review ? "تعذر المراجعة" : "تعذر التحويل";
  if (task.status === "cancelled") return "ملغاة";
  return task.status;
}

function sourceLabel(task: OperationsTask) {
  if (isInventoryCountTask(task)) return "جرد يومي";
  if (isInventoryRecountTask(task)) return "إعادة عد مستقلة";
  if (isInventoryAdjustmentReviewTask(task)) return "اعتماد فرق مخزون";
  if (isCashHandoffVarianceTask(task)) return "فرق استلام نقدية";
  if (isShiftReconciliationTask(task)) return "فرق تسوية وردية";
  if (task.source_kind === "pos_refund") return "مرتجع POS";
  if (task.source_kind === "online_refund") return "مرتجع أونلاين";
  return "مهمة تشغيلية";
}

function normalizeTypeFilter(value: string | null): TaskTypeFilter {
  if (value === "refund") return "refund";
  if (value === "shift" || value === "shift_variance_review" || value === "shift_reconciliation") return "shift";
  if (value === "cash_handoff" || value === "cash_handoff_variance_review") return "cash_handoff";
  if (value === "inventory" || value?.startsWith("inventory_")) return "inventory";
  return "all";
}

export default function OperationsTasksPage() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const typeFilter = normalizeTypeFilter(searchParams.get("type"));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [completeRefundTask, setCompleteRefundTask] = useState<OperationsTask | null>(null);
  const [completeReviewTask, setCompleteReviewTask] = useState<OperationsTask | null>(null);
  const [failTask, setFailTask] = useState<OperationsTask | null>(null);
  const [historyTask, setHistoryTask] = useState<OperationsTask | null>(null);
  const [inventoryTask, setInventoryTask] = useState<OperationsTask | null>(null);
  const [inventoryDetail, setInventoryDetail] = useState<InventoryAuditTaskDetail | null>(null);
  const [providerReference, setProviderReference] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [failureReason, setFailureReason] = useState("");
  const [actualCount, setActualCount] = useState("");
  const [countNote, setCountNote] = useState("");
  const [barcodeCheck, setBarcodeCheck] = useState("");

  const generationQuery = useQuery({
    queryKey: ["daily-inventory-audit-v2", currentBranchId],
    enabled: Boolean(currentBranchId),
    queryFn: async () => {
      try {
        return await ensureDailyInventoryAuditTasksV2(currentBranchId as string, 5);
      } catch {
        return null;
      }
    },
    staleTime: 10 * 60_000,
    retry: false,
  });

  const query = useQuery({
    queryKey: ["operations-tasks", currentBranchId],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchOperationsTasks(currentBranchId as string, "all", 250),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (generationQuery.data) void query.refetch();
  }, [generationQuery.data?.session_id, generationQuery.data?.generated]);

  const historyQuery = useQuery({
    queryKey: ["operations-task-events", historyTask?.id],
    enabled: Boolean(historyTask?.id),
    queryFn: () => fetchOperationsTaskEvents(historyTask!.id),
  });

  const rawData = query.data || [];
  const data = useMemo(() => {
    if (typeFilter === "refund") return rawData.filter(isRefundTransferTask);
    if (typeFilter === "shift") return rawData.filter(isShiftReconciliationTask);
    if (typeFilter === "cash_handoff") return rawData.filter(isCashHandoffVarianceTask);
    if (typeFilter === "inventory") return rawData.filter(isInventoryTask);
    return rawData;
  }, [rawData, typeFilter]);

  const available = useMemo(() => data.filter(task => task.status === "open"), [data]);
  const mine = useMemo(() => data.filter(task => task.is_mine && ["claimed", "in_progress", "failed"].includes(task.status)), [data]);
  const active = useMemo(() => data.filter(task => ["open", "claimed", "in_progress", "failed"].includes(task.status)), [data]);
  const overdue = useMemo(() => data.filter(task => task.is_overdue && !["completed", "cancelled"].includes(task.status)), [data]);
  const completed = useMemo(() => data.filter(task => task.status === "completed"), [data]);
  const refundActive = rawData.filter(task => isRefundTransferTask(task) && !["completed", "cancelled"].includes(task.status)).length;
  const varianceActive = rawData.filter(task => isShiftReconciliationTask(task) && !["completed", "cancelled"].includes(task.status)).length;
  const cashHandoffActive = rawData.filter(task => isCashHandoffVarianceTask(task) && !["completed", "cancelled"].includes(task.status)).length;
  const inventoryActive = rawData.filter(task => isInventoryTask(task) && !["completed", "cancelled"].includes(task.status)).length;

  const changeTypeFilter = (value: TaskTypeFilter) => {
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete("type");
    else next.set("type", value);
    setSearchParams(next, { replace: true });
  };

  const run = async (taskId: string, action: () => Promise<unknown>, success: string) => {
    setBusyId(taskId);
    try {
      await action();
      toast.success(success);
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تنفيذ الإجراء.");
      await query.refetch();
    } finally {
      setBusyId(null);
    }
  };

  const openInventory = async (task: OperationsTask) => {
    setBusyId(task.id);
    try {
      if (task.status === "open" && task.can_claim) await claimOperationsTask(task.id);
      if ((isInventoryCountTask(task) || isInventoryRecountTask(task)) && task.status !== "completed") {
        try { await startOperationsTask(task.id); } catch { /* already started/claimed is safe */ }
      }
      const detail = await fetchInventoryAuditTaskV2(task.id);
      setInventoryTask(task);
      setInventoryDetail(detail);
      setActualCount("");
      setCountNote("");
      setBarcodeCheck("");
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر فتح مهمة الجرد.");
    } finally {
      setBusyId(null);
    }
  };

  const closeInventoryDialog = () => {
    setInventoryTask(null);
    setInventoryDetail(null);
    setActualCount("");
    setCountNote("");
    setBarcodeCheck("");
  };

  const submitInventory = async () => {
    if (!inventoryTask || !inventoryDetail || busyId) return;
    if (isInventoryAdjustmentReviewTask(inventoryTask)) return;
    if (inventoryDetail.barcode && barcodeCheck.trim() !== inventoryDetail.barcode.trim()) {
      return toast.error("امسح باركود المنتج الصحيح قبل تسجيل الكمية.");
    }
    const parsed = Number(actualCount);
    if (!Number.isFinite(parsed) || parsed < 0) return toast.error("أدخل الكمية الفعلية التي وجدتها.");
    setBusyId(inventoryTask.id);
    try {
      const result = isInventoryRecountTask(inventoryTask)
        ? await submitInventoryRecountV2(inventoryTask.id, parsed, countNote)
        : await submitInventoryCountV2(inventoryTask.id, parsed, countNote);
      if (result.result === "matched" || result.result === "matched_system") {
        toast.success(result.result === "matched" ? "تم تسجيل الجرد والكمية مطابقة." : "إعادة العد طابقت النظام وتم إغلاق الفرق بدون تعديل مخزون.");
      } else if (result.result === "discrepancy") {
        toast.warning("تم تسجيل فرق الجرد وإنشاء إعادة عد مستقلة لموظف آخر.");
      } else {
        toast.warning("تم تسجيل إعادة العد وتحويل الحالة لمراجعة واعتماد المخزون.");
      }
      closeInventoryDialog();
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تسليم نتيجة الجرد.");
    } finally {
      setBusyId(null);
    }
  };

  const submitRefundComplete = async () => {
    if (!completeRefundTask || busyId) return;
    if (providerReference.trim().length < 3) return toast.error("اكتب رقم العملية أو المرجع.");
    const task = completeRefundTask;
    setBusyId(task.id);
    try {
      await completeRefundTransferTask(task.id, providerReference);
      toast.success("تم تأكيد تحويل مبلغ المرتجع وتسجيل الحركة المالية.");
      setCompleteRefundTask(null);
      setProviderReference("");
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تأكيد التحويل.");
    } finally {
      setBusyId(null);
    }
  };

  const submitReviewComplete = async () => {
    if (!completeReviewTask || busyId) return;
    if (resolutionNote.trim().length < 3) return toast.error("اكتب نتيجة المراجعة قبل الإغلاق.");
    const task = completeReviewTask;
    setBusyId(task.id);
    try {
      await completeOperationsTask(task.id, resolutionNote);
      toast.success("تم إغلاق المراجعة وتوثيق النتيجة.");
      setCompleteReviewTask(null);
      setResolutionNote("");
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إغلاق المراجعة.");
    } finally {
      setBusyId(null);
    }
  };

  const submitFailure = async () => {
    if (!failTask || busyId) return;
    if (failureReason.trim().length < 3) return toast.error("اكتب سبب تعذر التنفيذ.");
    const task = failTask;
    setBusyId(task.id);
    try {
      await failOperationsTask(task.id, failureReason);
      toast.success("تم تسجيل سبب تعذر التنفيذ ويمكن إعادة المحاولة أو إرجاع المهمة.");
      setFailTask(null);
      setFailureReason("");
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تسجيل المشكلة.");
    } finally {
      setBusyId(null);
    }
  };

  const TaskCard = ({ task }: { task: OperationsTask }) => {
    const busy = busyId === task.id;
    const review = isOperationsReviewTask(task);
    const inventory = isInventoryTask(task);
    const cashReview = isCashHandoffVarianceTask(task);
    const refund = isRefundTransferTask(task);
    const resolution = typeof task.metadata?.resolution_note === "string" ? task.metadata.resolution_note : null;

    return (
      <Card className={`overflow-hidden ${task.is_overdue && task.status !== "completed" ? "border-red-200 shadow-[0_8px_30px_rgba(220,38,38,.08)]" : ""}`}>
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={statusClass[task.status] || ""}>{statusLabel(task)}</Badge>
            <Badge variant="outline" className={inventory ? "border-cyan-200 bg-cyan-50 text-cyan-800" : review ? "border-violet-200 bg-violet-50 text-violet-800" : ""}>{sourceLabel(task)}</Badge>
            {task.is_overdue && task.status !== "completed" && <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700"><AlertTriangle className="ml-1 h-3.5 w-3.5" />متأخرة</Badge>}
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-950">{task.title}</h3>
              <div className="mt-1 text-xs text-muted-foreground">{task.reference_number || task.invoice_number || "مهمة تشغيلية"} · {formatDateTime(task.created_at)}</div>
            </div>
            <div className="text-left">
              {inventory ? <div className="text-sm font-bold text-cyan-800">{isInventoryAdjustmentReviewTask(task) ? "مراجعة واعتماد" : "Blind Count"}</div> : <div className="text-2xl font-black text-[#005931]">{formatMoney(task.amount)}</div>}
              {task.due_at && <div className="mt-1 text-xs text-muted-foreground">SLA: {formatDateTime(task.due_at)}</div>}
            </div>
          </div>

          {review && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-2xl bg-slate-50 p-3"><div className="text-[11px] text-muted-foreground">النوع</div><div className="mt-1 font-bold">{cashReview ? "استلام نقدية" : task.payment_method_name || task.method_code || "تسوية"}</div></div>
              <div className="rounded-2xl bg-slate-50 p-3"><div className="text-[11px] text-muted-foreground">الكاشير</div><div className="mt-1 font-bold">{task.cashier_name || "غير متاح"}</div></div>
              <div className="rounded-2xl bg-slate-50 p-3"><div className="text-[11px] text-muted-foreground">المتوقع</div><div className="mt-1 font-black">{formatMoney(task.expected_amount)}</div></div>
              <div className="rounded-2xl bg-slate-50 p-3"><div className="text-[11px] text-muted-foreground">المؤكد</div><div className="mt-1 font-black">{formatMoney(task.counted_amount)}</div></div>
              <div className="rounded-2xl bg-red-50 p-3"><div className="text-[11px] text-muted-foreground">الفرق</div><div className="mt-1 font-black text-red-700">{formatMoney(task.variance_amount)}</div></div>
            </div>
          )}

          {task.description && <p className="mt-3 text-sm leading-6 text-muted-foreground">{task.description}</p>}
          {resolution && <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">نتيجة المراجعة: {resolution}</div>}

          <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
            {task.status === "open" && task.can_claim && !isInventoryAdjustmentReviewTask(task) && (
              <Button disabled={busy} onClick={() => run(task.id, () => claimOperationsTask(task.id), "تم استلام المهمة.")}><UserRoundCheck className="ml-2 h-4 w-4" />استلام</Button>
            )}

            {inventory && task.status !== "completed" && (task.is_mine || task.can_claim || isInventoryAdjustmentReviewTask(task)) && (
              <Button disabled={busy} onClick={() => openInventory(task)} className="bg-cyan-700 hover:bg-cyan-800"><ClipboardCheck className="ml-2 h-4 w-4" />{isInventoryAdjustmentReviewTask(task) ? "عرض تفاصيل الاعتماد" : isInventoryRecountTask(task) ? "فتح إعادة العد" : "فتح الجرد"}</Button>
            )}

            {!inventory && task.is_mine && task.status === "claimed" && (
              <Button variant="outline" disabled={busy} onClick={() => run(task.id, () => startOperationsTask(task.id), review ? "بدأت المراجعة." : "بدأ تنفيذ المهمة.")}><Play className="ml-2 h-4 w-4" />بدء</Button>
            )}
            {!inventory && task.is_mine && ["claimed", "in_progress", "failed"].includes(task.status) && refund && (
              <Button disabled={busy} onClick={() => { setCompleteRefundTask(task); setProviderReference(""); }}><CheckCircle2 className="ml-2 h-4 w-4" />تأكيد التحويل</Button>
            )}
            {!inventory && task.is_mine && ["claimed", "in_progress", "failed"].includes(task.status) && review && (
              <Button disabled={busy} onClick={() => { setCompleteReviewTask(task); setResolutionNote(""); }}><Scale className="ml-2 h-4 w-4" />إغلاق المراجعة</Button>
            )}
            {task.is_mine && ["claimed", "in_progress", "failed"].includes(task.status) && !isInventoryAdjustmentReviewTask(task) && (
              <>
                <Button variant="outline" disabled={busy} onClick={() => run(task.id, () => releaseOperationsTask(task.id, "إرجاع للمجموعة"), "تم إرجاع المهمة للمجموعة.")}><RotateCcw className="ml-2 h-4 w-4" />إرجاع</Button>
                <Button variant="ghost" disabled={busy} onClick={() => { setFailTask(task); setFailureReason(""); }}><AlertTriangle className="ml-2 h-4 w-4" />تعذر التنفيذ</Button>
              </>
            )}
            <Button variant="ghost" onClick={() => setHistoryTask(task)}><History className="ml-2 h-4 w-4" />السجل</Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const TaskList = ({ rows, empty }: { rows: OperationsTask[]; empty: string }) => (
    <div className="space-y-3">{rows.length ? rows.map(task => <TaskCard key={task.id} task={task} />) : <div className="rounded-3xl border border-dashed bg-white p-10 text-center text-sm text-muted-foreground">{empty}</div>}</div>
  );

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-[1500px] space-y-5 py-5">
        <section className="rounded-3xl border bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div><div className="flex items-center gap-2"><PackageCheck className="h-6 w-6 text-[#005931]" /><h1 className="text-2xl font-black">مركز المهام التشغيلية</h1></div><p className="mt-2 text-sm text-muted-foreground">{currentBranchName || "الفرع الحالي"} · مرتجعات، تسويات، عهد نقدية، وجرد يومي أعمى في طابور واحد.</p></div>
            <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث</Button>
          </div>

          {generationQuery.data && (
            <div className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50/70 p-3 text-sm text-cyan-950">
              جرد اليوم: {generationQuery.data.generated > 0 ? `تم توزيع ${generationQuery.data.generated} مهمة` : `${generationQuery.data.existing || 0} مهمة موجودة بالفعل`} على {generationQuery.data.eligible_staff} موظف مؤهل.
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button size="sm" variant={typeFilter === "all" ? "default" : "outline"} onClick={() => changeTypeFilter("all")}>الكل <Badge variant="secondary" className="mr-2">{active.length}</Badge></Button>
            <Button size="sm" variant={typeFilter === "inventory" ? "default" : "outline"} onClick={() => changeTypeFilter("inventory")}><ClipboardCheck className="ml-1 h-4 w-4" />الجرد <Badge variant="secondary" className="mr-2">{inventoryActive}</Badge></Button>
            <Button size="sm" variant={typeFilter === "refund" ? "default" : "outline"} onClick={() => changeTypeFilter("refund")}><WalletCards className="ml-1 h-4 w-4" />المرتجعات <Badge variant="secondary" className="mr-2">{refundActive}</Badge></Button>
            <Button size="sm" variant={typeFilter === "shift" ? "default" : "outline"} onClick={() => changeTypeFilter("shift")}><Scale className="ml-1 h-4 w-4" />فروق الورديات <Badge variant="secondary" className="mr-2">{varianceActive}</Badge></Button>
            <Button size="sm" variant={typeFilter === "cash_handoff" ? "default" : "outline"} onClick={() => changeTypeFilter("cash_handoff")}><Banknote className="ml-1 h-4 w-4" />استلام النقدية <Badge variant="secondary" className="mr-2">{cashHandoffActive}</Badge></Button>
          </div>
        </section>

        {query.isLoading ? <div className="flex min-h-[360px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#005931]" /></div> : query.isError ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-800">{query.error instanceof Error ? query.error.message : "تعذر تحميل المهام."}</div>
        ) : (
          <Tabs defaultValue="mine" dir="rtl">
            <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-2xl bg-white p-1.5 shadow-sm">
              <TabsTrigger value="mine">مهامي ({mine.length})</TabsTrigger>
              <TabsTrigger value="available">متاحة ({available.length})</TabsTrigger>
              <TabsTrigger value="active">نشطة ({active.length})</TabsTrigger>
              <TabsTrigger value="overdue">متأخرة ({overdue.length})</TabsTrigger>
              <TabsTrigger value="completed">مكتملة ({completed.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="mine" className="mt-4"><TaskList rows={mine} empty="لا توجد مهام مسندة لك الآن." /></TabsContent>
            <TabsContent value="available" className="mt-4"><TaskList rows={available} empty="لا توجد مهام متاحة للاستلام." /></TabsContent>
            <TabsContent value="active" className="mt-4"><TaskList rows={active} empty="لا توجد مهام نشطة." /></TabsContent>
            <TabsContent value="overdue" className="mt-4"><TaskList rows={overdue} empty="لا توجد مهام متأخرة." /></TabsContent>
            <TabsContent value="completed" className="mt-4"><TaskList rows={completed} empty="لا توجد مهام مكتملة ضمن القائمة الحالية." /></TabsContent>
          </Tabs>
        )}
      </div>

      <Dialog open={Boolean(inventoryTask)} onOpenChange={(open) => !open && closeInventoryDialog()}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader><DialogTitle>{inventoryTask ? sourceLabel(inventoryTask) : "مهمة جرد"}</DialogTitle></DialogHeader>
          {!inventoryDetail ? <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div> : (
            <div className="space-y-4">
              <div className="flex gap-4 rounded-2xl border bg-slate-50 p-4">
                {inventoryDetail.image_url ? <img src={inventoryDetail.image_url} alt="" className="h-20 w-20 rounded-xl object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-white"><PackageCheck className="h-8 w-8 text-muted-foreground" /></div>}
                <div className="min-w-0"><h3 className="text-lg font-black">{inventoryDetail.product_name}</h3><p className="mt-1 text-sm text-muted-foreground">باركود: {inventoryDetail.barcode || "غير مسجل"}</p><p className="text-sm text-muted-foreground">الرف: {inventoryDetail.shelf_location || "غير محدد"} · الوحدة: {inventoryDetail.unit_of_measure || "قطعة"}</p></div>
              </div>

              {inventoryDetail.blind_count ? (
                <>
                  <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-950"><strong>Blind Count:</strong> رصيد النظام ونتيجة أي عد سابق مخفيان بالكامل. عدّ الموجود فعليًا فقط.</div>
                  {inventoryDetail.barcode && <div className="space-y-2"><Label htmlFor="inventory-barcode">تحقق من المنتج بالباركود</Label><div className="relative"><ScanLine className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="inventory-barcode" autoFocus value={barcodeCheck} onChange={e => setBarcodeCheck(e.target.value)} placeholder="امسح الباركود أو اكتبه" className="pr-9" /></div></div>}
                  <div className="space-y-2"><Label htmlFor="actual-count">الكمية الموجودة فعليًا ({inventoryDetail.unit_of_measure || "وحدة"})</Label><Input id="actual-count" type="number" inputMode="decimal" min="0" step="0.001" value={actualCount} onChange={e => setActualCount(e.target.value)} placeholder="0" /></div>
                  <div className="space-y-2"><Label htmlFor="count-note">ملاحظة (اختياري)</Label><Textarea id="count-note" value={countNote} onChange={e => setCountNote(e.target.value)} placeholder="مثال: عبوة مفتوحة، المنتج موزع على رفّين..." /></div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">هذه مرحلة مراجعة مدير المخزون. لا يتم تعديل المخزون تلقائيًا من نتيجة العد.</div>
                  <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-muted-foreground">رصيد النظام وقت إعادة العد</div><div className="mt-1 text-xl font-black">{inventoryDetail.system_expected ?? "—"}</div></div><div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-muted-foreground">العد الأول</div><div className="mt-1 text-xl font-black">{inventoryDetail.first_count ?? "—"}</div></div><div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-muted-foreground">إعادة العد</div><div className="mt-1 text-xl font-black">{inventoryDetail.recount ?? "—"}</div></div><div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-muted-foreground">حالة التحقق</div><div className="mt-1 font-black">{inventoryDetail.verification_status || "—"}</div></div></div>
                  <p className="text-sm text-muted-foreground">إجراء الاعتماد والتسوية الذرية سيتم توصيله في المرحلة التالية؛ هذه الشاشة الآن تعرض أدلة المراجعة فقط.</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeInventoryDialog}>إغلاق</Button>
            {inventoryDetail?.blind_count && <Button onClick={submitInventory} disabled={Boolean(busyId)}>{busyId ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="ml-2 h-4 w-4" />}تسليم العد</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(completeRefundTask)} onOpenChange={(open) => !open && setCompleteRefundTask(null)}><DialogContent dir="rtl"><DialogHeader><DialogTitle>تأكيد تحويل المرتجع</DialogTitle></DialogHeader><div className="space-y-2"><Label>رقم العملية / المرجع</Label><Input value={providerReference} onChange={e => setProviderReference(e.target.value)} /></div><DialogFooter><Button variant="outline" onClick={() => setCompleteRefundTask(null)}>إلغاء</Button><Button onClick={submitRefundComplete}>تأكيد</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={Boolean(completeReviewTask)} onOpenChange={(open) => !open && setCompleteReviewTask(null)}><DialogContent dir="rtl"><DialogHeader><DialogTitle>إغلاق المراجعة</DialogTitle></DialogHeader><div className="space-y-2"><Label>نتيجة المراجعة</Label><Textarea value={resolutionNote} onChange={e => setResolutionNote(e.target.value)} /></div><DialogFooter><Button variant="outline" onClick={() => setCompleteReviewTask(null)}>إلغاء</Button><Button onClick={submitReviewComplete}>إغلاق وتوثيق</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={Boolean(failTask)} onOpenChange={(open) => !open && setFailTask(null)}><DialogContent dir="rtl"><DialogHeader><DialogTitle>تعذر تنفيذ المهمة</DialogTitle></DialogHeader><div className="space-y-2"><Label>السبب</Label><Textarea value={failureReason} onChange={e => setFailureReason(e.target.value)} /></div><DialogFooter><Button variant="outline" onClick={() => setFailTask(null)}>إلغاء</Button><Button variant="destructive" onClick={submitFailure}>تسجيل السبب</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={Boolean(historyTask)} onOpenChange={(open) => !open && setHistoryTask(null)}><DialogContent dir="rtl" className="max-w-xl"><DialogHeader><DialogTitle>سجل المهمة</DialogTitle></DialogHeader><div className="max-h-[55vh] space-y-2 overflow-y-auto">{historyQuery.isLoading ? <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div> : (historyQuery.data || []).length ? (historyQuery.data || []).map((event: OperationsTaskEvent) => <div key={event.id} className="rounded-xl border p-3"><div className="flex items-center justify-between gap-2"><strong>{event.event_type}</strong><span className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}</span></div>{event.actor_name && <p className="mt-1 text-xs text-muted-foreground">بواسطة: {event.actor_name}</p>}{event.note && <p className="mt-2 text-sm">{event.note}</p>}</div>) : <p className="p-8 text-center text-sm text-muted-foreground">لا توجد أحداث مسجلة.</p>}</div></DialogContent></Dialog>
    </MainLayout>
  );
}

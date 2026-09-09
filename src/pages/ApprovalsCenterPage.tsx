import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Loader2,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  Warehouse,
} from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useBranchStore } from "@/stores/branchStore";
import {
  fetchApprovalCenterV1,
  type ApprovalItem,
  type ApprovalScope,
} from "@/services/supabase/approvalCenterV1Service";
import { claimOperationsTask, startOperationsTask } from "@/services/supabase/operationsTaskService";
import {
  approveInventoryAdjustmentV2,
  fetchInventoryAuditTaskV2,
  rejectInventoryAdjustmentV2,
  type InventoryAdjustmentReason,
  type InventoryAdjustmentRejectionReason,
  type InventoryAuditTaskDetail,
} from "@/services/supabase/inventoryAuditV2Service";

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
};

const formatQty = (value?: number | null) => Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 3 });

const sourceMeta = (sourceKind: string) => {
  if (sourceKind === "inventory_adjustment") return { label: "اعتماد فرق مخزون", icon: Warehouse, className: "border-cyan-200 bg-cyan-50 text-cyan-800" };
  if (sourceKind === "shift_reconciliation") return { label: "فرق وردية", icon: WalletCards, className: "border-violet-200 bg-violet-50 text-violet-800" };
  if (sourceKind === "cash_handoff") return { label: "فرق عهدة نقدية", icon: WalletCards, className: "border-amber-200 bg-amber-50 text-amber-800" };
  if (sourceKind === "inventory_transfer_variance") return { label: "فرق تحويل مخزون", icon: ClipboardCheck, className: "border-blue-200 bg-blue-50 text-blue-800" };
  return { label: "موافقة تشغيلية", icon: ShieldCheck, className: "border-slate-200 bg-slate-50 text-slate-700" };
};

const adjustmentReasonLabels: Record<InventoryAdjustmentReason, string> = {
  theft: "فقد / سرقة",
  damage: "تالف",
  breakage: "كسر",
  receiving_error: "خطأ استلام مورد",
  selling_error: "خطأ بيع / صرف",
  previous_error: "خطأ رصيد سابق",
  unknown: "سبب غير معروف",
};

const rejectionReasonLabels: Record<InventoryAdjustmentRejectionReason, string> = {
  counting_error: "خطأ في العد",
  insufficient_evidence: "الأدلة غير كافية",
  investigation_required: "يحتاج تحقيق إضافي",
  other: "سبب آخر",
};

export default function ApprovalsCenterPage() {
  const navigate = useNavigate();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [scope, setScope] = useState<ApprovalScope>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decisionTask, setDecisionTask] = useState<ApprovalItem | null>(null);
  const [inventoryDetail, setInventoryDetail] = useState<InventoryAuditTaskDetail | null>(null);
  const [adjustmentReason, setAdjustmentReason] = useState<InventoryAdjustmentReason>("unknown");
  const [rejectionReason, setRejectionReason] = useState<InventoryAdjustmentRejectionReason>("insufficient_evidence");
  const [note, setNote] = useState("");

  const query = useQuery({
    queryKey: ["approval-center-v1", currentBranchId, scope],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchApprovalCenterV1(currentBranchId as string, scope, 150),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const summary = query.data?.summary;
  const items = useMemo(() => query.data?.items || [], [query.data?.items]);

  const openApproval = async (item: ApprovalItem) => {
    if (item.source_kind !== "inventory_adjustment") {
      navigate(item.action_url || "/tasks");
      return;
    }
    setBusyId(item.id);
    try {
      if (item.status === "open" && item.can_claim) await claimOperationsTask(item.id);
      try { await startOperationsTask(item.id); } catch { /* may already be in progress */ }
      const detail = await fetchInventoryAuditTaskV2(item.id);
      setDecisionTask(item);
      setInventoryDetail(detail);
      setAdjustmentReason("unknown");
      setRejectionReason("insufficient_evidence");
      setNote("");
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر فتح الموافقة.");
      await query.refetch();
    } finally {
      setBusyId(null);
    }
  };

  const closeDecision = () => {
    setDecisionTask(null);
    setInventoryDetail(null);
    setNote("");
  };

  const approveInventory = async () => {
    if (!decisionTask || !inventoryDetail || busyId) return;
    if (note.trim().length < 3) return toast.error("اكتب ملاحظة توضح سبب الاعتماد.");
    if (Math.abs(Number(inventoryDetail.movement_ledger_gap || 0)) > 0.001) {
      return toast.error("يوجد فرق في Movement Ledger. الاعتماد متوقف لحماية المخزون.");
    }
    setBusyId(decisionTask.id);
    try {
      const result = await approveInventoryAdjustmentV2(decisionTask.id, adjustmentReason, note);
      toast.success(`تم اعتماد التسوية: ${formatQty(result.quantity_before)} ← ${formatQty(result.quantity_after)}.`);
      closeDecision();
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر اعتماد التسوية.");
    } finally {
      setBusyId(null);
    }
  };

  const rejectInventory = async () => {
    if (!decisionTask || busyId) return;
    if (note.trim().length < 3) return toast.error("اكتب ملاحظة توضح سبب الرفض.");
    setBusyId(decisionTask.id);
    try {
      await rejectInventoryAdjustmentV2(decisionTask.id, rejectionReason, note);
      toast.success("تم رفض التسوية وإرجاع مهمة الجرد للموظف لإعادة العد، بدون تعديل المخزون.");
      closeDecision();
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر رفض التسوية.");
    } finally {
      setBusyId(null);
    }
  };

  const cards = [
    { label: "معلقة", value: summary?.pending || 0, icon: ShieldCheck },
    { label: "عندي", value: summary?.mine || 0, icon: ClipboardCheck },
    { label: "متأخرة", value: summary?.overdue || 0, icon: AlertTriangle },
    { label: "حرجة", value: summary?.critical || 0, icon: Clock3 },
    { label: "مخزون", value: summary?.inventory || 0, icon: Warehouse },
    { label: "مالية", value: summary?.finance || 0, icon: WalletCards },
    { label: "تحويلات", value: summary?.transfers || 0, icon: ClipboardCheck },
    { label: "مكتملة اليوم", value: summary?.completed_today || 0, icon: CheckCircle2 },
  ];

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-[1500px] space-y-5 py-5">
        <section className="rounded-3xl border bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-[#005931]" /><h1 className="text-2xl font-black">مركز الموافقات</h1></div>
              <p className="mt-2 text-sm text-muted-foreground">{currentBranchName || "الفرع الحالي"} · كل القرارات التي تحتاج مراجعة وصلاحية إدارية في Inbox واحد.</p>
            </div>
            <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
              <RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
            {cards.map(card => <div key={card.label} className="rounded-2xl border bg-slate-50/70 p-3"><card.icon className="h-4 w-4 text-[#005931]" /><div className="mt-2 text-2xl font-black">{card.value.toLocaleString("ar-EG")}</div><div className="text-xs text-muted-foreground">{card.label}</div></div>)}
          </div>

          <Tabs value={scope} onValueChange={value => setScope(value as ApprovalScope)} dir="rtl" className="mt-5">
            <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-2xl bg-slate-100 p-1.5">
              <TabsTrigger value="pending">معلقة</TabsTrigger>
              <TabsTrigger value="mine">عندي</TabsTrigger>
              <TabsTrigger value="overdue">متأخرة</TabsTrigger>
              <TabsTrigger value="completed">مكتملة</TabsTrigger>
              <TabsTrigger value="all">الكل</TabsTrigger>
            </TabsList>
          </Tabs>
        </section>

        {query.isLoading ? (
          <div className="flex min-h-[320px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#005931]" /></div>
        ) : query.isError ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-800">{query.error instanceof Error ? query.error.message : "تعذر تحميل الموافقات."}</div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl border border-dashed bg-white p-12 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-emerald-700" /><h2 className="mt-3 text-lg font-black">لا توجد موافقات في هذا القسم</h2><p className="mt-1 text-sm text-muted-foreground">أي قرار جديد ضمن صلاحياتك سيظهر هنا تلقائيًا.</p></div>
        ) : (
          <div className="space-y-3">
            {items.map(item => {
              const meta = sourceMeta(item.source_kind);
              const Icon = meta.icon;
              const active = ["open", "claimed", "in_progress", "failed"].includes(item.status);
              return <Card key={item.id} className={item.is_overdue && active ? "border-red-200 shadow-[0_8px_30px_rgba(220,38,38,.07)]" : ""}>
                <CardContent className="p-4 md:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={meta.className}><Icon className="ml-1 h-3.5 w-3.5" />{meta.label}</Badge>
                        {item.priority === "urgent" && <Badge variant="destructive">حرجة</Badge>}
                        {item.priority === "high" && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">أولوية عالية</Badge>}
                        {item.is_overdue && active && <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">متأخرة</Badge>}
                        {item.is_mine && active && <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">مسندة لي</Badge>}
                        {item.status === "completed" && <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">مكتملة</Badge>}
                      </div>
                      <h3 className="mt-3 text-lg font-black text-slate-950">{item.title}</h3>
                      {item.description && <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p>}
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>أُنشئت: {formatDateTime(item.created_at)}</span>
                        {item.due_at && <span>SLA: {formatDateTime(item.due_at)}</span>}
                        {item.claimed_by_name && <span>المراجع: {item.claimed_by_name}</span>}
                        {item.completed_by_name && <span>أغلقها: {item.completed_by_name}</span>}
                      </div>
                      {item.resolution_note && <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">القرار: {item.resolution_note}</div>}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {active && <Button disabled={busyId === item.id} onClick={() => openApproval(item)}>
                        {busyId === item.id ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : item.source_kind === "inventory_adjustment" ? <ShieldCheck className="ml-2 h-4 w-4" /> : <ArrowLeft className="ml-2 h-4 w-4" />}
                        {item.source_kind === "inventory_adjustment" ? (item.is_mine ? "فتح القرار" : "استلام ومراجعة") : "فتح المسار"}
                      </Button>}
                      {!active && item.action_url && <Button variant="outline" onClick={() => navigate(item.action_url!)}>فتح المصدر</Button>}
                    </div>
                  </div>
                </CardContent>
              </Card>;
            })}
          </div>
        )}
      </div>

      <Dialog open={Boolean(decisionTask)} onOpenChange={open => !open && closeDecision()}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader><DialogTitle>قرار اعتماد فرق المخزون</DialogTitle></DialogHeader>
          {!inventoryDetail ? <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div> : <div className="space-y-4">
            <div className="rounded-2xl border bg-slate-50 p-4"><h3 className="font-black">{inventoryDetail.product_name}</h3><p className="mt-1 text-sm text-muted-foreground">باركود: {inventoryDetail.barcode || "غير مسجل"} · الرف: {inventoryDetail.shelf_location || "غير محدد"}</p></div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-muted-foreground">رصيد النظام</div><div className="mt-1 text-xl font-black">{formatQty(inventoryDetail.current_system_quantity)}</div></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-muted-foreground">الرصيد الفعلي المتوقع</div><div className="mt-1 text-xl font-black">{formatQty(inventoryDetail.projected_physical_quantity)}</div></div>
              <div className="rounded-xl bg-cyan-50 p-3"><div className="text-xs text-muted-foreground">التسوية المقترحة</div><div className="mt-1 text-xl font-black text-cyan-900">{Number(inventoryDetail.current_adjustment_delta || 0) > 0 ? "+" : ""}{formatQty(inventoryDetail.current_adjustment_delta)}</div></div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">العد الأول</div><div className="mt-1 font-black">{formatQty(inventoryDetail.first_count)}</div></div>
              <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">إعادة العد</div><div className="mt-1 font-black">{formatQty(inventoryDetail.recount)}</div></div>
              <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">حركات لاحقة</div><div className="mt-1 font-black">{formatQty(inventoryDetail.post_recount_movement)}</div></div>
            </div>
            {Math.abs(Number(inventoryDetail.movement_ledger_gap || 0)) > 0.001 && <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm font-bold text-red-800">Movement Ledger غير مطابق بفارق {formatQty(inventoryDetail.movement_ledger_gap)}. الاعتماد متوقف تلقائيًا.</div>}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>سبب الاعتماد</Label><Select value={adjustmentReason} onValueChange={value => setAdjustmentReason(value as InventoryAdjustmentReason)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(adjustmentReasonLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>سبب الرفض</Label><Select value={rejectionReason} onValueChange={value => setRejectionReason(value as InventoryAdjustmentRejectionReason)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(rejectionReasonLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="space-y-2"><Label>ملاحظة القرار</Label><Textarea value={note} onChange={event => setNote(event.target.value)} placeholder="اشرح ما راجعته وسبب القرار..." /></div>
          </div>}
          <DialogFooter className="gap-2 sm:justify-start">
            <Button variant="outline" onClick={closeDecision}>إغلاق</Button>
            <Button variant="destructive" onClick={rejectInventory} disabled={Boolean(busyId)}>رفض وإعادة الجرد</Button>
            <Button onClick={approveInventory} disabled={Boolean(busyId) || Math.abs(Number(inventoryDetail?.movement_ledger_gap || 0)) > 0.001}>{busyId ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="ml-2 h-4 w-4" />}اعتماد التسوية</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

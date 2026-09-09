import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Banknote, CheckCircle2, Loader2, RefreshCw, ShieldCheck, Vault, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useBranchStore } from "@/stores/branchStore";
import { claimOperationsTask, fetchOperationsTasks, startOperationsTask, type OperationsTask } from "@/services/supabase/operationsTaskService";
import {
  confirmTreasuryPayout,
  delegateHrSalaryAdvancePayout,
  fetchFinancePayoutSourcesV2,
  getTreasuryPayoutTask,
  rejectTreasuryPayout,
  type FinancePayoutSourceV2,
  type TreasuryPayoutTaskDetail,
} from "@/services/supabase/financeTreasuryV2Service";

const activeStatuses = new Set(["open", "claimed", "in_progress", "failed"]);
const money = (value?: number | null) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;

export default function TreasuryDisbursementDock() {
  const { currentBranchId } = useBranchStore();
  const [panelOpen, setPanelOpen] = useState(false);
  const [selected, setSelected] = useState<OperationsTask | null>(null);
  const [treasuryDetail, setTreasuryDetail] = useState<TreasuryPayoutTaskDetail | null>(null);
  const [sources, setSources] = useState<FinancePayoutSourceV2[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: ["treasury-disbursement-tasks-v1", currentBranchId],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchOperationsTasks(currentBranchId as string, "active", 250),
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });

  const tasks = useMemo(() => (query.data || []).filter(task => {
    if (!activeStatuses.has(task.status)) return false;
    if (task.source_kind === "hr_treasury_payout") return Boolean(task.is_mine);
    if (task.source_kind === "hr_salary_advance_payout") {
      if (task.status === "in_progress" && task.metadata?.delegated_task_id) return false;
      return Boolean(task.is_mine || task.can_claim);
    }
    return false;
  }), [query.data]);

  useEffect(() => {
    const openPanel = () => {
      setPanelOpen(true);
      void query.refetch();
    };
    window.addEventListener("tasks:open-treasury", openPanel);
    return () => window.removeEventListener("tasks:open-treasury", openPanel);
  }, [query]);

  const selectedSource = sources.find(item => item.account_id === sourceId);

  const close = () => {
    setSelected(null);
    setTreasuryDetail(null);
    setSources([]);
    setSourceId("");
    setNote("");
    setReference("");
  };

  const openTask = async (task: OperationsTask) => {
    setBusy(true);
    try {
      if (task.source_kind === "hr_salary_advance_payout") {
        let current = task;
        if (current.status === "open" && current.can_claim) current = await claimOperationsTask(current.id) as OperationsTask;
        try { current = await startOperationsTask(current.id) as OperationsTask; } catch { /* already started */ }
        const payoutSources = await fetchFinancePayoutSourcesV2(current.branch_id);
        setSelected(current);
        setSources(payoutSources);
        setSourceId("");
        setNote("");
        setReference(current.provider_reference || "");
        setPanelOpen(false);
      } else {
        try { await startOperationsTask(task.id); } catch { /* already started */ }
        const detail = await getTreasuryPayoutTask(task.id);
        setSelected(task);
        setTreasuryDetail(detail);
        setReference(detail.reference || "");
        setNote("");
        setPanelOpen(false);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر فتح مهمة الصرف.");
      await query.refetch();
    } finally {
      setBusy(false);
    }
  };

  const delegate = async () => {
    if (!selected || selected.source_kind !== "hr_salary_advance_payout") return;
    if (!selectedSource) return toast.error("اختر مصدر الصرف.");
    if (!selectedSource.assignable) return toast.error("مصدر الصرف لا يوجد له مسؤول حاليًا.");
    if (Number(selectedSource.balance || 0) + 0.005 < Number(selected.amount || 0)) return toast.error("الرصيد الحالي أقل من قيمة السلفة.");
    if (note.trim().length < 3) return toast.error("اكتب ملاحظة الإسناد.");
    setBusy(true);
    try {
      const result = await delegateHrSalaryAdvancePayout({
        taskId: selected.id,
        sourceKind: selectedSource.source_kind,
        sourceAccountId: selectedSource.account_id,
        note: note.trim(),
        reference: reference.trim() || null,
      });
      toast.success(`تم إرسال مهمة الصرف إلى ${result.responsible_user_name}. لن يُخصم المبلغ قبل تأكيده.`);
      close();
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إرسال عملية الصرف لمسؤول الخزنة.");
      await query.refetch();
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!selected || selected.source_kind !== "hr_treasury_payout") return;
    if (note.trim().length < 3) return toast.error("اكتب ملاحظة تؤكد تسليم المبلغ.");
    setBusy(true);
    try {
      const result = await confirmTreasuryPayout(selected.id, note.trim(), reference.trim() || null);
      toast.success(`تم تأكيد الصرف وخصم ${money(result.amount)} من ${result.source_account_name}. الرصيد الآن ${money(result.source_balance_after)}.`);
      close();
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تأكيد الصرف.");
      await query.refetch();
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!selected || selected.source_kind !== "hr_treasury_payout") return;
    if (note.trim().length < 3) return toast.error("اكتب سبب رفض أو تعذر الصرف.");
    setBusy(true);
    try {
      await rejectTreasuryPayout(selected.id, note.trim());
      toast.success("تم رفض الصرف وإعادته للمالية بدون خصم أي مبلغ.");
      close();
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر رفض عملية الصرف.");
      await query.refetch();
    } finally {
      setBusy(false);
    }
  };

  if (!currentBranchId) return null;

  return <>
    <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
      <SheetContent side="left" dir="rtl" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="text-right">
          <SheetTitle className="flex items-center gap-2"><Vault className="h-5 w-5 text-amber-700" />صرف من الخزن <Badge className="bg-amber-700">{tasks.length.toLocaleString("ar-EG")}</Badge></SheetTitle>
          <SheetDescription>المالية تحدد مصدر الصرف، وأمين العهدة يؤكد التنفيذ قبل الخصم الفعلي.</SheetDescription>
        </SheetHeader>
        <div className="mt-5 flex justify-end"><Button size="sm" variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`ml-1 h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} />تحديث</Button></div>
        <div className="mt-3 space-y-2">
          {query.isLoading ? <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div> : tasks.length === 0 ? <div className="rounded-2xl border border-dashed bg-slate-50 p-8 text-center text-sm text-muted-foreground">لا توجد عمليات صرف تحتاج إجراء منك.</div> : tasks.map(task => {
            const treasury = task.source_kind === "hr_treasury_payout";
            return <div key={task.id} className="rounded-2xl border bg-white p-4">
              <div className="flex items-start justify-between gap-2"><div><div className="flex items-center gap-2 font-black">{treasury ? <Vault className="h-4 w-4 text-amber-700" /> : <Banknote className="h-4 w-4 text-emerald-700" />}{treasury ? "مهمة صرف من عهدتك" : task.title}</div><div className="mt-1 text-xs leading-5 text-muted-foreground">{treasury ? "المبلغ لا يخصم إلا بعد تأكيدك الفعلي للصرف." : "حدد الخزنة ليتم إرسال المهمة لمسؤولها."}</div></div>{task.is_overdue && <Badge variant="destructive">متأخرة</Badge>}</div>
              <Button className="mt-3 w-full" size="sm" disabled={busy || (!treasury && !task.is_mine && !task.can_claim)} onClick={() => void openTask(task)}>{treasury ? <ShieldCheck className="ml-1 h-4 w-4" /> : <Banknote className="ml-1 h-4 w-4" />}{treasury ? "مراجعة الصرف" : "تحديد مصدر الصرف"}</Button>
            </div>;
          })}
        </div>
      </SheetContent>
    </Sheet>

    <Dialog open={Boolean(selected)} onOpenChange={value => { if (!value) close(); }}>
      <DialogContent dir="rtl" className="max-w-xl">
        <DialogHeader><DialogTitle>{selected?.source_kind === "hr_treasury_payout" ? "تأكيد صرف من الخزنة" : "إسناد صرف سلفة إلى خزنة"}</DialogTitle></DialogHeader>
        {selected?.source_kind === "hr_salary_advance_payout" && <div className="space-y-4">
          <div className="rounded-2xl border bg-emerald-50 p-4"><div className="font-black">{selected.title}</div><div className="mt-2 text-2xl font-black text-emerald-800">{money(selected.amount)}</div><p className="mt-2 text-xs text-emerald-900">اختيار الخزنة لا يخصم المبلغ. سيصل طلب لمسؤول الخزنة، وعند تأكيده فقط ينزل القيد.</p></div>
          <div className="space-y-2"><Label>الخزنة / درج الكاشير / البنك</Label><Select value={sourceId} onValueChange={setSourceId}><SelectTrigger><SelectValue placeholder="اختر مصدر الصرف" /></SelectTrigger><SelectContent>{sources.map(source => <SelectItem key={source.account_id} value={source.account_id} disabled={!source.assignable || Number(source.balance || 0) + 0.005 < Number(selected.amount || 0)}>{source.name} · {money(source.balance)} · {source.responsible_user_name || "بدون مسؤول"}</SelectItem>)}</SelectContent></Select>{selectedSource && <div className="rounded-xl bg-slate-50 p-3 text-xs"><div>المسؤول: <strong>{selectedSource.responsible_user_name || "غير محدد"}</strong></div><div className="mt-1">الرصيد: <strong>{money(selectedSource.balance)}</strong></div>{selectedSource.source_kind === "pos_drawer" && <div className="mt-1 text-amber-700">هذا درج POS؛ المسؤول هو صاحب الوردية المفتوحة حاليًا.</div>}</div>}</div>
          <div className="space-y-2"><Label>مرجع الصرف (اختياري)</Label><Input value={reference} onChange={e => setReference(e.target.value)} placeholder="رقم سند / تحويل / مرجع" /></div>
          <div className="space-y-2"><Label>ملاحظة المالية</Label><Textarea rows={4} value={note} onChange={e => setNote(e.target.value)} placeholder="سبب اختيار الخزنة وتعليمات الصرف..." /></div>
        </div>}

        {selected?.source_kind === "hr_treasury_payout" && treasuryDetail && <div className="space-y-4">
          <div className="rounded-2xl border bg-amber-50 p-4"><div className="flex items-center gap-2 font-black"><Vault className="h-5 w-5" />{treasuryDetail.advance.legacy_reconciliation ? "تسوية سلفة سابقة" : "سلفة موظف"}</div><div className="mt-2 text-xl font-black">{treasuryDetail.advance.employee_name} · {money(treasuryDetail.advance.amount)}</div><div className="mt-2 text-sm">المصدر: <strong>{treasuryDetail.source.account_name}</strong></div><div className="mt-1 text-sm">الرصيد الحالي: <strong>{money(treasuryDetail.source.balance)}</strong></div>{treasuryDetail.advance.legacy_reconciliation && <div className="mt-2 flex gap-2 rounded-xl bg-white/70 p-3 text-xs text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" />هذه سلفة قديمة تم تسجيلها كمصروفة قبل ربط نظام الخزن. تأكيدك ينشئ قيد التسوية للمصدر التاريخي.</div>}</div>
          <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm leading-6 text-red-900"><strong>تأكيد الصرف = خصم فعلي.</strong> لا تؤكد إلا بعد تسليم المبلغ فعليًا. النظام يعيد فحص أن الخزنة ما زالت في عهدتك وأن الرصيد يكفي.</div>
          <div className="space-y-2"><Label>مرجع الصرف</Label><Input value={reference} onChange={e => setReference(e.target.value)} placeholder="رقم سند / تحويل / مرجع" /></div>
          <div className="space-y-2"><Label>ملاحظة التنفيذ أو سبب الرفض</Label><Textarea rows={4} value={note} onChange={e => setNote(e.target.value)} placeholder="مثال: تم تسليم المبلغ نقدًا للموظف..." /></div>
        </div>}

        <DialogFooter className="gap-2 sm:justify-start">
          <Button variant="outline" disabled={busy} onClick={close}>إغلاق</Button>
          {selected?.source_kind === "hr_salary_advance_payout" && <Button disabled={busy || !sourceId} onClick={() => void delegate()}>{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="ml-2 h-4 w-4" />}إرسال لمسؤول الخزنة</Button>}
          {selected?.source_kind === "hr_treasury_payout" && <><Button variant="destructive" disabled={busy} onClick={() => void reject()}>{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <XCircle className="ml-2 h-4 w-4" />}رفض / تعذر الصرف</Button><Button disabled={busy} onClick={() => void confirm()}>{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="ml-2 h-4 w-4" />}تم الصرف وتأكيد الخصم</Button></>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

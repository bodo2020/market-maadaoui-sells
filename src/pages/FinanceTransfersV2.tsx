import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, AlertTriangle, CheckCircle2, Clock3, RefreshCw, RotateCcw, Send, ShieldCheck, Vault } from "lucide-react";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBranchStore } from "@/stores/branchStore";
import {
  cancelFinanceTransferV2,
  createFinanceTransferV2,
  fetchFinanceTransferOptionsV2,
  fetchFinanceTransfersV2,
  retryFinanceTransferReceiptV2,
  type FinanceTransferAccountOption,
  type FinanceTransferRowV2,
} from "@/services/supabase/financeTransfersV2Service";

const money = (value?: number | null) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
const dt = (value?: string | null) => value ? new Date(value).toLocaleString("ar-EG") : "—";

function statusInfo(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    awaiting_sender: { label: "بانتظار التسليم", className: "border-amber-200 bg-amber-50 text-amber-800" },
    awaiting_receiver: { label: "قيد النقل", className: "border-blue-200 bg-blue-50 text-blue-800" },
    completed: { label: "تم الاستلام", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
    rejected: { label: "مرفوض قبل التسليم", className: "border-slate-200 bg-slate-50 text-slate-700" },
    exception: { label: "استثناء - المبلغ قيد النقل", className: "border-red-200 bg-red-50 text-red-800" },
    cancelled: { label: "ملغي", className: "border-slate-200 bg-slate-50 text-slate-500" },
  };
  return map[status] || { label: status, className: "" };
}

function accountLabel(account: FinanceTransferAccountOption) {
  const type = account.account_type === "branch_safe" ? "خزنة فرع" : account.account_type === "pos_drawer" ? "درج POS" : account.account_type === "bank" ? "بنك" : account.account_type;
  return `${account.name} — ${type}`;
}

export default function FinanceTransfersV2() {
  const queryClient = useQueryClient();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const branchId = currentBranchId || localStorage.getItem("currentBranchId") || "";
  const [createOpen, setCreateOpen] = useState(false);
  const [sourceKey, setSourceKey] = useState("");
  const [destinationKey, setDestinationKey] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [actionTransfer, setActionTransfer] = useState<FinanceTransferRowV2 | null>(null);
  const [actionMode, setActionMode] = useState<"cancel" | "retry" | null>(null);
  const [actionNote, setActionNote] = useState("");

  const optionsQuery = useQuery({
    queryKey: ["finance-transfer-options-v2", branchId],
    enabled: Boolean(branchId),
    queryFn: () => fetchFinanceTransferOptionsV2(branchId),
    staleTime: 10_000,
  });
  const transfersQuery = useQuery({
    queryKey: ["finance-transfers-v2", branchId],
    enabled: Boolean(branchId),
    queryFn: () => fetchFinanceTransfersV2(branchId, 120),
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });

  const options = optionsQuery.data || [];
  const accountByKey = useMemo(() => new Map(options.map(item => [`${item.ledger_kind}:${item.account_id}`, item])), [options]);
  const source = sourceKey ? accountByKey.get(sourceKey) : undefined;
  const destination = destinationKey ? accountByKey.get(destinationKey) : undefined;
  const assignableOptions = useMemo(() => options.filter(item => item.assignable), [options]);
  const unavailableOptions = useMemo(() => options.filter(item => !item.assignable), [options]);

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["finance-transfer-options-v2", branchId] }),
      queryClient.invalidateQueries({ queryKey: ["finance-transfers-v2", branchId] }),
      queryClient.invalidateQueries({ queryKey: ["finance-control-center-v2", branchId] }),
      queryClient.invalidateQueries({ queryKey: ["finance-treasury-v2", branchId] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: () => {
      if (!source || !destination) throw new Error("اختر مصدر التحويل ووجهته.");
      return createFinanceTransferV2({
        branchId,
        source,
        destination,
        amount: Number(amount),
        note,
        reference,
      });
    },
    onSuccess: async () => {
      toast.success("تم إنشاء التحويل وإرسال مهمة التسليم لمسؤول العهدة");
      setCreateOpen(false);
      setSourceKey("");
      setDestinationKey("");
      setAmount("");
      setNote("");
      setReference("");
      await refreshAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const actionMutation = useMutation({
    mutationFn: async () => {
      if (!actionTransfer || !actionMode) throw new Error("العملية غير مكتملة.");
      if (actionMode === "cancel") return cancelFinanceTransferV2(actionTransfer.transfer_id, actionNote);
      return retryFinanceTransferReceiptV2(actionTransfer.transfer_id, actionNote);
    },
    onSuccess: async () => {
      toast.success(actionMode === "cancel" ? "تم إلغاء التحويل قبل التسليم" : "تمت إعادة إرسال مهمة الاستلام");
      setActionTransfer(null);
      setActionMode(null);
      setActionNote("");
      await refreshAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const validCreate = Boolean(source && destination && sourceKey !== destinationKey && Number(amount) > 0 && note.trim().length >= 3 && Number(amount) <= Number(source?.available_balance || 0));
  const summary = transfersQuery.data?.summary;
  const transfers = transfersQuery.data?.items || [];

  return (
    <MainLayout>
      <div dir="rtl" className="space-y-6 pb-12">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2"><ArrowLeftRight className="h-6 w-6 text-[#005931]" /><h1 className="text-2xl font-black">تحويلات الخزن والعهد</h1><Badge className="bg-[#005931]">V2</Badge></div>
            <p className="mt-1 text-sm text-slate-500">تسليم ثم استلام. كل مبلغ يظل ظاهرًا إما في حساب، أو «قيد النقل»، ولا يختفي بين العهد.</p>
            <p className="mt-1 text-xs font-semibold text-slate-400">{currentBranchName || "الفرع الحالي"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { optionsQuery.refetch(); transfersQuery.refetch(); }}><RefreshCw className="ml-2 h-4 w-4" />تحديث</Button>
            <Button className="bg-[#005931] hover:bg-[#004426]" onClick={() => setCreateOpen(true)} disabled={!branchId}><Send className="ml-2 h-4 w-4" />تحويل جديد</Button>
          </div>
        </div>

        {!branchId && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-900">اختر الفرع أولًا.</div>}
        {(optionsQuery.isError || transfersQuery.isError) && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">{(optionsQuery.error as Error | undefined)?.message || (transfersQuery.error as Error | undefined)?.message || "تعذر تحميل التحويلات"}</div>}

        {branchId && (
          <>
            <section className="grid gap-4 md:grid-cols-3">
              <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs font-bold text-slate-500">مبالغ قيد النقل</p><div className="mt-2 text-2xl font-black">{money(summary?.in_transit_amount)}</div><p className="mt-1 text-xs text-slate-500">خرجت من المصدر ولم تدخل الوجهة بعد.</p></div><Clock3 className="h-6 w-6 text-blue-600" /></div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs font-bold text-slate-500">استثناءات تحتاج تدخل</p><div className="mt-2 text-2xl font-black">{Number(summary?.exception_count || 0).toLocaleString("ar-EG")}</div><p className="mt-1 text-xs text-slate-500">مستلم رفض أو تعذر عليه التأكيد.</p></div><AlertTriangle className="h-6 w-6 text-red-600" /></div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs font-bold text-slate-500">حسابات جاهزة للتحويل</p><div className="mt-2 text-2xl font-black">{assignableOptions.length.toLocaleString("ar-EG")}</div><p className="mt-1 text-xs text-slate-500">لها مسؤول عهدة حالي ويمكن إنشاء مهمة لها.</p></div><ShieldCheck className="h-6 w-6 text-[#005931]" /></div></CardContent></Card>
            </section>

            {unavailableOptions.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="font-black">فيه {unavailableOptions.length} حساب غير جاهز للتحويل</div>
                <div className="mt-1">{unavailableOptions.map(item => item.name).join("، ")} — عيّن مسؤول عهدة أولًا، أو افتح وردية لو الحساب درج POS.</div>
              </div>
            )}

            <section className="space-y-3">
              <div><h2 className="text-lg font-black">سجل التحويلات</h2><p className="text-xs text-slate-500">كل مرحلة محفوظة باسم مسؤول المصدر ومسؤول الوجهة ووقت التأكيد.</p></div>
              <div className="overflow-x-auto rounded-2xl border bg-white">
                <table className="min-w-[1100px] w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500"><tr><th className="p-3 text-right">التحويل</th><th className="p-3 text-right">المبلغ</th><th className="p-3 text-right">المصدر</th><th className="p-3 text-right">الوجهة</th><th className="p-3 text-right">الحالة</th><th className="p-3 text-right">الطلب</th><th className="p-3 text-right">التسليم</th><th className="p-3 text-right">الاستلام</th><th className="p-3 text-right">إجراء</th></tr></thead>
                  <tbody>
                    {transfers.map(row => {
                      const info = statusInfo(row.status);
                      return <tr key={row.transfer_id} className="border-t align-top">
                        <td className="p-3"><div className="font-mono text-xs">{row.transfer_id.slice(0, 8)}</div>{row.reference && <div className="mt-1 text-xs text-slate-500">{row.reference}</div>}</td>
                        <td className="p-3 font-black">{money(row.amount)}</td>
                        <td className="p-3"><div className="font-bold">{row.source_account_name}</div><div className="mt-1 text-xs text-slate-500">{row.source_responsible_user_name || "—"}</div></td>
                        <td className="p-3"><div className="font-bold">{row.destination_account_name}</div><div className="mt-1 text-xs text-slate-500">{row.destination_responsible_user_name || "—"}</div></td>
                        <td className="p-3"><Badge variant="outline" className={info.className}>{info.label}</Badge>{row.rejection_reason && <div className="mt-2 max-w-[220px] text-xs text-red-700">{row.rejection_reason}</div>}</td>
                        <td className="p-3 text-xs"><div>{row.requested_by_name || "—"}</div><div className="mt-1 text-slate-400">{dt(row.requested_at)}</div></td>
                        <td className="p-3 text-xs">{dt(row.sender_confirmed_at)}</td>
                        <td className="p-3 text-xs">{dt(row.receiver_confirmed_at)}</td>
                        <td className="p-3">
                          {row.status === "awaiting_sender" && <Button size="sm" variant="outline" onClick={() => { setActionTransfer(row); setActionMode("cancel"); setActionNote(""); }}>إلغاء</Button>}
                          {row.status === "exception" && <Button size="sm" variant="outline" onClick={() => { setActionTransfer(row); setActionMode("retry"); setActionNote(""); }}><RotateCcw className="ml-1 h-3.5 w-3.5" />إعادة الاستلام</Button>}
                          {!["awaiting_sender", "exception"].includes(row.status) && <span className="text-xs text-slate-400">—</span>}
                        </td>
                      </tr>;
                    })}
                  </tbody>
                </table>
                {!transfers.length && <div className="p-10 text-center text-sm text-slate-500"><Vault className="mx-auto mb-3 h-8 w-8 text-slate-300" />لا توجد تحويلات مالية بعد.</div>}
              </div>
            </section>
          </>
        )}

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent dir="rtl" className="max-w-2xl">
            <DialogHeader><DialogTitle>تحويل جديد بين العهد</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-2 md:grid-cols-2">
              <div className="space-y-2"><Label>من</Label><Select value={sourceKey} onValueChange={value => { setSourceKey(value); if (destinationKey === value) setDestinationKey(""); }}><SelectTrigger><SelectValue placeholder="اختر مصدر التحويل" /></SelectTrigger><SelectContent>{assignableOptions.map(item => <SelectItem key={`${item.ledger_kind}:${item.account_id}`} value={`${item.ledger_kind}:${item.account_id}`}>{accountLabel(item)} — متاح {money(item.available_balance)}</SelectItem>)}</SelectContent></Select>{source && <div className="rounded-xl bg-slate-50 p-3 text-xs"><div>المتاح: <strong>{money(source.available_balance)}</strong></div><div className="mt-1">مسؤول العهدة: <strong>{source.responsible_user_name}</strong></div>{source.reserved > 0 && <div className="mt-1 text-amber-700">محجوز لتحويلات أخرى: {money(source.reserved)}</div>}</div>}</div>
              <div className="space-y-2"><Label>إلى</Label><Select value={destinationKey} onValueChange={setDestinationKey}><SelectTrigger><SelectValue placeholder="اختر وجهة التحويل" /></SelectTrigger><SelectContent>{assignableOptions.filter(item => `${item.ledger_kind}:${item.account_id}` !== sourceKey).map(item => <SelectItem key={`${item.ledger_kind}:${item.account_id}`} value={`${item.ledger_kind}:${item.account_id}`}>{accountLabel(item)}</SelectItem>)}</SelectContent></Select>{destination && <div className="rounded-xl bg-slate-50 p-3 text-xs"><div>الرصيد الحالي: <strong>{money(destination.balance)}</strong></div><div className="mt-1">مسؤول الاستلام: <strong>{destination.responsible_user_name}</strong></div></div>}</div>
              <div className="space-y-2"><Label>المبلغ</Label><Input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />{source && Number(amount) > source.available_balance && <p className="text-xs font-semibold text-red-600">المبلغ أكبر من الرصيد المتاح.</p>}</div>
              <div className="space-y-2"><Label>مرجع اختياري</Label><Input value={reference} onChange={e => setReference(e.target.value)} placeholder="مثال: توريد وردية / إيداع بنك" /></div>
              <div className="space-y-2 md:col-span-2"><Label>سبب التحويل / ملاحظة</Label><Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="اكتب سبب التحويل بوضوح..." /></div>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-900">إنشاء التحويل لا يخصم الرصيد. أول خصم يحصل عند تأكيد مسؤول المصدر أنه سلّم المبلغ، وبعدها يظهر المبلغ «قيد النقل» حتى يؤكد مسؤول الوجهة الاستلام.</div>
            <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button><Button className="bg-[#005931] hover:bg-[#004426]" disabled={!validCreate || createMutation.isPending} onClick={() => createMutation.mutate()}>{createMutation.isPending ? "جاري الإنشاء..." : "إنشاء وإرسال مهمة التسليم"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(actionTransfer && actionMode)} onOpenChange={open => { if (!open) { setActionTransfer(null); setActionMode(null); setActionNote(""); } }}>
          <DialogContent dir="rtl"><DialogHeader><DialogTitle>{actionMode === "retry" ? "إعادة محاولة الاستلام" : "إلغاء التحويل"}</DialogTitle></DialogHeader><div className="space-y-3 py-2">{actionTransfer && <div className="rounded-xl bg-slate-50 p-3 text-sm"><strong>{money(actionTransfer.amount)}</strong> — {actionTransfer.source_account_name} ← {actionTransfer.destination_account_name}</div>}<Label>{actionMode === "retry" ? "ملاحظة إعادة الإسناد" : "سبب الإلغاء"}</Label><Textarea value={actionNote} onChange={e => setActionNote(e.target.value)} placeholder="اكتب ملاحظة واضحة..." /></div><DialogFooter><Button variant="outline" onClick={() => { setActionTransfer(null); setActionMode(null); }}>رجوع</Button><Button variant={actionMode === "cancel" ? "destructive" : "default"} className={actionMode === "retry" ? "bg-[#005931] hover:bg-[#004426]" : ""} disabled={actionNote.trim().length < 3 || actionMutation.isPending} onClick={() => actionMutation.mutate()}>{actionMutation.isPending ? "جاري التنفيذ..." : actionMode === "retry" ? "إرسال مهمة استلام جديدة" : "تأكيد الإلغاء"}</Button></DialogFooter></DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}

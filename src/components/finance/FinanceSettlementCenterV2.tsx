import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Banknote, Landmark, RefreshCw, RotateCcw, ShieldCheck, WalletCards } from "lucide-react";
import { toast } from "sonner";
import PaymentMethodBrand from "@/components/payments/PaymentMethodBrand";
import FinanceCashHandoffCenterV2 from "@/components/finance/FinanceCashHandoffCenterV2";
import FinanceRefundTaskCenter from "@/components/finance/FinanceRefundTaskCenter";
import FinanceShiftVarianceTaskCenter from "@/components/finance/FinanceShiftVarianceTaskCenter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { siteConfig } from "@/config/site";
import {
  createPaymentSettlementV3,
  fetchFinanceSettlementWorkspaceV3,
  retrySettlementReceiptV3,
  type FinanceSettlementSourceV3,
  type FinanceSettlementTargetKindV3,
  type FinanceSettlementRowV3,
} from "@/services/supabase/financeSettlementV3Service";
import { useBranchStore } from "@/stores/branchStore";

const money = (value: number | null | undefined) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${siteConfig.currency}`;
const dt = (value?: string | null) => value ? new Date(value).toLocaleString("ar-EG") : "—";

function newRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-0000-4000-8000-${Math.random().toString(16).slice(2).padEnd(12, "0").slice(0, 12)}`;
}

function suggestedFee(source: FinanceSettlementSourceV3, gross: number) {
  if (source.fee_bearer !== "business") return 0;
  if (source.fee_type === "percent") return Math.round(gross * Number(source.fee_value || 0)) / 100;
  if (source.fee_type === "fixed") return Number(source.fee_value || 0);
  return 0;
}

function statusBadge(row: FinanceSettlementRowV3) {
  if (row.status === "completed") return <Badge className="bg-emerald-600">تم الاستلام</Badge>;
  if (row.status === "exception") return <Badge variant="destructive">استثناء / مرفوض</Badge>;
  return <Badge className="bg-amber-600">قيد الاستلام</Badge>;
}

export default function FinanceSettlementCenterV2() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const queryClient = useQueryClient();
  const [selectedSource, setSelectedSource] = useState<FinanceSettlementSourceV3 | null>(null);
  const [targetKind, setTargetKind] = useState<FinanceSettlementTargetKindV3>("safe");
  const [targetAccountId, setTargetAccountId] = useState("");
  const [gross, setGross] = useState("");
  const [fee, setFee] = useState("0.00");
  const [providerReference, setProviderReference] = useState("");
  const [note, setNote] = useState("");
  const [retryRow, setRetryRow] = useState<FinanceSettlementRowV3 | null>(null);
  const [retryNote, setRetryNote] = useState("");

  const query = useQuery({
    queryKey: ["finance-settlement-workspace-v3", currentBranchId],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchFinanceSettlementWorkspaceV3(currentBranchId!, 100),
    staleTime: 10_000,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });

  const targets = useMemo(() => (query.data?.targets || []).filter(target => target.target_kind === targetKind), [query.data?.targets, targetKind]);
  const selectedTarget = targets.find(target => target.account_id === targetAccountId) || targets[0];
  const grossNumber = Number(gross || 0);
  const feeNumber = Number(fee || 0);
  const net = Number.isFinite(grossNumber) && Number.isFinite(feeNumber) ? Math.max(grossNumber - feeNumber, 0) : 0;
  const canSubmit = Boolean(selectedSource && selectedTarget?.assignable && query.data?.permissions.can_manage && grossNumber > 0 && grossNumber <= Number(selectedSource.balance || 0) + 0.005 && feeNumber >= 0 && feeNumber < grossNumber && (!selectedSource.require_reference || providerReference.trim()));

  const refresh = async () => {
    await Promise.all([
      query.refetch(),
      queryClient.invalidateQueries({ queryKey: ["finance-control-center-v2"] }),
      queryClient.invalidateQueries({ queryKey: ["my-payment-settlement-tasks-v3"] }),
      queryClient.invalidateQueries({ queryKey: ["operations-tasks"] }),
      queryClient.invalidateQueries({ queryKey: ["finance-payment-report-v2"] }),
      queryClient.invalidateQueries({ queryKey: ["reporting-payments-v2"] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!currentBranchId || !selectedSource || !selectedTarget || !canSubmit) throw new Error("راجع بيانات التسوية ومسؤول حساب الاستلام.");
      return createPaymentSettlementV3({ requestId: newRequestId(), branchId: currentBranchId, sourceAccountId: selectedSource.account_id, targetKind, targetAccountId: selectedTarget.account_id, grossAmount: grossNumber, feeAmount: feeNumber, providerReference, note });
    },
    onSuccess: async result => {
      toast.success(`تم إرسال صافي ${money(result.net_amount)} إلى ${result.responsible_user_name} للتأكيد. المبلغ الآن قيد الاستلام.`);
      setSelectedSource(null); setTargetAccountId(""); setGross(""); setFee("0.00"); setProviderReference(""); setNote("");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const retryMutation = useMutation({
    mutationFn: () => retrySettlementReceiptV3(retryRow!.settlement_id, retryNote),
    onSuccess: async result => { toast.success(`تمت إعادة مهمة الاستلام إلى ${result.responsible_user_name}`); setRetryRow(null); setRetryNote(""); await refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });

  const startSettlement = (source: FinanceSettlementSourceV3) => {
    const availableTargets = query.data?.targets || [];
    const preferredKind: FinanceSettlementTargetKindV3 = availableTargets.some(x => x.target_kind === "bank" && x.assignable) ? "bank" : "safe";
    const nextTargets = availableTargets.filter(x => x.target_kind === preferredKind);
    const grossValue = Math.max(Number(source.balance || 0), 0);
    setSelectedSource(source);
    setTargetKind(preferredKind);
    setTargetAccountId((nextTargets.find(x => x.assignable) || nextTargets[0])?.account_id || "");
    setGross(grossValue.toFixed(2));
    setFee(suggestedFee(source, grossValue).toFixed(2));
    setProviderReference(""); setNote("");
  };

  const changeGross = (value: string) => {
    setGross(value);
    if (selectedSource) setFee(suggestedFee(selectedSource, Number(value || 0)).toFixed(2));
  };

  const changeTargetKind = (kind: FinanceSettlementTargetKindV3) => {
    setTargetKind(kind);
    const next = (query.data?.targets || []).filter(x => x.target_kind === kind);
    setTargetAccountId((next.find(x => x.assignable) || next[0])?.account_id || "");
  };

  if (!currentBranchId) return null;

  return (
    <>
      <FinanceRefundTaskCenter />
      <FinanceShiftVarianceTaskCenter />
      <FinanceCashHandoffCenterV2 />

      <section dir="rtl" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2"><ArrowLeftRight className="h-5 w-5 text-[#005931]" /><h2 className="text-lg font-black">تسويات وسائل الدفع</h2><Badge className="bg-[#005931]">Settlement V3</Badge></div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">المالية تسجل إجمالي التسوية والعمولة. صافي المبلغ لا يدخل البنك أو الخزنة إلا بعد تأكيد مسؤول العهدة، ويظل ظاهرًا «قيد الاستلام» طوال الفترة بينهما.</p>
          </div>
          <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث</Button>
        </div>

        {query.isError && <Alert variant="destructive"><AlertDescription>{query.error instanceof Error ? query.error.message : "تعذر تحميل التسويات."}</AlertDescription></Alert>}
        {query.data && !query.data.permissions.can_manage && <Alert><ShieldCheck className="h-4 w-4" /><AlertDescription>يمكنك عرض الأرصدة والتسويات فقط. إنشاء تسوية جديدة يحتاج صلاحية إدارة المالية.</AlertDescription></Alert>}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {query.isLoading ? Array.from({ length: 4 }).map((_, index) => <Card key={index} className="h-44 animate-pulse bg-slate-50" />) : (query.data?.sources || []).map(source => (
            <Card key={source.account_id} className={source.balance > 0.005 ? "ring-1 ring-emerald-100" : ""}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3"><div><div className="font-black">{source.payment_method_name}</div><div className="mt-1 text-xs text-slate-500">{source.account_name}</div></div><PaymentMethodBrand method={{ code: source.payment_method_code, name: source.payment_method_name, method_type: source.method_type }} compact /></div>
                <div className="mt-5 text-xs text-slate-500">رصيد ينتظر التسوية</div><div className="mt-1 text-2xl font-black">{money(source.balance)}</div>
                <div className="mt-2 text-xs text-slate-500">العمولة المضبوطة: {source.fee_type === "percent" ? `${source.fee_value}%` : source.fee_type === "fixed" ? money(source.fee_value) : "بدون عمولة"}</div>
                <Button className="mt-4 w-full bg-[#005931] hover:bg-[#004426]" size="sm" disabled={!query.data?.permissions.can_manage || source.balance <= 0.005} onClick={() => startSettlement(source)}>بدء تسوية</Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><WalletCards className="h-5 w-5 text-[#005931]" />سجل التسويات</CardTitle></CardHeader>
          <CardContent>
            {(query.data?.recent_settlements || []).length === 0 ? <div className="py-8 text-center text-sm text-slate-500">لا توجد تسويات مسجلة.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead><tr className="border-b text-slate-500"><th className="p-3 text-right">الحالة</th><th className="p-3 text-right">الوسيلة</th><th className="p-3 text-right">من / إلى</th><th className="p-3 text-left">الإجمالي</th><th className="p-3 text-left">العمولة</th><th className="p-3 text-left">الصافي</th><th className="p-3 text-right">المسؤول</th><th className="p-3 text-right">المرجع</th><th className="p-3 text-right">التوقيت</th><th className="p-3 text-right">إجراء</th></tr></thead><tbody>{query.data!.recent_settlements.map(row => <tr key={row.settlement_id} className="border-b last:border-0"><td className="p-3">{statusBadge(row)}</td><td className="p-3 font-bold">{row.payment_method_name}</td><td className="p-3"><div>{row.source_account_name}</div><div className="text-xs text-slate-500">← {row.target_account_name}</div></td><td className="p-3 text-left">{money(row.gross_amount)}</td><td className="p-3 text-left text-red-700">{money(row.fee_amount)}</td><td className="p-3 text-left font-black">{money(row.net_amount)}</td><td className="p-3">{row.responsible_user_name || "—"}</td><td className="p-3">{row.provider_reference || "—"}</td><td className="p-3 text-xs">{dt(row.requested_at)}{row.received_at && <div className="text-emerald-700">استلم: {dt(row.received_at)}</div>}</td><td className="p-3">{row.status === "exception" && query.data?.permissions.can_manage ? <Button size="sm" variant="outline" onClick={() => { setRetryRow(row); setRetryNote(""); }}><RotateCcw className="ml-1 h-4 w-4" />إعادة الإرسال</Button> : "—"}{row.failure_reason && <div className="mt-1 max-w-[220px] text-xs text-red-700">{row.failure_reason}</div>}</td></tr>)}</tbody></table></div>}
          </CardContent>
        </Card>

        <Dialog open={Boolean(selectedSource)} onOpenChange={open => { if (!open && !createMutation.isPending) setSelectedSource(null); }}>
          <DialogContent dir="rtl" className="sm:max-w-xl">
            <DialogHeader><DialogTitle>تسوية {selectedSource?.payment_method_name}</DialogTitle><DialogDescription>{currentBranchName || "الفرع الحالي"} · لن يدخل الصافي إلى الوجهة قبل تأكيد مسؤولها.</DialogDescription></DialogHeader>
            {selectedSource && <div className="space-y-4">
              <div className="rounded-2xl border p-4"><div className="text-xs text-slate-500">الرصيد المتاح</div><div className="mt-1 text-xl font-black">{money(selectedSource.balance)}</div></div>
              <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>جهة الاستلام</Label><Select value={targetKind} onValueChange={value => changeTargetKind(value as FinanceSettlementTargetKindV3)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="safe"><span className="flex items-center gap-2"><Banknote className="h-4 w-4" />خزنة الفرع</span></SelectItem><SelectItem value="bank"><span className="flex items-center gap-2"><Landmark className="h-4 w-4" />حساب بنكي</span></SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>الحساب</Label><Select value={selectedTarget?.account_id || ""} onValueChange={setTargetAccountId}><SelectTrigger><SelectValue placeholder="اختر الحساب" /></SelectTrigger><SelectContent>{targets.map(target => <SelectItem key={target.account_id} value={target.account_id}>{target.name} · {target.responsible_user_name || "بدون مسؤول"}</SelectItem>)}</SelectContent></Select></div></div>
              {selectedTarget && !selectedTarget.assignable && <Alert variant="destructive"><AlertDescription>هذا الحساب بدون مسؤول عهدة. عيّن المسؤول من «إدارة الحسابات والعهد» أولًا.</AlertDescription></Alert>}
              <div className="grid gap-4 sm:grid-cols-3"><div className="space-y-2"><Label>الإجمالي</Label><Input inputMode="decimal" value={gross} onChange={e => changeGross(e.target.value)} /></div><div className="space-y-2"><Label>العمولة الفعلية</Label><Input inputMode="decimal" value={fee} onChange={e => setFee(e.target.value)} /></div><div className="rounded-xl bg-emerald-50 p-3"><div className="text-xs text-emerald-700">الصافي</div><div className="mt-1 text-lg font-black text-emerald-900">{money(net)}</div></div></div>
              <div className="space-y-2"><Label>مرجع المزود {selectedSource.require_reference ? "*" : ""}</Label><Input value={providerReference} onChange={e => setProviderReference(e.target.value)} placeholder="رقم التحويل / السحب / التسوية" /></div>
              <div className="space-y-2"><Label>ملاحظة</Label><Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="تفاصيل تساعد مسؤول الاستلام على المطابقة" /></div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">عند الإنشاء يخرج الإجمالي من حساب التسوية: العمولة تُسجل مصروفًا، والصافي يصبح «قيد الاستلام». لا يدخل البنك/الخزنة إلا بعد التأكيد.</div>
            </div>}
            <DialogFooter><Button variant="outline" onClick={() => setSelectedSource(null)} disabled={createMutation.isPending}>إلغاء</Button><Button className="bg-[#005931] hover:bg-[#004426]" disabled={!canSubmit || createMutation.isPending} onClick={() => createMutation.mutate()}>{createMutation.isPending ? "جاري الإرسال..." : "إرسال للاستلام"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(retryRow)} onOpenChange={open => { if (!open) setRetryRow(null); }}><DialogContent dir="rtl"><DialogHeader><DialogTitle>إعادة إرسال مهمة الاستلام</DialogTitle></DialogHeader>{retryRow && <div className="rounded-xl bg-slate-50 p-3 text-sm"><strong>{money(retryRow.net_amount)}</strong><div className="mt-1">{retryRow.target_account_name}</div></div>}<div className="space-y-2"><Label>سبب إعادة الإرسال</Label><Textarea value={retryNote} onChange={e => setRetryNote(e.target.value)} /></div><DialogFooter><Button variant="outline" onClick={() => setRetryRow(null)}>إلغاء</Button><Button disabled={retryNote.trim().length < 3 || retryMutation.isPending} onClick={() => retryMutation.mutate()}>إعادة الإرسال</Button></DialogFooter></DialogContent></Dialog>
      </section>
    </>
  );
}

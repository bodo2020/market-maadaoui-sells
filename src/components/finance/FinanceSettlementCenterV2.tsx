import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Banknote, Building2, Landmark, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import PaymentMethodBrand from "@/components/payments/PaymentMethodBrand";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { siteConfig } from "@/config/site";
import {
  fetchFinanceSettlementWorkspaceV2,
  transferPaymentSettlementV2,
  type FinanceSettlementSourceV2,
  type FinanceSettlementTargetKind,
} from "@/services/supabase/financeSettlementV2Service";
import { useBranchStore } from "@/stores/branchStore";

const money = (value: number | null | undefined) =>
  `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${siteConfig.currency}`;

function newRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-0000-4000-8000-${Math.random().toString(16).slice(2).padEnd(12, "0").slice(0, 12)}`;
}

export default function FinanceSettlementCenterV2() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const { toast } = useToast();
  const [selectedSource, setSelectedSource] = useState<FinanceSettlementSourceV2 | null>(null);
  const [targetKind, setTargetKind] = useState<FinanceSettlementTargetKind>("safe");
  const [targetAccountId, setTargetAccountId] = useState("");
  const [gross, setGross] = useState("");
  const [fee, setFee] = useState("0.00");
  const [providerReference, setProviderReference] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const query = useQuery({
    queryKey: ["finance-settlement-workspace-v2", currentBranchId],
    enabled: Boolean(currentBranchId),
    queryFn: () => fetchFinanceSettlementWorkspaceV2(currentBranchId!, 100),
    staleTime: 15_000,
  });

  const targets = useMemo(
    () => (query.data?.targets || []).filter((target) => target.target_kind === targetKind),
    [query.data?.targets, targetKind],
  );

  const grossNumber = Number(gross || 0);
  const feeNumber = Number(fee || 0);
  const net = Number.isFinite(grossNumber) && Number.isFinite(feeNumber) ? Math.max(grossNumber - feeNumber, 0) : 0;
  const canSubmit = Boolean(
    selectedSource &&
    query.data?.permissions.can_manage &&
    Number.isFinite(grossNumber) && grossNumber > 0 && grossNumber <= selectedSource.balance + 0.005 &&
    Number.isFinite(feeNumber) && feeNumber >= 0 && feeNumber < grossNumber &&
    (targetKind === "bank" || Boolean(targetAccountId || targets[0]?.account_id)),
  );

  const closeDialog = () => {
    if (submitting) return;
    setSelectedSource(null);
    setTargetAccountId("");
    setGross("");
    setFee("0.00");
    setProviderReference("");
    setNote("");
  };

  const startTransfer = (source: FinanceSettlementSourceV2) => {
    const safeTargets = (query.data?.targets || []).filter((target) => target.target_kind === "safe");
    const preferredKind: FinanceSettlementTargetKind = safeTargets.length ? "safe" : "bank";
    const preferredTargets = (query.data?.targets || []).filter((target) => target.target_kind === preferredKind);
    setSelectedSource(source);
    setTargetKind(preferredKind);
    setTargetAccountId(preferredTargets[0]?.account_id || "");
    setGross(Math.max(source.balance, 0).toFixed(2));
    setFee("0.00");
    setProviderReference("");
    setNote("");
  };

  const changeTargetKind = (value: FinanceSettlementTargetKind) => {
    setTargetKind(value);
    const next = (query.data?.targets || []).filter((target) => target.target_kind === value);
    setTargetAccountId(next[0]?.account_id || "");
  };

  const submit = async () => {
    if (!selectedSource || !currentBranchId || !canSubmit) return;
    const resolvedTarget = targetAccountId || targets[0]?.account_id || null;
    const requestId = newRequestId();
    setSubmitting(true);
    try {
      const result = await transferPaymentSettlementV2({
        requestId,
        branchId: currentBranchId,
        sourceAccountId: selectedSource.account_id,
        targetKind,
        targetAccountId: resolvedTarget,
        grossAmount: grossNumber,
        feeAmount: feeNumber,
        providerReference,
        note,
      });
      toast({
        title: "تم تسجيل التوريد المالي",
        description: `${result.payment_method_name}: ${money(result.gross_amount)} → ${result.target_account_name}، صافي ${money(result.net_amount)}`,
      });
      closeDialog();
      await query.refetch();
    } catch (error: any) {
      toast({ title: "تعذر تنفيذ التوريد", description: error.message || "راجع البيانات وحاول مرة أخرى.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (!currentBranchId) return null;

  return (
    <section dir="rtl" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><ArrowLeftRight className="h-5 w-5 text-primary" /><h2 className="text-lg font-black">مركز تسويات وسائل الدفع</h2><Badge variant="secondary">Settlement V2</Badge></div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">رصيد البطاقة والمحافظ يظل في حساب التسوية الخاص بالوسيلة إلى أن تسجّل المالية توريده. التحويل إلى البنك أو الخزنة يسجل كحركة دفترية ذرية ولا يغيّر الفواتير أو تسوية الكاشير.</p>
        </div>
        <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> تحديث الأرصدة</Button>
      </div>

      {query.isError && <Alert variant="destructive"><AlertDescription>{query.error instanceof Error ? query.error.message : "تعذر تحميل حسابات التسوية."}</AlertDescription></Alert>}

      {!query.isLoading && query.data && !query.data.permissions.can_manage && <Alert><ShieldCheck className="h-4 w-4" /><AlertDescription>يمكنك عرض أرصدة وسائل الدفع، لكن تنفيذ التوريد يحتاج صلاحية إدارة المالية.</AlertDescription></Alert>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {query.isLoading ? Array.from({ length: 4 }).map((_, index) => <Card key={index} className="h-44 animate-pulse border-slate-100 bg-slate-50" />) : (query.data?.sources || []).map((source) => (
          <Card key={source.account_id} className={`border-slate-100 shadow-sm ${source.balance > 0.005 ? "ring-1 ring-emerald-100" : ""}`}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="font-bold text-slate-950">{source.payment_method_name}</p><p className="mt-1 truncate text-xs text-slate-500">{source.account_name}</p></div>
                <PaymentMethodBrand method={{ code: source.payment_method_code, name: source.payment_method_name, method_type: source.method_type }} compact />
              </div>
              <div className="mt-5"><p className="text-xs text-slate-500">الرصيد القائم للتسوية</p><p className={`mt-1 text-2xl font-black ${source.balance < -0.005 ? "text-red-700" : "text-slate-950"}`}>{money(source.balance)}</p></div>
              <div className="mt-4 flex items-center justify-between gap-2"><Badge variant={source.method_active === false ? "outline" : "secondary"}>{source.method_active === false ? "وسيلة مؤرشفة" : "نشطة"}</Badge><Button size="sm" disabled={!query.data?.permissions.can_manage || source.balance <= 0.005} onClick={() => startTransfer(source)}>توريد الرصيد</Button></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {query.data && query.data.sources.length === 0 && <Card><CardContent className="py-10 text-center text-sm text-slate-500">لا توجد حسابات تسوية إلكترونية لهذا الفرع.</CardContent></Card>}

      <Card className="border-slate-100 shadow-sm">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><WalletCards className="h-5 w-5 text-primary" />آخر عمليات التوريد</CardTitle></CardHeader>
        <CardContent>
          {(query.data?.recent_transfers || []).length === 0 ? <p className="py-8 text-center text-sm text-slate-500">لا توجد عمليات توريد إلكترونية مسجلة حتى الآن.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b text-slate-500"><th className="px-3 py-3 text-right">الوسيلة</th><th className="px-3 py-3 text-right">من / إلى</th><th className="px-3 py-3 text-left">الإجمالي</th><th className="px-3 py-3 text-left">الرسوم</th><th className="px-3 py-3 text-left">الصافي</th><th className="px-3 py-3 text-right">المرجع</th><th className="px-3 py-3 text-right">التاريخ</th></tr></thead><tbody>{query.data!.recent_transfers.map((row) => <tr key={row.settlement_id} className="border-b last:border-0"><td className="px-3 py-3 font-semibold">{row.payment_method_name}</td><td className="px-3 py-3"><div>{row.source_account_name}</div><div className="text-xs text-slate-500">← {row.target_account_name || (row.target_kind === "safe" ? "الخزنة" : "البنك")}</div></td><td className="px-3 py-3 text-left">{money(row.gross_amount)}</td><td className="px-3 py-3 text-left">{money(row.fee_amount)}</td><td className="px-3 py-3 text-left font-bold">{money(row.net_amount)}</td><td className="px-3 py-3">{row.provider_reference || "—"}</td><td className="px-3 py-3">{row.settled_at ? new Date(row.settled_at).toLocaleString("ar-EG") : "—"}<div className="text-xs text-slate-500">{row.created_by_name || ""}</div></td></tr>)}</tbody></table></div>}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedSource)} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent dir="rtl" className="sm:max-w-xl">
          <DialogHeader><DialogTitle>توريد رصيد {selectedSource?.payment_method_name}</DialogTitle><DialogDescription>{currentBranchName || "الفرع الحالي"} · هذه العملية تسجل حركة مالية فعلية في دفاتر النظام.</DialogDescription></DialogHeader>
          {selectedSource && <div className="space-y-4">
            <div className="flex items-center justify-between rounded-2xl border p-4"><div><p className="text-xs text-slate-500">الرصيد المتاح</p><strong className="text-xl">{money(selectedSource.balance)}</strong></div><PaymentMethodBrand method={{ code: selectedSource.payment_method_code, name: selectedSource.payment_method_name, method_type: selectedSource.method_type }} /></div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>جهة التوريد</Label><Select value={targetKind} onValueChange={(value) => changeTargetKind(value as FinanceSettlementTargetKind)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="safe"><span className="flex items-center gap-2"><Banknote className="h-4 w-4" /> خزنة الفرع</span></SelectItem><SelectItem value="bank"><span className="flex items-center gap-2"><Landmark className="h-4 w-4" /> حساب البنك</span></SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>حساب الاستلام</Label>{targets.length ? <Select value={targetAccountId || targets[0]?.account_id} onValueChange={setTargetAccountId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{targets.map((target) => <SelectItem key={target.account_id} value={target.account_id}>{target.name} · {money(target.balance)}</SelectItem>)}</SelectContent></Select> : targetKind === "bank" ? <div className="flex h-10 items-center rounded-md border px-3 text-sm text-slate-600"><Building2 className="ml-2 h-4 w-4" /> حساب البنك الافتراضي — ينشأ عند أول توريد</div> : <Alert variant="destructive"><AlertDescription>لا توجد خزنة فرع نشطة.</AlertDescription></Alert>}</div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="settlement-gross">المبلغ المراد سحبه من الوسيلة</Label><Input id="settlement-gross" inputMode="decimal" value={gross} onChange={(event) => setGross(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="settlement-fee">رسوم السحب/التحويل</Label><Input id="settlement-fee" inputMode="decimal" value={fee} onChange={(event) => setFee(event.target.value)} /></div></div>

            <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-4 text-sm"><div><p className="text-xs text-slate-500">يُخصم</p><strong>{money(grossNumber)}</strong></div><div><p className="text-xs text-slate-500">رسوم</p><strong>{money(feeNumber)}</strong></div><div><p className="text-xs text-slate-500">يصل فعليًا</p><strong className="text-emerald-700">{money(net)}</strong></div></div>

            {grossNumber > selectedSource.balance + 0.005 && <Alert variant="destructive"><AlertDescription>المبلغ أكبر من الرصيد المتاح لحساب التسوية.</AlertDescription></Alert>}

            <div className="space-y-2"><Label htmlFor="settlement-reference">مرجع العملية — اختياري</Label><Input id="settlement-reference" value={providerReference} onChange={(event) => setProviderReference(event.target.value)} placeholder="رقم عملية البنك أو المحفظة" /></div>
            <div className="space-y-2"><Label htmlFor="settlement-note">ملاحظة — اختياري</Label><Textarea id="settlement-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="مثال: سحب رصيد فودافون كاش وتوريده للخزنة" /></div>

            <Alert><ShieldCheck className="h-4 w-4" /><AlertDescription>التأكيد ينشئ سجل تسوية واحدًا بمعرف طلب فريد، ويخصم الإجمالي من حساب الوسيلة ويضيف الصافي فقط إلى جهة الاستلام. إعادة نفس الطلب لا تكرر القيد.</AlertDescription></Alert>
            <Button className="h-12 w-full" disabled={!canSubmit || submitting} onClick={() => void submit()}>{submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />} تأكيد وتسجيل التوريد</Button>
          </div>}
        </DialogContent>
      </Dialog>
    </section>
  );
}

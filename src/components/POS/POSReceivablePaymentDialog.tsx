import { useEffect, useMemo, useState } from "react";
import { Check, CreditCard, Plus, RefreshCw, SplitSquareHorizontal, Trash2, WalletCards } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import PaymentMethodBrand from "@/components/payments/PaymentMethodBrand";
import { calculatePOSPaymentFee, type POSPaymentMethod } from "@/services/supabase/posPaymentMethodService";
import { collectPOSReceivable, type POSReceivableCollectionResult, type POSReceivablePartyKind } from "@/services/supabase/posReceivableService";
import { siteConfig } from "@/config/site";

export type POSReceivableParty = {
  kind: POSReceivablePartyKind;
  id: string;
  name: string;
  balance: number;
};

type SplitDraft = { methodId: string; amount: string; reference: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string;
  party: POSReceivableParty | null;
  methods: POSPaymentMethod[];
  onCollected: (result: POSReceivableCollectionResult) => void;
};

function money(value: number) {
  return `${Number(value || 0).toFixed(2)} ${siteConfig.currency}`;
}

function distribute(ids: string[], amount: number): SplitDraft[] {
  const cents = Math.round(amount * 100);
  if (!ids.length || cents <= 0) return [];
  const each = Math.floor(cents / ids.length);
  let used = 0;
  return ids.map((methodId, index) => {
    const part = index === ids.length - 1 ? cents - used : each;
    used += part;
    return { methodId, amount: (part / 100).toFixed(2), reference: "" };
  });
}

export default function POSReceivablePaymentDialog({ open, onOpenChange, branchId, party, methods, onCollected }: Props) {
  const availableMethods = useMemo(
    () => methods
      .filter(method => method.active && method.code !== "employee_credit" && method.code !== "customer_credit" && !Boolean(method.metadata?.internal_only))
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ar")),
    [methods],
  );
  const [amount, setAmount] = useState("");
  const [methodId, setMethodId] = useState("");
  const [reference, setReference] = useState("");
  const [mixed, setMixed] = useState(false);
  const [splits, setSplits] = useState<SplitDraft[]>([]);
  const [cashTendered, setCashTendered] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paymentAmount = Math.max(0, Number(amount || 0));
  const selected = availableMethods.find(row => row.id === methodId) || null;
  const singlePreview = calculatePOSPaymentFee(selected, paymentAmount);
  const splitRows = useMemo(() => splits.map(draft => {
    const method = availableMethods.find(row => row.id === draft.methodId) || null;
    const base = Math.max(0, Number(draft.amount || 0));
    return { ...draft, method, base, preview: calculatePOSPaymentFee(method, base) };
  }), [splits, availableMethods]);
  const splitBase = Number(splitRows.reduce((sum, row) => sum + row.base, 0).toFixed(2));
  const splitRemaining = Number((paymentAmount - splitBase).toFixed(2));
  const cashDue = Number((mixed
    ? splitRows.filter(row => row.method?.method_type === "cash").reduce((sum, row) => sum + row.preview.amountCharged, 0)
    : selected?.method_type === "cash" ? singlePreview.amountCharged : 0).toFixed(2));
  const chargedTotal = Number((mixed
    ? splitRows.reduce((sum, row) => sum + row.preview.amountCharged, 0)
    : singlePreview.amountCharged).toFixed(2));

  useEffect(() => {
    if (!open || !party) return;
    setAmount(Number(party.balance || 0).toFixed(2));
    const cash = availableMethods.find(row => row.method_type === "cash") || availableMethods[0] || null;
    setMethodId(cash?.id || "");
    setReference("");
    setMixed(false);
    setSplits([]);
    setCashTendered(cash?.method_type === "cash" ? Number(party.balance || 0).toFixed(2) : "");
    setError(null);
  }, [open, party?.id, party?.balance, availableMethods]);

  useEffect(() => {
    if (!open || mixed) return;
    if (selected?.method_type === "cash") setCashTendered(singlePreview.amountCharged.toFixed(2));
    else setCashTendered("");
  }, [open, mixed, selected?.id, selected?.method_type, singlePreview.amountCharged]);

  useEffect(() => {
    if (!mixed || cashDue <= 0) return;
    setCashTendered(current => !current || Number(current) < cashDue ? cashDue.toFixed(2) : current);
  }, [mixed, cashDue]);

  const startMixed = () => {
    if (availableMethods.length < 2 || paymentAmount <= 0) return;
    const first = selected || availableMethods[0];
    const second = availableMethods.find(row => row.id !== first.id);
    if (!second) return;
    setSplits(distribute([first.id, second.id], paymentAmount));
    setMixed(true);
    setError(null);
  };

  const stopMixed = () => {
    setMixed(false);
    setSplits([]);
    setError(null);
  };

  const addMethod = (id: string) => {
    if (splits.some(row => row.methodId === id)) return;
    setSplits(distribute([...splits.map(row => row.methodId), id], paymentAmount));
  };

  const removeMethod = (id: string) => {
    const ids = splits.filter(row => row.methodId !== id).map(row => row.methodId);
    if (ids.length < 2) {
      stopMixed();
      if (ids[0]) setMethodId(ids[0]);
      return;
    }
    setSplits(distribute(ids, paymentAmount));
  };

  const updateSplit = (id: string, patch: Partial<SplitDraft>) => setSplits(current => current.map(row => row.methodId === id ? { ...row, ...patch } : row));
  const fillRemainder = (id: string) => {
    const other = splits.filter(row => row.methodId !== id).reduce((sum, row) => sum + Math.max(0, Number(row.amount || 0)), 0);
    updateSplit(id, { amount: Math.max(0, Number((paymentAmount - other).toFixed(2))).toFixed(2) });
  };

  const valid = useMemo(() => {
    if (!party || paymentAmount <= 0 || paymentAmount > Number(party.balance || 0) + 0.009) return false;
    if (mixed) {
      if (splitRows.length < 2 || Math.abs(splitRemaining) > 0.009) return false;
      if (splitRows.some(row => !row.method || row.base <= 0 || (row.method.require_reference && !row.reference.trim()))) return false;
    } else {
      if (!selected || (selected.require_reference && !reference.trim())) return false;
    }
    if (cashDue > 0 && Number(cashTendered || 0) < cashDue) return false;
    return true;
  }, [party, paymentAmount, mixed, splitRows, splitRemaining, selected, reference, cashDue, cashTendered]);

  const submit = async () => {
    if (!party || !valid || processing) return;
    setProcessing(true);
    setError(null);
    try {
      const result = await collectPOSReceivable({
        branchId,
        partyKind: party.kind,
        partyId: party.id,
        amount: paymentAmount,
        splits: mixed
          ? splitRows.map(row => ({ paymentMethodId: row.methodId, baseAmount: row.base, reference: row.reference.trim() || null }))
          : [{ paymentMethodId: selected!.id, baseAmount: paymentAmount, reference: reference.trim() || null }],
      });
      onCollected(result);
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || "تعذر تسجيل السداد.");
    } finally {
      setProcessing(false);
    }
  };

  const change = cashDue > 0 ? Math.max(0, Number(cashTendered || 0) - cashDue) : 0;

  return (
    <Dialog open={open} onOpenChange={next => { if (!processing) onOpenChange(next); }}>
      <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>سداد رصيد سابق</DialogTitle></DialogHeader>
        {!party ? null : (
          <div className="space-y-5">
            <div className="rounded-3xl bg-amber-50 p-4 text-amber-950">
              <div className="text-xs font-bold">الحساب</div>
              <div className="mt-1 text-lg font-black">{party.name}</div>
              <div className="mt-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>الرصيد السابق</span><strong className="text-xl">{money(party.balance)}</strong></div>
            </div>

            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

            <div className="space-y-2">
              <Label>المبلغ المراد سداده</Label>
              <Input inputMode="decimal" className="h-14 text-xl font-black" value={amount} onChange={event => setAmount(event.target.value)} />
              {paymentAmount > party.balance + 0.009 && <div className="text-xs font-bold text-red-600">المبلغ أكبر من الرصيد المستحق.</div>}
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setAmount(Number(party.balance).toFixed(2))}>سداد كامل</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setAmount((Number(party.balance) / 2).toFixed(2))}>نصف الرصيد</Button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div><div className="font-black">وسيلة التحصيل</div><div className="text-xs text-muted-foreground">السداد لا يُسجل كمبيعات جديدة.</div></div>
              {availableMethods.length >= 2 && (
                <div className="flex rounded-xl border bg-slate-50 p-1">
                  <Button type="button" size="sm" variant={!mixed ? "default" : "ghost"} className={!mixed ? "bg-[#005931]" : ""} onClick={stopMixed}>واحدة</Button>
                  <Button type="button" size="sm" variant={mixed ? "default" : "ghost"} className={mixed ? "bg-[#005931]" : ""} onClick={startMixed}><SplitSquareHorizontal className="ml-1 h-4 w-4" />مختلط</Button>
                </div>
              )}
            </div>

            {!mixed ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {availableMethods.map(method => (
                    <button key={method.id} type="button" onClick={() => { setMethodId(method.id); setReference(""); }} className={`min-h-[96px] rounded-2xl border p-3 text-center ${method.id === methodId ? "border-[#005931] bg-emerald-50 text-[#005931]" : "bg-white"}`}>
                      <PaymentMethodBrand method={method} compact className="border-0 shadow-none" />
                      <div className="mt-1 text-sm font-black">{method.name}</div>
                    </button>
                  ))}
                </div>
                {selected?.require_reference && <div><Label>مرجع العملية</Label><Input className="mt-1" dir="ltr" value={reference} onChange={event => setReference(event.target.value)} /></div>}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">{availableMethods.filter(method => !splits.some(row => row.methodId === method.id)).map(method => <Button key={method.id} type="button" variant="outline" size="sm" onClick={() => addMethod(method.id)}><Plus className="ml-1 h-3.5 w-3.5" />{method.name}</Button>)}</div>
                {splitRows.map(row => row.method && <div key={row.methodId} className="rounded-2xl border p-3">
                  <div className="flex items-center gap-2"><div className="min-w-0 flex-1 font-black">{row.method.name}</div><Button type="button" variant="ghost" size="icon" className="text-red-600" onClick={() => removeMethod(row.methodId)}><Trash2 className="h-4 w-4" /></Button></div>
                  <div className="mt-2 grid grid-cols-[1fr_auto] gap-2"><Input inputMode="decimal" value={row.amount} onChange={event => updateSplit(row.methodId, { amount: event.target.value })} /><Button type="button" variant="outline" onClick={() => fillRemainder(row.methodId)}>المتبقي</Button></div>
                  {row.method.require_reference && <Input className="mt-2" dir="ltr" placeholder="مرجع العملية" value={row.reference} onChange={event => updateSplit(row.methodId, { reference: event.target.value })} />}
                </div>)}
                <div className={`rounded-2xl p-3 text-sm ${Math.abs(splitRemaining) <= 0.009 ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>المتبقي في التوزيع: <strong>{money(splitRemaining)}</strong></div>
              </div>
            )}

            {cashDue > 0 && <div className="rounded-2xl border bg-slate-50 p-3"><Label>النقدي المستلم · المطلوب {money(cashDue)}</Label><Input inputMode="decimal" className="mt-2 h-12 bg-white text-lg font-black" value={cashTendered} onChange={event => setCashTendered(event.target.value)} /><div className="mt-2 text-sm">الباقي للعميل: <strong className="text-[#005931]">{money(change)}</strong></div></div>}

            <div className="rounded-3xl bg-slate-50 p-4">
              <div className="flex justify-between"><span>سيتم تخفيض المديونية</span><strong>{money(paymentAmount)}</strong></div>
              <div className="mt-2 flex justify-between"><span>المطلوب تحصيله فعليًا</span><strong>{money(chargedTotal)}</strong></div>
              <div className="mt-2 flex justify-between border-t pt-2"><span>الرصيد بعد السداد</span><strong className="text-[#005931]">{money(Math.max(0, party.balance - paymentAmount))}</strong></div>
            </div>

            <Button className="h-14 w-full bg-[#005931]" disabled={!valid || processing} onClick={() => void submit()}>
              {processing ? <RefreshCw className="ml-2 h-5 w-5 animate-spin" /> : <Check className="ml-2 h-5 w-5" />}
              {processing ? "جاري تسجيل السداد..." : `تأكيد السداد · ${money(paymentAmount)}`}
            </Button>
            <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground"><WalletCards className="h-3.5 w-3.5" />السداد يخفض المديونية ويُسجل في الوردية، لكنه لا يزيد المبيعات.</div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote, CreditCard, Landmark, RefreshCw, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { useBranchStore } from "@/stores/branchStore";
import {
  depositOnlineCashToSafe,
  getOnlineMoneyOverview,
  recordOnlineGatewaySettlement,
} from "@/services/supabase/onlineMoneyService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

function money(value: number) {
  return `${Number(value || 0).toFixed(2)} ج.م`;
}

export default function OnlineMoneySettings() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [cashAmount, setCashAmount] = useState("");
  const [cashNote, setCashNote] = useState("");
  const [settlementMethod, setSettlementMethod] = useState<"wallet" | "card" | "bank_transfer">("wallet");
  const [gross, setGross] = useState("");
  const [fee, setFee] = useState("0");
  const [reference, setReference] = useState("");
  const [settlementNote, setSettlementNote] = useState("");
  const [savingCash, setSavingCash] = useState(false);
  const [savingSettlement, setSavingSettlement] = useState(false);

  const query = useQuery({
    queryKey: ["online-money-overview", currentBranchId],
    queryFn: () => getOnlineMoneyOverview(currentBranchId!),
    enabled: Boolean(currentBranchId),
    refetchInterval: 5000,
  });

  const clearingAccounts = useMemo(
    () => (query.data?.payment_accounts || []).filter(account => account.account_type === "gateway_clearing"),
    [query.data?.payment_accounts],
  );
  const bankAccounts = useMemo(
    () => (query.data?.payment_accounts || []).filter(account => account.account_type === "bank"),
    [query.data?.payment_accounts],
  );
  const electronicPending = clearingAccounts.reduce((sum, account) => sum + account.balance, 0);
  const bankSettled = bankAccounts.reduce((sum, account) => sum + account.balance, 0);
  const net = Math.max(0, Number(gross || 0) - Number(fee || 0));

  const depositCash = async () => {
    if (!currentBranchId) return;
    const amount = Number(cashAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("اكتب مبلغ التوريد بشكل صحيح");
      return;
    }
    setSavingCash(true);
    try {
      await depositOnlineCashToSafe(currentBranchId, amount, cashNote);
      toast.success("تم توريد تحصيل الأونلاين إلى خزنة الفرع");
      setCashAmount("");
      setCashNote("");
      await query.refetch();
    } catch (error: any) {
      toast.error(error?.message || "تعذر توريد تحصيل الأونلاين");
    } finally {
      setSavingCash(false);
    }
  };

  const settleElectronic = async () => {
    if (!currentBranchId) return;
    const grossValue = Number(gross);
    const feeValue = Number(fee || 0);
    if (!Number.isFinite(grossValue) || grossValue <= 0 || !Number.isFinite(feeValue) || feeValue < 0 || feeValue > grossValue) {
      toast.error("راجع إجمالي التسوية والعمولة");
      return;
    }
    setSavingSettlement(true);
    try {
      await recordOnlineGatewaySettlement({
        branchId: currentBranchId,
        paymentMethod: settlementMethod,
        gross: grossValue,
        fee: feeValue,
        providerReference: reference,
        note: settlementNote,
      });
      toast.success("تم تسجيل التسوية الإلكترونية والعمولة والصافي البنكي");
      setGross("");
      setFee("0");
      setReference("");
      setSettlementNote("");
      await query.refetch();
    } catch (error: any) {
      toast.error(error?.message || "تعذر تسجيل التسوية الإلكترونية");
    } finally {
      setSavingSettlement(false);
    }
  };

  if (!currentBranchId) {
    return <Alert><AlertDescription>اختار الفرع أولًا لعرض وتسوية أموال الطلبات الإلكترونية.</AlertDescription></Alert>;
  }

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">تسويات الأونلاين</h2>
          <p className="mt-1 text-sm text-muted-foreground">{currentBranchName || "الفرع الحالي"} · افصل النقد المحصل عن الأموال المعلقة عند مزودي الدفع.</p>
        </div>
        <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => query.refetch()}>
          <RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> تحديث
        </Button>
      </div>

      {query.error && <Alert variant="destructive"><AlertDescription>{(query.error as Error).message}</AlertDescription></Alert>}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>Cash Online غير المورد</CardDescription><CardTitle className="text-2xl">{money(query.data?.online_cash_balance || 0)}</CardTitle></CardHeader><CardContent><Banknote className="h-5 w-5 text-[#005931]" /></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>الخزنة الرئيسية</CardDescription><CardTitle className="text-2xl">{money(query.data?.safe_balance || 0)}</CardTitle></CardHeader><CardContent><WalletCards className="h-5 w-5 text-[#005931]" /></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>معلق لدى مزودي الدفع</CardDescription><CardTitle className="text-2xl">{money(electronicPending)}</CardTitle></CardHeader><CardContent><CreditCard className="h-5 w-5 text-[#005931]" /></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>تم تسويته للبنك</CardDescription><CardTitle className="text-2xl">{money(bankSettled)}</CardTitle></CardHeader><CardContent><Landmark className="h-5 w-5 text-[#005931]" /></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>توريد Cash Online للخزنة</CardTitle>
            <CardDescription>استخدمه فقط عند استلام النقد فعليًا من مندوب/تحصيل الأونلاين. العملية تنقل الرصيد من حساب التحصيل إلى خزنة الفرع ولا تنشئ دخلًا جديدًا.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>المبلغ</Label><Input inputMode="decimal" value={cashAmount} onChange={e => setCashAmount(e.target.value)} placeholder="0.00" /></div>
            <div className="space-y-2"><Label>ملاحظة — اختياري</Label><Textarea value={cashNote} onChange={e => setCashNote(e.target.value)} placeholder="مثلاً: توريد تحصيل وردية التوصيل المسائية" /></div>
            <Button className="w-full bg-[#005931] hover:bg-[#004a29]" disabled={savingCash || Number(cashAmount || 0) <= 0} onClick={depositCash}>
              {savingCash && <RefreshCw className="ml-2 h-4 w-4 animate-spin" />} توريد للخزنة
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>تسجيل تسوية إلكترونية</CardTitle>
            <CardDescription>سجّل إشعار التحويل من مزود الدفع: إجمالي العمليات، العمولة، والصافي الذي وصل البنك.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>طريقة الدفع</Label>
              <Select value={settlementMethod} onValueChange={value => setSettlementMethod(value as typeof settlementMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="wallet">Wallet</SelectItem><SelectItem value="card">Card</SelectItem><SelectItem value="bank_transfer">Bank Transfer</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>الإجمالي Gross</Label><Input inputMode="decimal" value={gross} onChange={e => setGross(e.target.value)} placeholder="0.00" /></div>
              <div className="space-y-2"><Label>العمولة Fee</Label><Input inputMode="decimal" value={fee} onChange={e => setFee(e.target.value)} placeholder="0.00" /></div>
            </div>
            <div className="rounded-xl bg-muted/60 p-3 text-sm"><span className="text-muted-foreground">الصافي المتوقع للبنك: </span><strong>{money(net)}</strong></div>
            <div className="space-y-2"><Label>مرجع التحويل</Label><Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Settlement / Transfer reference" /></div>
            <div className="space-y-2"><Label>ملاحظة — اختياري</Label><Textarea value={settlementNote} onChange={e => setSettlementNote(e.target.value)} /></div>
            <Button className="w-full" disabled={savingSettlement || Number(gross || 0) <= 0} onClick={settleElectronic}>
              {savingSettlement && <RefreshCw className="ml-2 h-4 w-4 animate-spin" />} تسجيل التسوية
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>أرصدة الحسابات الإلكترونية</CardTitle><CardDescription>الرصيد الموجب في Clearing يعني أموالًا مسجلة كمدفوعة ولم تتم تسويتها للبنك بعد.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {clearingAccounts.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد أرصدة إلكترونية مسجلة حتى الآن.</p> : clearingAccounts.map(account => (
            <div key={account.account_id} className="flex items-center justify-between rounded-xl border p-3 text-sm"><span>{account.name}</span><strong>{money(account.balance)}</strong></div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Banknote, CreditCard, Landmark, RefreshCw, RotateCcw, ShieldCheck, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { useBranchStore } from "@/stores/branchStore";
import { confirmOnlineRefund, depositOnlineCashToSafe, getOnlineMoneyOverview, getPendingOnlineRefunds } from "@/services/supabase/onlineMoneyService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";

function money(value: number) { return `${Number(value || 0).toFixed(2)} ج.م`; }

export default function OnlineMoneySettings() {
  const navigate = useNavigate();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [cashAmount, setCashAmount] = useState("");
  const [cashNote, setCashNote] = useState("");
  const [refundReferences, setRefundReferences] = useState<Record<string, string>>({});
  const [savingCash, setSavingCash] = useState(false);
  const [confirmingRefund, setConfirmingRefund] = useState<string | null>(null);

  const query = useQuery({ queryKey: ["online-money-overview", currentBranchId], queryFn: () => getOnlineMoneyOverview(currentBranchId!), enabled: Boolean(currentBranchId), refetchInterval: 5000 });
  const refundsQuery = useQuery({ queryKey: ["pending-online-refunds", currentBranchId], queryFn: () => getPendingOnlineRefunds(currentBranchId!), enabled: Boolean(currentBranchId), refetchInterval: 5000 });

  const clearingAccounts = useMemo(() => (query.data?.payment_accounts || []).filter(account => account.account_type === "gateway_clearing"), [query.data?.payment_accounts]);
  const bankAccounts = useMemo(() => (query.data?.payment_accounts || []).filter(account => account.account_type === "bank"), [query.data?.payment_accounts]);
  const electronicPending = clearingAccounts.reduce((sum, account) => sum + account.balance, 0);
  const bankSettled = bankAccounts.reduce((sum, account) => sum + account.balance, 0);

  const depositCash = async () => {
    if (!currentBranchId) return;
    const amount = Number(cashAmount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("اكتب مبلغ التوريد بشكل صحيح");
    setSavingCash(true);
    try {
      await depositOnlineCashToSafe(currentBranchId, amount, cashNote);
      toast.success("تم توريد تحصيل الأونلاين إلى خزنة الفرع");
      setCashAmount(""); setCashNote(""); await query.refetch();
    } catch (error: any) { toast.error(error?.message || "تعذر توريد تحصيل الأونلاين"); }
    finally { setSavingCash(false); }
  };

  const confirmRefund = async (refundId: string) => {
    setConfirmingRefund(refundId);
    try {
      await confirmOnlineRefund(refundId, refundReferences[refundId]);
      toast.success("تم تأكيد رد المبلغ من مزود الدفع");
      setRefundReferences(prev => { const next = { ...prev }; delete next[refundId]; return next; });
      await Promise.all([refundsQuery.refetch(), query.refetch()]);
    } catch (error: any) { toast.error(error?.message || "تعذر تأكيد رد المبلغ"); }
    finally { setConfirmingRefund(null); }
  };

  if (!currentBranchId) return <Alert><AlertDescription>اختار الفرع أولًا لعرض وتسوية أموال الطلبات الإلكترونية.</AlertDescription></Alert>;

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold">تسويات الأونلاين</h2><p className="mt-1 text-sm text-muted-foreground">{currentBranchName || "الفرع الحالي"} · افصل النقد المحصل عن الأموال المعلقة عند مزودي الدفع.</p></div><Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => Promise.all([query.refetch(), refundsQuery.refetch()])}><RefreshCw className={`ml-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />تحديث</Button></div>
      {query.error && <Alert variant="destructive"><AlertDescription>{(query.error as Error).message}</AlertDescription></Alert>}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>Cash Online غير المورد</CardDescription><CardTitle className="text-2xl">{money(query.data?.online_cash_balance || 0)}</CardTitle></CardHeader><CardContent><Banknote className="h-5 w-5 text-[#005931]" /></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>الخزنة الرئيسية</CardDescription><CardTitle className="text-2xl">{money(query.data?.safe_balance || 0)}</CardTitle></CardHeader><CardContent><WalletCards className="h-5 w-5 text-[#005931]" /></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>معلق لدى مزودي الدفع</CardDescription><CardTitle className="text-2xl">{money(electronicPending)}</CardTitle></CardHeader><CardContent><CreditCard className="h-5 w-5 text-[#005931]" /></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>رصيد الحسابات البنكية</CardDescription><CardTitle className="text-2xl">{money(bankSettled)}</CardTitle></CardHeader><CardContent><Landmark className="h-5 w-5 text-[#005931]" /></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>توريد Cash Online للخزنة</CardTitle><CardDescription>استخدمه عند استلام النقد فعليًا من مسار تحصيل الأونلاين.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="space-y-2"><Label>المبلغ</Label><Input inputMode="decimal" value={cashAmount} onChange={e => setCashAmount(e.target.value)} placeholder="0.00" /></div><div className="space-y-2"><Label>ملاحظة</Label><Textarea value={cashNote} onChange={e => setCashNote(e.target.value)} /></div><Button className="w-full bg-[#005931] hover:bg-[#004a29]" disabled={savingCash || Number(cashAmount || 0) <= 0} onClick={depositCash}>{savingCash && <RefreshCw className="ml-2 h-4 w-4 animate-spin" />}توريد للخزنة</Button></CardContent></Card>

        <Card className="border-emerald-200 bg-emerald-50/30"><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#005931]" />التسويات الإلكترونية انتقلت إلى Settlement V3</CardTitle><CardDescription>لم يعد مسموحًا تسجيل Card/Wallet مباشرة إلى البنك. المالية تسجل الإجمالي والعمولة والصافي، ثم مسؤول البنك/الخزنة يؤكد الوصول من المهام قبل إضافة الصافي للـLedger.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="rounded-xl bg-white p-3 text-sm"><strong>المسار:</strong> Clearing → قيد الاستلام → تأكيد مسؤول العهدة → بنك/خزنة</div><Button className="w-full bg-[#005931] hover:bg-[#004426]" onClick={() => navigate("/finance")}><WalletCards className="ml-2 h-4 w-4" />فتح مركز Settlement V3</Button></CardContent></Card>
      </div>

      <Card><CardHeader><CardTitle>أرصدة الحسابات الإلكترونية</CardTitle><CardDescription>الرصيد الموجب في Clearing يعني أموالًا مسجلة كمدفوعة ولم تبدأ تسويتها النهائية بعد.</CardDescription></CardHeader><CardContent className="space-y-2">{clearingAccounts.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد أرصدة إلكترونية مسجلة حتى الآن.</p> : clearingAccounts.map(account => <div key={account.account_id} className="flex items-center justify-between rounded-xl border p-3 text-sm"><span>{account.name}</span><strong>{money(account.balance)}</strong></div>)}</CardContent></Card>

      <Card><CardHeader><CardTitle className="flex items-center gap-2"><RotateCcw className="h-5 w-5" />Refunds إلكترونية في انتظار المزود</CardTitle><CardDescription>رد Wallet/Card لا يعتبر مكتملًا إلا بعد تأكيد مزود الدفع.</CardDescription></CardHeader><CardContent className="space-y-3">{refundsQuery.isLoading ? <p className="text-sm text-muted-foreground">جاري تحميل عمليات رد المبالغ...</p> : (refundsQuery.data || []).length === 0 ? <p className="text-sm text-muted-foreground">لا توجد Refunds إلكترونية معلقة.</p> : (refundsQuery.data || []).map(refund => <div key={refund.refund_id} className="space-y-3 rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-medium">{refund.payment_method.toUpperCase()} · {money(refund.amount)}</div><div className="mt-1 text-xs text-muted-foreground">طلب {refund.order_id.slice(0, 8)} · مرتجع {refund.return_id.slice(0, 8)}</div></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-800">في انتظار تأكيد المزود</span></div><div className="flex flex-col gap-2 sm:flex-row"><Input value={refundReferences[refund.refund_id] || ""} onChange={e => setRefundReferences(prev => ({ ...prev, [refund.refund_id]: e.target.value }))} placeholder="مرجع رد المبلغ — اختياري" /><Button disabled={confirmingRefund === refund.refund_id} onClick={() => confirmRefund(refund.refund_id)}>{confirmingRefund === refund.refund_id && <RefreshCw className="ml-2 h-4 w-4 animate-spin" />}تأكيد رد المبلغ</Button></div></div>)}</CardContent></Card>
    </div>
  );
}

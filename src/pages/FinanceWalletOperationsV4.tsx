import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Truck,
  Users,
  WalletCards,
} from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { siteConfig } from "@/config/site";
import { useBranchStore } from "@/stores/branchStore";
import {
  createSupplierWalletPaymentV4,
  createWalletExpenseV4,
  expectedWalletFee,
  fetchFinanceWalletWorkspaceV4,
  saveSupplierRepresentativeV1,
  voidSupplierWalletPaymentV4,
  type FinanceWalletOperationV4,
  type SupplierRepresentativeV1,
} from "@/services/supabase/financeWalletOperationsV4Service";

type Mode = "expense" | "supplier" | "representatives";

const inputClass = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
const textareaClass = "min-h-24 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

function money(value: number | string | null | undefined) {
  return `${siteConfig.currency} ${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
}

function MetricCard({ title, value, note, icon: Icon }: { title: string; value: string; note: string; icon: typeof WalletCards }) {
  return (
    <Card className="border-slate-100 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-600">{title}</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
          </div>
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><Icon size={21} /></span>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">{note}</p>
      </CardContent>
    </Card>
  );
}

function FeePreview({ expected, actual, amount }: { expected: number; actual: number; amount: number }) {
  const saving = expected - actual;
  return (
    <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 lg:grid-cols-4">
      <div><p className="text-xs text-slate-500">المبلغ الأساسي</p><p className="mt-1 font-black">{money(amount)}</p></div>
      <div><p className="text-xs text-slate-500">العمولة المتوقعة</p><p className="mt-1 font-black">{money(expected)}</p></div>
      <div><p className="text-xs text-slate-500">العمولة الفعلية</p><p className="mt-1 font-black">{money(actual)}</p></div>
      <div><p className="text-xs text-slate-500">التوفير / الزيادة</p><p className={`mt-1 font-black ${saving >= 0 ? "text-emerald-700" : "text-red-700"}`}>{saving >= 0 ? "+" : ""}{money(saving)}</p></div>
      <div className="col-span-2 border-t border-slate-200 pt-3 lg:col-span-4">
        <div className="flex items-center justify-between gap-3"><span className="text-sm font-bold text-slate-600">إجمالي الخصم من المحفظة</span><span className="text-lg font-black text-slate-950">{money(amount + actual)}</span></div>
      </div>
    </div>
  );
}

export default function FinanceWalletOperationsV4() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const branchId = currentBranchId || localStorage.getItem("currentBranchId") || "";
  const [mode, setMode] = useState<Mode>("expense");

  const [expenseWalletId, setExpenseWalletId] = useState("");
  const [expenseType, setExpenseType] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseActualFee, setExpenseActualFee] = useState("");
  const [expenseReference, setExpenseReference] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");

  const [supplierWalletId, setSupplierWalletId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [representativeId, setRepresentativeId] = useState("");
  const [purchaseId, setPurchaseId] = useState("");
  const [applyToSupplier, setApplyToSupplier] = useState(true);
  const [supplierAmount, setSupplierAmount] = useState("");
  const [supplierActualFee, setSupplierActualFee] = useState("");
  const [supplierReference, setSupplierReference] = useState("");
  const [supplierNote, setSupplierNote] = useState("");

  const [repSupplierId, setRepSupplierId] = useState("");
  const [repName, setRepName] = useState("");
  const [repPhone, setRepPhone] = useState("");
  const [repCanReceive, setRepCanReceive] = useState(true);
  const [repPayoutMethod, setRepPayoutMethod] = useState("vodafone_cash");
  const [repDestination, setRepDestination] = useState("");
  const [repLimit, setRepLimit] = useState("");
  const [repNotes, setRepNotes] = useState("");

  const workspaceQuery = useQuery({
    queryKey: ["finance-wallet-operations-v4", branchId],
    enabled: Boolean(branchId),
    queryFn: () => fetchFinanceWalletWorkspaceV4(branchId, 150),
    staleTime: 8_000,
  });

  const data = workspaceQuery.data;
  const wallets = data?.wallets || [];
  const suppliers = data?.suppliers || [];
  const representatives = data?.representatives || [];
  const purchases = data?.open_purchases || [];
  const operations = data?.recent_operations || [];

  useEffect(() => {
    if (!expenseWalletId && wallets[0]) setExpenseWalletId(wallets[0].account_id);
    if (!supplierWalletId && wallets[0]) setSupplierWalletId(wallets[0].account_id);
  }, [wallets, expenseWalletId, supplierWalletId]);

  useEffect(() => {
    setRepresentativeId("");
    setPurchaseId("");
  }, [supplierId]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["finance-wallet-operations-v4", branchId] }),
      queryClient.invalidateQueries({ queryKey: ["finance-control-center-v2"] }),
      queryClient.invalidateQueries({ queryKey: ["financialSummary"] }),
      queryClient.invalidateQueries({ queryKey: ["expenses"] }),
    ]);
  };

  const expenseWallet = wallets.find(item => item.account_id === expenseWalletId);
  const expenseAmountNumber = Number(expenseAmount || 0);
  const expenseExpectedFee = expectedWalletFee(expenseWallet, expenseAmountNumber);
  const expenseActualFeeNumber = expenseActualFee.trim() === "" ? expenseExpectedFee : Number(expenseActualFee || 0);

  const supplierWallet = wallets.find(item => item.account_id === supplierWalletId);
  const supplierAmountNumber = Number(supplierAmount || 0);
  const supplierExpectedFee = expectedWalletFee(supplierWallet, supplierAmountNumber);
  const supplierActualFeeNumber = supplierActualFee.trim() === "" ? supplierExpectedFee : Number(supplierActualFee || 0);
  const supplier = suppliers.find(item => item.supplier_id === supplierId);
  const supplierRepresentatives = representatives.filter(item => item.supplier_id === supplierId && item.active);
  const supplierPurchases = purchases.filter(item => item.supplier_id === supplierId);
  const selectedRepresentative = representatives.find(item => item.id === representativeId);
  const selectedPurchase = purchases.find(item => item.purchase_id === purchaseId);

  const totals = useMemo(() => ({
    walletBalance: wallets.reduce((sum, item) => sum + Number(item.balance || 0), 0),
    supplierDebt: suppliers.reduce((sum, item) => sum + Math.max(0, Number(item.branch_balance || 0)), 0),
    savings: operations.filter(item => item.status === "posted").reduce((sum, item) => sum + Number(item.fee_saving_amount || 0), 0),
    activeReps: representatives.filter(item => item.active && item.can_receive_payments).length,
  }), [wallets, suppliers, operations, representatives]);

  const expenseMutation = useMutation({
    mutationFn: () => createWalletExpenseV4({
      requestId: crypto.randomUUID(), branchId, paymentAccountId: expenseWalletId, type: expenseType,
      amount: expenseAmountNumber, description: expenseDescription, actualFee: expenseActualFee.trim() === "" ? null : expenseActualFeeNumber,
      providerReference: expenseReference,
    }),
    onSuccess: async result => {
      toast.success(`تم تسجيل المصروف وخصم ${money(result.total_debit)} من المحفظة`);
      setExpenseType(""); setExpenseAmount(""); setExpenseActualFee(""); setExpenseReference(""); setExpenseDescription("");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const supplierPaymentMutation = useMutation({
    mutationFn: () => createSupplierWalletPaymentV4({
      requestId: crypto.randomUUID(), branchId, paymentAccountId: supplierWalletId, supplierId,
      amount: supplierAmountNumber, representativeId: representativeId || null, purchaseId: purchaseId || null,
      applyToSupplier: purchaseId ? true : applyToSupplier, actualFee: supplierActualFee.trim() === "" ? null : supplierActualFeeNumber,
      providerReference: supplierReference, note: supplierNote,
    }),
    onSuccess: async result => {
      toast.success(`تم دفع ${money(result.principal_amount)} وخصم ${money(result.total_debit)} من المحفظة`);
      setSupplierAmount(""); setSupplierActualFee(""); setSupplierReference(""); setSupplierNote(""); setPurchaseId("");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const repMutation = useMutation({
    mutationFn: (rep?: SupplierRepresentativeV1) => saveSupplierRepresentativeV1(rep ? {
      representativeId: rep.id, branchId, supplierId: rep.supplier_id, name: rep.name, phone: rep.phone,
      canReceivePayments: rep.can_receive_payments, payoutMethod: rep.payout_method, payoutDestination: rep.payout_destination,
      paymentLimit: rep.payment_limit, notes: rep.notes, active: rep.active,
    } : {
      branchId, supplierId: repSupplierId, name: repName, phone: repPhone, canReceivePayments: repCanReceive,
      payoutMethod: repPayoutMethod, payoutDestination: repDestination, paymentLimit: repLimit.trim() === "" ? null : Number(repLimit),
      notes: repNotes, active: true,
    }),
    onSuccess: async () => {
      toast.success("تم حفظ بيانات المندوب");
      setRepName(""); setRepPhone(""); setRepDestination(""); setRepLimit(""); setRepNotes("");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const voidMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => voidSupplierWalletPaymentV4(id, reason),
    onSuccess: async () => { toast.success("تم إلغاء دفعة المورد وعكس الرصيد والمديونية"); await refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleRepresentative = (rep: SupplierRepresentativeV1, field: "active" | "can_receive_payments") => {
    repMutation.mutate({ ...rep, [field]: !rep[field] });
  };

  const voidSupplierPayment = (operation: FinanceWalletOperationV4) => {
    const id = operation.operation_id || operation.id;
    if (!id) return;
    const reason = window.prompt("اكتب سبب إلغاء دفعة المورد:");
    if (reason === null) return;
    if (!reason.trim()) return toast.error("سبب الإلغاء مطلوب");
    voidMutation.mutate({ id, reason });
  };

  if (!branchId) {
    return <MainLayout><div dir="rtl" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">اختر فرعًا أولًا لفتح تشغيل المحافظ.</div></MainLayout>;
  }

  return (
    <MainLayout>
      <div dir="rtl" className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-black text-slate-950">تشغيل المحافظ والموردين</h1><Badge className="bg-emerald-700">V4</Badge></div>
            <p className="mt-1 text-sm text-slate-500">{currentBranchName || "الفرع الحالي"} — مصروفات ودفع موردين وعمولات فعلية وسجل مورد واحد موثوق.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/finance/control-center")}><ArrowRight className="ml-2 h-4 w-4" />مركز الماليات</Button>
            <Button variant="outline" onClick={() => workspaceQuery.refetch()} disabled={workspaceQuery.isFetching}><RefreshCw className={`ml-2 h-4 w-4 ${workspaceQuery.isFetching ? "animate-spin" : ""}`} />تحديث</Button>
          </div>
        </div>

        {workspaceQuery.isError && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{(workspaceQuery.error as Error).message}</div>}
        {(data?.legacy_unassigned_supplier_entries || 0) > 0 && (
          <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><span>يوجد {data?.legacy_unassigned_supplier_entries} قيد مورد قديم بدون فرع. تم الاحتفاظ به كسجل تاريخي ولا يدخل في رصيد الفرع الحالي.</span></div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="أرصدة المحافظ" value={money(totals.walletBalance)} note="الرصيد الحي في المحافظ الإلكترونية للفرع." icon={WalletCards} />
          <MetricCard title="مستحقات الموردين" value={money(totals.supplierDebt)} note="إجمالي الأرصدة الموجبة في Supplier Ledger للفرع." icon={Truck} />
          <MetricCard title="توفير العمولات" value={money(totals.savings)} note="المتوقع ناقص الفعلي في آخر العمليات المعروضة." icon={BadgeDollarSign} />
          <MetricCard title="مندوبون مصرح لهم" value={String(totals.activeReps)} note="مندوبون نشطون ومسموح لهم باستلام الأموال." icon={ShieldCheck} />
        </div>

        <div className="flex flex-wrap gap-2 rounded-2xl border bg-white p-2 shadow-sm">
          <Button variant={mode === "expense" ? "default" : "ghost"} onClick={() => setMode("expense")}><ReceiptText className="ml-2 h-4 w-4" />مصروف من المحفظة</Button>
          <Button variant={mode === "supplier" ? "default" : "ghost"} onClick={() => setMode("supplier")}><Truck className="ml-2 h-4 w-4" />دفع مورد / مندوب</Button>
          <Button variant={mode === "representatives" ? "default" : "ghost"} onClick={() => setMode("representatives")}><Users className="ml-2 h-4 w-4" />مناديب الموردين</Button>
        </div>

        {mode === "expense" && (
          <Card className="border-slate-100 shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-emerald-700" />تسجيل مصروف من محفظة إلكترونية</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="space-y-2"><span className="text-sm font-bold">المحفظة</span><select className={inputClass} value={expenseWalletId} onChange={e => setExpenseWalletId(e.target.value)}><option value="">اختر المحفظة</option>{wallets.map(w => <option key={w.account_id} value={w.account_id}>{w.method_name} — {money(w.balance)}</option>)}</select></label>
                <label className="space-y-2"><span className="text-sm font-bold">نوع المصروف</span><input className={inputClass} value={expenseType} onChange={e => setExpenseType(e.target.value)} placeholder="مثال: صيانة / مشتريات تشغيلية" /></label>
                <label className="space-y-2"><span className="text-sm font-bold">المبلغ</span><input className={inputClass} type="number" min="0" step="0.01" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)} /></label>
                <label className="space-y-2"><span className="text-sm font-bold">العمولة الفعلية</span><input className={inputClass} type="number" min="0" step="0.01" value={expenseActualFee} onChange={e => setExpenseActualFee(e.target.value)} placeholder={`المتوقع ${expenseExpectedFee.toFixed(2)}`} /></label>
                <label className="space-y-2"><span className="text-sm font-bold">مرجع التحويل</span><input className={inputClass} value={expenseReference} onChange={e => setExpenseReference(e.target.value)} placeholder="اختياري" /></label>
                <label className="space-y-2 md:col-span-2 xl:col-span-1"><span className="text-sm font-bold">الوصف</span><input className={inputClass} value={expenseDescription} onChange={e => setExpenseDescription(e.target.value)} placeholder="تفاصيل المصروف" /></label>
              </div>
              <FeePreview expected={expenseExpectedFee} actual={expenseActualFeeNumber} amount={expenseAmountNumber} />
              {expenseWallet && expenseAmountNumber + expenseActualFeeNumber > Number(expenseWallet.balance) && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">الرصيد الحالي لا يكفي إجمالي الخصم.</div>}
              <div className="flex justify-end"><Button onClick={() => expenseMutation.mutate()} disabled={expenseMutation.isPending || !expenseWalletId || !expenseType.trim() || expenseAmountNumber <= 0}>{expenseMutation.isPending ? "جارٍ التسجيل..." : "تسجيل المصروف وخصم المحفظة"}</Button></div>
            </CardContent>
          </Card>
        )}

        {mode === "supplier" && (
          <Card className="border-slate-100 shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5 text-emerald-700" />دفع مورد أو مندوب</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="space-y-2"><span className="text-sm font-bold">المحفظة</span><select className={inputClass} value={supplierWalletId} onChange={e => setSupplierWalletId(e.target.value)}><option value="">اختر المحفظة</option>{wallets.map(w => <option key={w.account_id} value={w.account_id}>{w.method_name} — {money(w.balance)}</option>)}</select></label>
                <label className="space-y-2"><span className="text-sm font-bold">المورد</span><select className={inputClass} value={supplierId} onChange={e => setSupplierId(e.target.value)}><option value="">اختر المورد</option>{suppliers.map(s => <option key={s.supplier_id} value={s.supplier_id}>{s.name} — مستحق {money(s.branch_balance)}</option>)}</select></label>
                <label className="space-y-2"><span className="text-sm font-bold">المندوب المستلم</span><select className={inputClass} value={representativeId} onChange={e => setRepresentativeId(e.target.value)}><option value="">دفع مباشر للمورد</option>{supplierRepresentatives.map(r => <option key={r.id} value={r.id} disabled={!r.can_receive_payments}>{r.name}{r.can_receive_payments ? "" : " — غير مصرح"}</option>)}</select></label>
                <label className="space-y-2"><span className="text-sm font-bold">فاتورة الشراء</span><select className={inputClass} value={purchaseId} onChange={e => { setPurchaseId(e.target.value); if (e.target.value) setApplyToSupplier(true); }}><option value="">بدون ربط بفاتورة</option>{supplierPurchases.map(p => <option key={p.purchase_id} value={p.purchase_id}>{p.invoice_number || p.purchase_id.slice(0, 8)} — متبقي {money(p.outstanding)}</option>)}</select></label>
                <label className="space-y-2"><span className="text-sm font-bold">المبلغ</span><input className={inputClass} type="number" min="0" step="0.01" max={selectedPurchase?.outstanding} value={supplierAmount} onChange={e => setSupplierAmount(e.target.value)} /></label>
                <label className="space-y-2"><span className="text-sm font-bold">العمولة الفعلية</span><input className={inputClass} type="number" min="0" step="0.01" value={supplierActualFee} onChange={e => setSupplierActualFee(e.target.value)} placeholder={`المتوقع ${supplierExpectedFee.toFixed(2)}`} /></label>
                <label className="space-y-2"><span className="text-sm font-bold">مرجع التحويل</span><input className={inputClass} value={supplierReference} onChange={e => setSupplierReference(e.target.value)} /></label>
                <label className="space-y-2 md:col-span-2"><span className="text-sm font-bold">ملاحظة</span><input className={inputClass} value={supplierNote} onChange={e => setSupplierNote(e.target.value)} /></label>
              </div>

              {!purchaseId && <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4"><input className="mt-1 h-4 w-4" type="checkbox" checked={applyToSupplier} onChange={e => setApplyToSupplier(e.target.checked)} /><span><span className="block text-sm font-black">احتساب الدفعة على حساب المورد</span><span className="mt-1 block text-xs leading-5 text-slate-500">لو ألغيت الاختيار، المبلغ سيخرج من المحفظة لكنه لن يخفض مديونية المورد. الربط بفاتورة يفعّل التخفيض تلقائيًا.</span></span></label>}
              {!purchaseId && !applyToSupplier && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">هذه دفعة غير مسواة على حساب المورد؛ ستظهر في سجل العمليات فقط ولن تغيّر مديونيته.</div>}
              {selectedRepresentative?.payment_limit != null && <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">حد استلام المندوب: <strong>{money(selectedRepresentative.payment_limit)}</strong></div>}
              {supplier && <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">رصيد المورد الحالي في الفرع: <strong>{money(supplier.branch_balance)}</strong></div>}
              <FeePreview expected={supplierExpectedFee} actual={supplierActualFeeNumber} amount={supplierAmountNumber} />
              <div className="flex justify-end"><Button onClick={() => supplierPaymentMutation.mutate()} disabled={supplierPaymentMutation.isPending || !supplierWalletId || !supplierId || supplierAmountNumber <= 0 || Boolean(selectedRepresentative && !selectedRepresentative.can_receive_payments)}>{supplierPaymentMutation.isPending ? "جارٍ الدفع..." : "تنفيذ دفع المورد"}</Button></div>
            </CardContent>
          </Card>
        )}

        {mode === "representatives" && (
          <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
            <Card className="border-slate-100 shadow-sm">
              <CardHeader><CardTitle>إضافة مندوب مورد</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <label className="space-y-2"><span className="text-sm font-bold">المورد</span><select className={inputClass} value={repSupplierId} onChange={e => setRepSupplierId(e.target.value)}><option value="">اختر المورد</option>{suppliers.map(s => <option key={s.supplier_id} value={s.supplier_id}>{s.name}</option>)}</select></label>
                <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-2"><span className="text-sm font-bold">اسم المندوب</span><input className={inputClass} value={repName} onChange={e => setRepName(e.target.value)} /></label><label className="space-y-2"><span className="text-sm font-bold">الهاتف</span><input className={inputClass} value={repPhone} onChange={e => setRepPhone(e.target.value)} /></label></div>
                <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-2"><span className="text-sm font-bold">وسيلة الاستلام</span><input className={inputClass} value={repPayoutMethod} onChange={e => setRepPayoutMethod(e.target.value)} placeholder="vodafone_cash / instapay" /></label><label className="space-y-2"><span className="text-sm font-bold">بيانات الاستلام</span><input className={inputClass} value={repDestination} onChange={e => setRepDestination(e.target.value)} placeholder="رقم محفظة / حساب" /></label></div>
                <label className="space-y-2"><span className="text-sm font-bold">حد الاستلام للعملية</span><input className={inputClass} type="number" min="0" step="0.01" value={repLimit} onChange={e => setRepLimit(e.target.value)} placeholder="بدون حد" /></label>
                <label className="flex items-center gap-3 rounded-xl border p-3"><input type="checkbox" checked={repCanReceive} onChange={e => setRepCanReceive(e.target.checked)} /><span className="text-sm font-bold">مصرح له باستلام أموال</span></label>
                <label className="space-y-2"><span className="text-sm font-bold">ملاحظات</span><textarea className={textareaClass} value={repNotes} onChange={e => setRepNotes(e.target.value)} /></label>
                <Button className="w-full" disabled={repMutation.isPending || !repSupplierId || !repName.trim()} onClick={() => repMutation.mutate(undefined)}>{repMutation.isPending ? "جارٍ الحفظ..." : "حفظ المندوب"}</Button>
              </CardContent>
            </Card>

            <Card className="border-slate-100 shadow-sm">
              <CardHeader><CardTitle>المناديب المسجلون</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {representatives.length === 0 && <p className="py-8 text-center text-sm text-slate-500">لا يوجد مناديب مسجلون لهذا الفرع.</p>}
                {representatives.map(rep => {
                  const supplierName = suppliers.find(s => s.supplier_id === rep.supplier_id)?.name || "مورد";
                  return <div key={rep.id} className="rounded-2xl border border-slate-100 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-black">{rep.name}</p><Badge variant={rep.active ? "default" : "secondary"}>{rep.active ? "نشط" : "موقوف"}</Badge><Badge variant={rep.can_receive_payments ? "default" : "outline"}>{rep.can_receive_payments ? "مصرح بالاستلام" : "غير مصرح"}</Badge></div><p className="mt-1 text-sm text-slate-500">{supplierName}{rep.phone ? ` • ${rep.phone}` : ""}</p><p className="mt-1 text-xs text-slate-500">{rep.payout_method || "بدون وسيلة"}{rep.payout_destination ? ` — ${rep.payout_destination}` : ""}{rep.payment_limit != null ? ` — حد ${money(rep.payment_limit)}` : ""}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => toggleRepresentative(rep,"can_receive_payments")}>{rep.can_receive_payments ? "إيقاف الاستلام" : "السماح بالاستلام"}</Button><Button size="sm" variant="outline" onClick={() => toggleRepresentative(rep,"active")}>{rep.active ? "إيقاف المندوب" : "تفعيل المندوب"}</Button></div></div>
                  </div>;
                })}
              </CardContent>
            </Card>
          </div>
        )}

        <Card className="border-slate-100 shadow-sm">
          <CardHeader><CardTitle>آخر عمليات المحافظ</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead><tr className="border-b text-right text-xs text-slate-500"><th className="px-3 py-3">التاريخ</th><th className="px-3 py-3">العملية</th><th className="px-3 py-3">المحفظة</th><th className="px-3 py-3">الطرف</th><th className="px-3 py-3">المبلغ</th><th className="px-3 py-3">متوقع</th><th className="px-3 py-3">فعلي</th><th className="px-3 py-3">التوفير</th><th className="px-3 py-3">الإجمالي</th><th className="px-3 py-3">الحالة</th><th className="px-3 py-3">إجراء</th></tr></thead>
                <tbody>
                  {operations.map(op => <tr key={op.operation_id || op.id} className="border-b last:border-0"><td className="px-3 py-3 text-slate-500">{dateTime(op.created_at)}</td><td className="px-3 py-3 font-bold">{op.operation_type === "expense" ? "مصروف" : "دفع مورد"}</td><td className="px-3 py-3">{op.account_name || "—"}</td><td className="px-3 py-3">{op.supplier_name || "—"}{op.representative_name ? <span className="block text-xs text-slate-500">{op.representative_name}</span> : null}</td><td className="px-3 py-3">{money(op.principal_amount)}</td><td className="px-3 py-3">{money(op.expected_fee_amount)}</td><td className="px-3 py-3">{money(op.actual_fee_amount)}</td><td className={`px-3 py-3 font-bold ${Number(op.fee_saving_amount) >= 0 ? "text-emerald-700" : "text-red-700"}`}>{money(op.fee_saving_amount)}</td><td className="px-3 py-3 font-black">{money(op.total_debit)}</td><td className="px-3 py-3"><Badge variant={op.status === "posted" ? "default" : "secondary"}>{op.status === "posted" ? "مرحّل" : "ملغي"}</Badge></td><td className="px-3 py-3">{op.operation_type === "supplier_payment" && op.status === "posted" ? <Button size="sm" variant="outline" disabled={voidMutation.isPending} onClick={() => voidSupplierPayment(op)}><RotateCcw className="ml-1 h-3.5 w-3.5" />إلغاء</Button> : "—"}</td></tr>)}
                  {operations.length === 0 && <tr><td colSpan={11} className="py-10 text-center text-slate-500">لا توجد عمليات بعد.</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, CheckCircle2, Clock3, Plus, ReceiptText, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { LocalPosDevice } from "@/services/supabase/posDeviceService";
import {
  getMyPosExpenses,
  getPosExpenseCategories,
  payMyPosExpense,
  requestPosExpense,
  type PosExpenseCategory,
  type PosExpenseDocument,
} from "@/services/supabase/posExpenseService";

function money(value: number | null | undefined) {
  return `${Number(value || 0).toFixed(2)} ج.م`;
}

function statusLabel(status: PosExpenseDocument["status"]) {
  if (status === "pending_approval") return "بانتظار الاعتماد";
  if (status === "approved") return "معتمد — جاهز للصرف";
  if (status === "partially_paid") return "مدفوع جزئيًا";
  if (status === "paid") return "تم الصرف";
  if (status === "rejected") return "مرفوض";
  return status;
}

export default function PosShiftExpensePanel({ device, shiftOpen, onCashChanged }: {
  device: LocalPosDevice;
  shiftOpen: boolean;
  onCashChanged: () => Promise<void> | void;
}) {
  const [categories, setCategories] = useState<PosExpenseCategory[]>([]);
  const [expenses, setExpenses] = useState<PosExpenseDocument[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [description, setDescription] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");

  const selectedCategory = useMemo(() => categories.find(category => category.id === categoryId), [categories, categoryId]);

  const refresh = useCallback(async () => {
    if (!shiftOpen) {
      setExpenses([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextCategories, nextExpenses] = await Promise.all([
        getPosExpenseCategories(device),
        getMyPosExpenses(device),
      ]);
      setCategories(nextCategories);
      setExpenses(nextExpenses.items);
      setCategoryId(current => current || nextCategories[0]?.id || "");
    } catch (cause: any) {
      setError(cause?.message || "تعذر تحميل مصروفات الوردية.");
    } finally {
      setLoading(false);
    }
  }, [device.device_id, device.device_token, shiftOpen]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const submitRequest = async () => {
    const value = Number(amount);
    if (!categoryId || !Number.isFinite(value) || value <= 0 || !description.trim()) {
      setError("اختر البند واكتب قيمة ووصف المصروف.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await requestPosExpense(device, {
        categoryId,
        amount: value,
        description,
        beneficiaryName: beneficiary,
        receiptUrl,
      });
      const state = String(saved.status || "pending_approval");
      setNotice(state === "approved" ? "تم اعتماد الطلب تلقائيًا حسب سياسة البند، ويمكن صرفه من الدرج." : "تم إرسال طلب المصروف للموافقة. لن تخصم أي نقدية قبل الاعتماد والصرف.");
      setAmount("");
      setBeneficiary("");
      setDescription("");
      setReceiptUrl("");
      await refresh();
    } catch (cause: any) {
      setError(cause?.message || "تعذر إرسال طلب المصروف.");
    } finally {
      setSubmitting(false);
    }
  };

  const payExpense = async (expense: PosExpenseDocument) => {
    setPayingId(expense.id);
    setError(null);
    setNotice(null);
    try {
      await payMyPosExpense(device, expense.id);
      setNotice(`تم صرف ${expense.document_number} من درج الوردية وتحديث الرصيد المتوقع.`);
      await Promise.all([refresh(), Promise.resolve(onCashChanged())]);
      window.dispatchEvent(new CustomEvent("pos:cash-changed", { detail: { type: "expense_cash", amount: expense.remaining_amount, expense_id: expense.id } }));
    } catch (cause: any) {
      setError(cause?.message || "تعذر صرف المصروف من الدرج.");
    } finally {
      setPayingId(null);
    }
  };

  return <>
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-bold text-slate-800"><ReceiptText className="h-4 w-4 text-[#005931]"/> مصروفات الوردية</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">اطلب المصروف أولًا. بعد الاعتماد يظهر لك زر الصرف، وعندها فقط تُخصم النقدية من الدرج.</p>
        </div>
        <Button variant="outline" size="sm" disabled={!shiftOpen} onClick={() => setOpen(true)}><Plus className="h-4 w-4"/> طلب / متابعة</Button>
      </div>
    </div>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-[#005931]"/> مصروفات الوردية</DialogTitle>
          <DialogDescription>طلب المصروف لا يغير رصيد الدرج. الاعتماد ثم الضغط على «صرف من الدرج» هما اللذان يسجلان الخروج النقدي.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {notice && <Alert><CheckCircle2 className="h-4 w-4 text-green-700"/><AlertDescription>{notice}</AlertDescription></Alert>}

          <section className="space-y-3 rounded-2xl border p-4">
            <div className="font-bold">طلب جديد</div>
            <div className="space-y-2">
              <Label htmlFor="pos-expense-category">البند</Label>
              <select id="pos-expense-category" className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={categoryId} onChange={event => setCategoryId(event.target.value)} disabled={loading || !categories.length}>
                {categories.map(category => <option key={category.id} value={category.id}>{category.group_name_ar} — {category.name_ar}</option>)}
              </select>
            </div>
            {selectedCategory && <div className="flex flex-wrap gap-2 text-[11px] text-slate-600"><span className="rounded-full bg-slate-100 px-2 py-1">{selectedCategory.approval_required ? "يتطلب اعتماد" : "اعتماد تلقائي"}</span>{selectedCategory.receipt_required_above > 0 && <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-800">إثبات مطلوب من {money(selectedCategory.receipt_required_above)}</span>}</div>}
            <div className="space-y-2"><Label htmlFor="pos-expense-amount">القيمة</Label><Input id="pos-expense-amount" inputMode="decimal" type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00"/></div>
            <div className="space-y-2"><Label htmlFor="pos-expense-beneficiary">المستفيد — اختياري</Label><Input id="pos-expense-beneficiary" value={beneficiary} onChange={event => setBeneficiary(event.target.value)} placeholder="فني / شركة / جهة"/></div>
            <div className="space-y-2"><Label htmlFor="pos-expense-description">السبب / الوصف</Label><Textarea id="pos-expense-description" value={description} onChange={event => setDescription(event.target.value)} placeholder="اكتب سبب المصروف بوضوح"/></div>
            <div className="space-y-2"><Label htmlFor="pos-expense-receipt">رابط إثبات — عند الحاجة</Label><Input id="pos-expense-receipt" value={receiptUrl} onChange={event => setReceiptUrl(event.target.value)} placeholder="رفع الصورة المباشر سيتم ربطه في مرحلة المرفقات"/></div>
            <Button className="h-11 w-full bg-[#005931] hover:bg-[#004a29]" disabled={submitting || loading || !shiftOpen} onClick={() => void submitRequest()}>{submitting ? <RefreshCw className="h-4 w-4 animate-spin"/> : <Plus className="h-4 w-4"/>} إرسال الطلب</Button>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between"><strong>طلبات ورديتي الحالية</strong><Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}/></Button></div>
            {!expenses.length && !loading && <div className="rounded-2xl border border-dashed p-5 text-center text-sm text-slate-500">لا توجد طلبات مصروف في الوردية الحالية.</div>}
            {expenses.map(expense => <article key={expense.id} className="rounded-2xl border p-3">
              <div className="flex items-start justify-between gap-3"><div><strong className="text-sm">{expense.document_number}</strong><div className="mt-1 text-xs text-slate-500">{expense.category_name} · {expense.description}</div></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${expense.status === "paid" ? "bg-green-50 text-green-700" : expense.status === "approved" || expense.status === "partially_paid" ? "bg-blue-50 text-blue-700" : expense.status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>{statusLabel(expense.status)}</span></div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-slate-50 p-2"><div className="text-[10px] text-slate-500">القيمة</div><strong className="text-xs">{money(expense.amount)}</strong></div><div className="rounded-xl bg-slate-50 p-2"><div className="text-[10px] text-slate-500">مدفوع</div><strong className="text-xs">{money(expense.paid_amount)}</strong></div><div className="rounded-xl bg-slate-50 p-2"><div className="text-[10px] text-slate-500">متبقي</div><strong className="text-xs">{money(expense.remaining_amount)}</strong></div></div>
              {(expense.status === "approved" || expense.status === "partially_paid") && expense.remaining_amount > 0 && <Button className="mt-3 h-10 w-full bg-[#005931] hover:bg-[#004a29]" disabled={payingId === expense.id} onClick={() => void payExpense(expense)}>{payingId === expense.id ? <RefreshCw className="h-4 w-4 animate-spin"/> : <Banknote className="h-4 w-4"/>} صرف المتبقي من الدرج</Button>}
              {expense.status === "pending_approval" && <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 p-2 text-xs text-amber-800"><Clock3 className="h-4 w-4"/> لن يخرج أي مبلغ من الدرج قبل الاعتماد.</div>}
            </article>)}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}

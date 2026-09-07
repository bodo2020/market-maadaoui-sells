import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, Clock3, CreditCard, Landmark, ReceiptText, RefreshCw, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { LocalPosDevice } from "@/services/supabase/posDeviceService";
import { cashDropToSafe, getPosCashSummary, type PosCashSummary } from "@/services/supabase/posCashService";

function money(value: number | null | undefined) {
  return `${Number(value || 0).toFixed(2)} ج.م`;
}

function shiftAge(openedAt?: string | null) {
  if (!openedAt) return "—";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(openedAt).getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} س ${rest} د` : `${rest} د`;
}

export default function PosCashDrawerWidget({ device }: { device: LocalPosDevice }) {
  const [summary, setSummary] = useState<PosCashSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [clockTick, setClockTick] = useState(0);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const next = await getPosCashSummary(device);
      setSummary(next);
      setError(null);
    } catch (e: any) {
      if (!quiet) setError(e.message || "تعذر قراءة رصيد درج الكاشير");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [device.device_id, device.device_token]);

  useEffect(() => {
    void refresh();

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };
    const onSaleCompleted = () => void refresh(true);
    const onCashChanged = () => void refresh(true);

    const timer = window.setInterval(refreshIfVisible, 8000);
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener("pos:sale-completed", onSaleCompleted);
    window.addEventListener("pos:cash-changed", onCashChanged);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener("pos:sale-completed", onSaleCompleted);
      window.removeEventListener("pos:cash-changed", onCashChanged);
    };
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick(value => value + 1), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const duration = useMemo(() => shiftAge(summary?.shift_opened_at), [summary?.shift_opened_at, clockTick]);

  const submitDrop = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("اكتب مبلغ التوريد بشكل صحيح.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await cashDropToSafe(device, value, note);
      await refresh(true);
      window.dispatchEvent(new CustomEvent("pos:cash-changed", { detail: { type: "cash_drop", amount: value } }));
      setAmount("");
      setNote("");
      setDropOpen(false);
    } catch (e: any) {
      setError(e.message || "تعذر توريد النقدية للخزنة");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div dir="rtl" className="fixed bottom-20 right-3 z-50 lg:bottom-4 lg:right-4">
        <Button
          variant="outline"
          className="h-auto min-w-[160px] justify-between gap-3 rounded-2xl bg-white px-3 py-2 text-xs shadow-lg sm:min-w-[190px] sm:px-4 sm:text-sm"
          onClick={() => { setDialogOpen(true); void refresh(true); }}
        >
          <span className="flex items-center gap-2 text-slate-600"><Banknote className="h-4 w-4 text-[#005931]" /> الوردية والدرج</span>
          <strong className="text-[#005931]">{loading && !summary ? "..." : money(summary?.drawer_balance)}</strong>
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-[#005931]" /> الوردية الحالية ودرج الكاشير</DialogTitle>
            <DialogDescription>{device.device_name} · الأرقام من الفواتير وCash Ledger لنفس الوردية</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-green-50 p-4 text-green-900">
                <div className="text-xs">الرصيد المتوقع في الدرج</div>
                <div className="mt-1 text-2xl font-black">{money(summary?.drawer_balance)}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center gap-1 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" /> مدة الوردية</div>
                <div className="mt-1 text-2xl font-black">{duration}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border p-3"><div className="flex items-center gap-1 text-xs text-slate-500"><ReceiptText className="h-3.5 w-3.5" /> الفواتير</div><strong className="mt-1 block text-lg">{summary?.sales_count ?? 0}</strong></div>
              <div className="rounded-xl border p-3"><div className="text-xs text-slate-500">إجمالي المبيعات</div><strong className="mt-1 block text-lg text-[#005931]">{money(summary?.sales_total)}</strong></div>
              <div className="rounded-xl border p-3"><div className="flex items-center gap-1 text-xs text-slate-500"><Banknote className="h-3.5 w-3.5" /> نقدي</div><strong className="mt-1 block text-lg">{money(summary?.cash_paid_total)}</strong></div>
              <div className="rounded-xl border p-3"><div className="flex items-center gap-1 text-xs text-slate-500"><CreditCard className="h-3.5 w-3.5" /> بطاقة</div><strong className="mt-1 block text-lg">{money(summary?.card_sales)}</strong></div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">بداية الوردية</div><strong>{money(summary?.opening_cash)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">دخل نقدي من المبيعات</div><strong className="text-green-700">+{money(summary?.cash_sales)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">مرتجعات نقدي</div><strong>{money(summary?.cash_refunds)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">مصروفات نقدية</div><strong>{money(summary?.cash_expenses)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">توريد للخزنة</div><strong className="text-amber-700">-{money(summary?.transfers_out)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">إضافات للدرج</div><strong>{money(summary?.transfers_in)}</strong></div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => void refresh()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> تحديث</Button>
              <Button className="flex-1 bg-[#005931] hover:bg-[#004a29]" onClick={() => { setError(null); setDropOpen(true); }}><Landmark className="h-4 w-4" /> توريد للخزنة</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dropOpen} onOpenChange={setDropOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>توريد نقدية للخزنة الرئيسية</DialogTitle>
            <DialogDescription>الرصيد الحالي في الدرج {money(summary?.drawer_balance)}. التحويل يتسجل على الدرج والخزنة في نفس العملية.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="space-y-2">
              <Label htmlFor="cash-drop-amount">المبلغ</Label>
              <Input id="cash-drop-amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="h-12" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cash-drop-note">ملاحظة — اختياري</Label>
              <Textarea id="cash-drop-note" value={note} onChange={e => setNote(e.target.value)} placeholder="مثلاً: توريد منتصف الوردية" />
            </div>
            <Button className="h-12 w-full bg-[#005931] hover:bg-[#004a29]" onClick={() => void submitDrop()} disabled={submitting || !amount.trim()}>
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />} تأكيد التوريد
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

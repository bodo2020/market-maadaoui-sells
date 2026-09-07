import { useCallback, useEffect, useState } from "react";
import { Banknote, RefreshCw, Safe, WalletCards } from "lucide-react";
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

export default function PosCashDrawerWidget({ device }: { device: LocalPosDevice }) {
  const [summary, setSummary] = useState<PosCashSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    const timer = window.setInterval(() => void refresh(true), 1500);
    return () => window.clearInterval(timer);
  }, [refresh]);

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
      <div dir="rtl" className="fixed bottom-4 right-4 z-50">
        <Button
          variant="outline"
          className="h-auto min-w-[170px] justify-between gap-3 rounded-2xl bg-white px-4 py-2 shadow-lg"
          onClick={() => { setDialogOpen(true); void refresh(true); }}
        >
          <span className="flex items-center gap-2 text-slate-600"><Banknote className="h-4 w-4 text-[#005931]" /> درج الكاشير</span>
          <strong className="text-[#005931]">{loading && !summary ? "..." : money(summary?.drawer_balance)}</strong>
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-[#005931]" /> درج الكاشير</DialogTitle>
            <DialogDescription>{device.device_name} · الرصيد بيتحدث تلقائيًا أثناء الوردية</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="rounded-2xl bg-green-50 p-4 text-center text-green-900">
              <div className="text-xs">الرصيد المتوقع في الدرج الآن</div>
              <div className="mt-1 text-3xl font-bold">{money(summary?.drawer_balance)}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">بداية الوردية</div><strong>{money(summary?.opening_cash)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">مبيعات نقدي</div><strong className="text-green-700">+{money(summary?.cash_sales)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">مرتجعات نقدي</div><strong>{money(summary?.cash_refunds)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">مصروفات نقدية</div><strong>{money(summary?.cash_expenses)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">توريد للخزنة</div><strong className="text-amber-700">-{money(summary?.transfers_out)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">إضافات للدرج</div><strong>{money(summary?.transfers_in)}</strong></div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => void refresh()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> تحديث</Button>
              <Button className="flex-1 bg-[#005931] hover:bg-[#004a29]" onClick={() => { setError(null); setDropOpen(true); }}><Safe className="h-4 w-4" /> توريد للخزنة</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dropOpen} onOpenChange={setDropOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>توريد نقدية للخزنة الرئيسية</DialogTitle>
            <DialogDescription>الرصيد الحالي في الدرج {money(summary?.drawer_balance)}. التحويل بيتسجل على الدرج والخزنة في نفس العملية.</DialogDescription>
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
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Safe className="h-4 w-4" />} تأكيد التوريد
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

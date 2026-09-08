import { ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { getLocalPosDevice } from "@/services/supabase/posDeviceService";
import { closePosShift, getMyOpenPosShift, openPosShift, type PosShift } from "@/services/supabase/posShiftService";
import { getPosCashSummary, type PosCashSummary } from "@/services/supabase/posCashService";
import PosCashDrawerWidget from "@/components/POS/PosCashDrawerWidget";
import PosShiftPaymentSummary from "@/components/POS/PosShiftPaymentSummary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock3, LogOut, MonitorSmartphone, Play, RefreshCw, Store, WalletCards } from "lucide-react";

function money(value: number | null | undefined) {
  return `${Number(value || 0).toFixed(2)} ج.م`;
}

function suspendedCartCount() {
  try {
    const raw = localStorage.getItem("pos_tabs");
    if (!raw) return 0;
    const tabs = JSON.parse(raw) as Array<{ cartItems?: unknown[] }>;
    if (!Array.isArray(tabs)) return 0;
    return tabs.filter(tab => Array.isArray(tab.cartItems) && tab.cartItems.length > 0).length;
  } catch {
    return 0;
  }
}

export default function PosShiftGatePro({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const navigate = useNavigate();

  const [shift, setShift] = useState<PosShift | null>(null);
  const [cashSummary, setCashSummary] = useState<PosCashSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingCash, setOpeningCash] = useState("0.00");
  const [closingCash, setClosingCash] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const [closingOpen, setClosingOpen] = useState(false);
  const [closingSummary, setClosingSummary] = useState<PosShift | null>(null);
  const [switchRequested, setSwitchRequested] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const device = useMemo(
    () => currentBranchId ? getLocalPosDevice(currentBranchId) : null,
    [currentBranchId],
  );

  const loadShift = async () => {
    if (!device) {
      setShift(null);
      setCashSummary(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [current, cash] = await Promise.all([
        getMyOpenPosShift(device),
        getPosCashSummary(device),
      ]);
      setShift(current);
      setCashSummary(cash);
      if (!current) setOpeningCash(Number(cash.drawer_balance || 0).toFixed(2));
    } catch (e: any) {
      setError(e.message || "تعذر تجهيز وردية الكاشير");
      setShift(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadShift();
  }, [device?.device_id, user?.id]);

  const refreshCash = async () => {
    if (!device) return null;
    const cash = await getPosCashSummary(device);
    setCashSummary(cash);
    return cash;
  };

  const startShift = async () => {
    if (!device) return;
    const amount = Number(openingCash);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("اكتب النقد المعدود فعليًا في درج الكاشير.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const opened = await openPosShift(device, amount);
      setShift(opened);
      setClosingSummary(null);
      await refreshCash();
    } catch (e: any) {
      setError(e.message || "تعذر بدء الوردية");
    } finally {
      setSubmitting(false);
    }
  };

  const openCloseDialog = async (switchEmployee = false) => {
    setSwitchRequested(switchEmployee);
    setClosingNotes("");
    setError(null);
    try {
      const cash = await refreshCash();
      setClosingCash(Number(cash?.drawer_balance || 0).toFixed(2));
    } catch (e: any) {
      setCashSummary(null);
      setError(e.message || "تعذر تحميل ملخص الوردية. أعد المحاولة قبل الإغلاق.");
      setClosingCash("");
      setClosingOpen(true);
      return;
    }
    setClosingOpen(true);
  };

  const finishShift = async () => {
    if (!device || !shift || !cashSummary || !closingCash.trim()) return;
    const amount = Number(closingCash);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("اكتب النقد الفعلي الموجود في الدرج عند الإغلاق.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await closePosShift(device, shift.id, amount, closingNotes);
      setClosingSummary(result);
      setShift(null);
      setClosingOpen(false);
      await refreshCash();
    } catch (e: any) {
      setError(e.message || "تعذر إنهاء الوردية");
    } finally {
      setSubmitting(false);
    }
  };

  const switchEmployeeNow = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const restartOwnShift = async () => {
    setClosingSummary(null);
    setSwitchRequested(false);
    await loadShift();
  };

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex items-center gap-2 text-slate-500"><RefreshCw className="h-5 w-5 animate-spin" /> جاري تجهيز الكاشير</div>
      </div>
    );
  }

  if (!currentBranchId) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md"><CardHeader><CardTitle>اختار الفرع أولًا</CardTitle><CardDescription>لازم يكون فيه فرع عمل نشط قبل فتح نقطة البيع.</CardDescription></CardHeader></Card>
      </div>
    );
  }

  if (!device) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md border-0 shadow-xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><MonitorSmartphone className="h-7 w-7" /></div>
            <CardTitle>الجهاز ده مش مسجل كجهاز POS</CardTitle>
            <CardDescription>البيع مسموح فقط من جهاز كاشير مسجل على {currentBranchName || "الفرع الحالي"}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full" onClick={() => navigate("/settings")}>إعدادات أجهزة POS</Button>
            <Button variant="ghost" className="w-full" onClick={() => navigate("/dashboard")}>لوحة التحكم</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!shift && !closingSummary) {
    const expected = Number(cashSummary?.drawer_balance || 0);
    const entered = Number(openingCash || 0);
    const variance = Number.isFinite(entered) ? entered - expected : 0;
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top,#e8f5ee_0,#f8faf9_45%,#f4f6f5_100%)] p-4">
        <Card className="w-full max-w-md border-0 shadow-xl">
          <CardHeader>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-50 text-[#005931]"><Play className="h-6 w-6" /></div>
              <Badge variant="secondary">{device.device_name}</Badge>
            </div>
            <CardTitle>بدء وردية جديدة</CardTitle>
            <CardDescription>{user?.name || "الموظف"} · {currentBranchName || "الفرع الحالي"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 space-y-2">
              <div className="flex items-center justify-between"><span className="flex items-center gap-2"><Store className="h-4 w-4" /> الفرع</span><strong>{currentBranchName}</strong></div>
              <div className="flex items-center justify-between"><span className="flex items-center gap-2"><MonitorSmartphone className="h-4 w-4" /> الجهاز</span><strong>{device.device_name}</strong></div>
              <div className="flex items-center justify-between border-t pt-2"><span>رصيد الدرج المتوقع</span><strong className="text-[#005931]">{money(expected)}</strong></div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="opening-cash">النقد المعدود فعليًا</Label>
              <div className="relative"><Input id="opening-cash" inputMode="decimal" value={openingCash} onChange={e => setOpeningCash(e.target.value)} className="h-12 pl-16 text-lg" /><span className="absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">ج.م</span></div>
              {Math.abs(variance) >= 0.01 && <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">فيه فرق {money(variance)} عن رصيد النظام. بدء الوردية هيتوقف لحد ما مدير الفرع يعمل تسوية واضحة.</div>}
            </div>
            <Button className="h-12 w-full bg-[#005931] hover:bg-[#004a29]" disabled={submitting} onClick={() => void startShift()}>
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} بدء الوردية وفتح الكاشير
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (closingSummary) {
    const diff = Number(closingSummary.cash_difference || 0);
    const held = suspendedCartCount();
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md border-0 shadow-xl">
          <CardHeader><CardTitle>تم إنهاء الوردية</CardTitle><CardDescription>{closingSummary.employee_name || user?.name} · {closingSummary.device_name || device.device_name}</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">بداية الوردية</div><strong>{money(closingSummary.opening_cash)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">المبيعات</div><strong>{money(closingSummary.sales_total)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">المتوقع</div><strong>{money(closingSummary.expected_cash)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">المعدود</div><strong>{money(closingSummary.closing_cash)}</strong></div>
            </div>
            <div className={`rounded-2xl p-4 text-center ${Math.abs(diff) < 0.01 ? "bg-green-50 text-green-800" : diff > 0 ? "bg-blue-50 text-blue-800" : "bg-red-50 text-red-800"}`}>
              <div className="text-xs">فرق الصندوق</div><div className="mt-1 text-2xl font-bold">{money(diff)}</div>
            </div>
            {held > 0 && <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>عندك {held} سلة معلقة. هتتحفظ باسمك والفرع الحالي ومش هتظهر للموظف التالي.</AlertDescription></Alert>}
            <Button className="h-12 w-full bg-[#005931] hover:bg-[#004a29]" onClick={() => void switchEmployeeNow()}><LogOut className="h-4 w-4" /> تبديل الموظف</Button>
            {!switchRequested && <Button variant="outline" className="h-11 w-full" onClick={() => void restartOwnShift()}><Play className="h-4 w-4" /> بدء وردية جديدة لنفسي</Button>}
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentExpected = Number(cashSummary?.drawer_balance || 0);
  const counted = Number(closingCash || 0);
  const previewDifference = Number.isFinite(counted) ? counted - currentExpected : 0;
  const heldCarts = suspendedCartCount();

  return (
    <>
      {children}
      <PosCashDrawerWidget device={device} />
      <div dir="rtl" className="fixed bottom-4 left-4 z-50 flex gap-2">
        <Button variant="outline" className="bg-white shadow-lg" onClick={() => void openCloseDialog(false)}><Clock3 className="h-4 w-4" /> الوردية</Button>
        <Button variant="outline" className="bg-white shadow-lg" onClick={() => void openCloseDialog(true)}><LogOut className="h-4 w-4" /> تبديل الموظف</Button>
      </div>

      <Dialog open={closingOpen} onOpenChange={open => !submitting && setClosingOpen(open)}>
        <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{switchRequested ? "إنهاء الوردية وتبديل الموظف" : "إنهاء الوردية"}</DialogTitle>
            <DialogDescription>بدأت {shift ? new Date(shift.opened_at).toLocaleString("ar-EG") : ""} · {device.device_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            {!cashSummary && <Button variant="outline" onClick={() => void openCloseDialog(switchRequested)}><RefreshCw className="h-4 w-4" /> إعادة تحميل ملخص الوردية</Button>}
            {cashSummary && <PosShiftPaymentSummary summary={cashSummary} />}
            {switchRequested && heldCarts > 0 && <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>فيه {heldCarts} سلة معلقة. بعد الإغلاق هتتحفظ لحساب {user?.name} فقط، والموظف الجديد هيبدأ بمساحة سلات منفصلة.</AlertDescription></Alert>}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">رصيد الدرج المتوقع</div><strong>{money(currentExpected)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">مبيعات نقدي بالوردية</div><strong>{money(cashSummary?.cash_sales)}</strong></div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="closing-cash">النقد المعدود فعليًا في الدرج</Label>
              <div className="relative"><Input id="closing-cash" inputMode="decimal" autoFocus value={closingCash} onChange={e => setClosingCash(e.target.value)} className="h-12 pl-16 text-lg" /><span className="absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">ج.م</span></div>
            </div>
            <div className={`rounded-xl p-3 text-sm ${Math.abs(previewDifference) < 0.01 ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-900"}`}>
              <div className="flex items-center justify-between"><span>الفرق قبل التأكيد</span><strong>{money(previewDifference)}</strong></div>
            </div>
            <div className="space-y-2"><Label htmlFor="closing-notes">ملاحظات — اختياري</Label><Textarea id="closing-notes" value={closingNotes} onChange={e => setClosingNotes(e.target.value)} placeholder="مثلاً: تم توريد جزء من النقد للخزنة" /></div>
            <Button className="h-12 w-full" variant="destructive" disabled={submitting || !cashSummary || closingCash.trim()===""} onClick={() => void finishShift()}>
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />} {switchRequested ? "إغلاق الوردية ثم التبديل" : "تأكيد إغلاق الوردية"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

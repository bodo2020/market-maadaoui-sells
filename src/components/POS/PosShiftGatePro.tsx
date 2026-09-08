import { ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { getLocalPosDevice } from "@/services/supabase/posDeviceService";
import {
  closePosShiftV2,
  getMyOpenPosShift,
  getMyPosShiftReconciliationPreview,
  openPosShift,
  type PosShift,
  type PosShiftReconciliationInput,
  type PosShiftReconciliationPreview,
} from "@/services/supabase/posShiftService";
import { getPosCashSummary, type PosCashSummary } from "@/services/supabase/posCashService";
import PosCashDrawerWidget from "@/components/POS/PosCashDrawerWidget";
import PosShiftReconciliationForm, { reconciliationVariance } from "@/components/POS/PosShiftReconciliationForm";
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
  const [closingNotes, setClosingNotes] = useState("");
  const [closingOpen, setClosingOpen] = useState(false);
  const [closingSummary, setClosingSummary] = useState<PosShift | null>(null);
  const [switchRequested, setSwitchRequested] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reconciliationPreview, setReconciliationPreview] = useState<PosShiftReconciliationPreview | null>(null);
  const [reconciliationValues, setReconciliationValues] = useState<Record<string, string>>({});
  const [reconciliationReasons, setReconciliationReasons] = useState<Record<string, string>>({});

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
    if (!device || !shift) return;
    setSwitchRequested(switchEmployee);
    setClosingNotes("");
    setError(null);
    setReconciliationPreview(null);
    setReconciliationValues({});
    setReconciliationReasons({});
    setClosingOpen(true);
    try {
      const [cash, preview] = await Promise.all([
        refreshCash(),
        getMyPosShiftReconciliationPreview(device),
      ]);
      if (!cash || preview.shift_id !== shift.id) throw new Error("بيانات الوردية تغيرت. أعد فتح شاشة الإغلاق.");
      setReconciliationPreview(preview);
    } catch (e: any) {
      setError(e.message || "تعذر تحميل تسوية وسائل الدفع. أعد المحاولة قبل الإغلاق.");
      setReconciliationPreview(null);
    }
  };

  const buildReconciliation = (): PosShiftReconciliationInput[] | null => {
    if (!reconciliationPreview) return null;
    const rows: PosShiftReconciliationInput[] = [];
    for (const method of reconciliationPreview.methods) {
      const raw = reconciliationValues[method.code] ?? "";
      if (!raw.trim() || !Number.isFinite(Number(raw)) || (method.method_type === "cash" && Number(raw) < 0)) {
        setError(`راجع المبلغ الفعلي لوسيلة ${method.name}.`);
        return null;
      }
      const counted = Math.round(Number(raw) * 100) / 100;
      const variance = reconciliationVariance(method.expected_amount, raw) ?? 0;
      const reason = (reconciliationReasons[method.code] || "").trim();
      if (Math.abs(variance) >= 0.01 && !reason) {
        setError(`فيه فرق في ${method.name}. اكتب سبب الفرق قبل إغلاق الوردية.`);
        return null;
      }
      rows.push({ code: method.code, counted_amount: counted, variance_reason: reason || null });
    }
    return rows;
  };

  const finishShift = async () => {
    if (!device || !shift || !cashSummary || !reconciliationPreview) return;
    setError(null);
    const rows = buildReconciliation();
    if (!rows) return;
    setSubmitting(true);
    try {
      const result = await closePosShiftV2(device, shift.id, rows, closingNotes);
      setClosingSummary(result);
      setShift(null);
      setClosingOpen(false);
      setReconciliationPreview(null);
      setReconciliationValues({});
      setReconciliationReasons({});
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
        <Card className="w-full max-w-xl border-0 shadow-xl">
          <CardHeader><CardTitle>تم إنهاء الوردية</CardTitle><CardDescription>{closingSummary.employee_name || user?.name} · {closingSummary.device_name || device.device_name}</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">بداية الوردية</div><strong>{money(closingSummary.opening_cash)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">المبيعات</div><strong>{money(closingSummary.sales_total)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">النقد المتوقع</div><strong>{money(closingSummary.expected_cash)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">النقد المعدود</div><strong>{money(closingSummary.closing_cash)}</strong></div>
            </div>
            <div className={`rounded-2xl p-4 text-center ${Math.abs(diff) < 0.01 ? "bg-green-50 text-green-800" : diff > 0 ? "bg-blue-50 text-blue-800" : "bg-red-50 text-red-800"}`}>
              <div className="text-xs">فرق الصندوق</div><div className="mt-1 text-2xl font-bold">{money(diff)}</div>
            </div>
            {!!closingSummary.payment_reconciliations?.length && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold">تسوية وسائل الدفع المحفوظة</h3>
                {closingSummary.payment_reconciliations.map((row) => (
                  <div key={row.code} className="grid grid-cols-3 gap-2 rounded-xl border p-3 text-xs">
                    <div><span className="block text-slate-500">{row.name}</span><strong>{money(row.expected_amount)}</strong></div>
                    <div><span className="block text-slate-500">المؤكد</span><strong>{money(row.counted_amount)}</strong></div>
                    <div><span className="block text-slate-500">الفرق</span><strong className={Math.abs(row.variance_amount) >= 0.01 ? "text-amber-700" : "text-emerald-700"}>{money(row.variance_amount)}</strong></div>
                    {row.variance_reason && <div className="col-span-3 rounded-lg bg-amber-50 px-2 py-1 text-amber-900">السبب: {row.variance_reason}</div>}
                  </div>
                ))}
              </div>
            )}
            {held > 0 && <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>عندك {held} سلة معلقة. هتتحفظ باسمك والفرع الحالي ومش هتظهر للموظف التالي.</AlertDescription></Alert>}
            <Button className="h-12 w-full bg-[#005931] hover:bg-[#004a29]" onClick={() => void switchEmployeeNow()}><LogOut className="h-4 w-4" /> تبديل الموظف</Button>
            {!switchRequested && <Button variant="outline" className="h-11 w-full" onClick={() => void restartOwnShift()}><Play className="h-4 w-4" /> بدء وردية جديدة لنفسي</Button>}
          </CardContent>
        </Card>
      </div>
    );
  }

  const heldCarts = suspendedCartCount();
  const reconciliationReady = Boolean(reconciliationPreview) && reconciliationPreview!.methods.every((method) => {
    const raw = reconciliationValues[method.code] ?? "";
    if (!raw.trim() || !Number.isFinite(Number(raw)) || (method.method_type === "cash" && Number(raw) < 0)) return false;
    const variance = reconciliationVariance(method.expected_amount, raw) ?? 0;
    return Math.abs(variance) < 0.01 || Boolean((reconciliationReasons[method.code] || "").trim());
  });

  return (
    <>
      {children}
      <PosCashDrawerWidget device={device} />
      <div dir="rtl" className="fixed bottom-4 left-4 z-50 flex gap-2">
        <Button variant="outline" className="bg-white shadow-lg" onClick={() => void openCloseDialog(false)}><Clock3 className="h-4 w-4" /> الوردية</Button>
        <Button variant="outline" className="bg-white shadow-lg" onClick={() => void openCloseDialog(true)}><LogOut className="h-4 w-4" /> تبديل الموظف</Button>
      </div>

      <Dialog open={closingOpen} onOpenChange={open => !submitting && setClosingOpen(open)}>
        <DialogContent dir="rtl" className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{switchRequested ? "تسليم الوردية وتبديل الموظف" : "تسليم وإغلاق الوردية"}</DialogTitle>
            <DialogDescription>بدأت {shift ? new Date(shift.opened_at).toLocaleString("ar-EG") : ""} · {device.device_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            {!reconciliationPreview && <Button variant="outline" onClick={() => void openCloseDialog(switchRequested)}><RefreshCw className="h-4 w-4" /> إعادة تحميل عهدة الوردية</Button>}
            {switchRequested && heldCarts > 0 && <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>فيه {heldCarts} سلة معلقة. بعد الإغلاق هتتحفظ لحساب {user?.name} فقط، والموظف الجديد هيبدأ بمساحة سلات منفصلة.</AlertDescription></Alert>}
            {cashSummary && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">فواتير الوردية</div><strong>{cashSummary.sales_count}</strong></div>
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">إجمالي المبيعات</div><strong>{money(cashSummary.sales_total)}</strong></div>
              </div>
            )}
            {reconciliationPreview && (
              <PosShiftReconciliationForm
                preview={reconciliationPreview}
                values={reconciliationValues}
                reasons={reconciliationReasons}
                onValueChange={(code, value) => setReconciliationValues((current) => ({ ...current, [code]: value }))}
                onReasonChange={(code, value) => setReconciliationReasons((current) => ({ ...current, [code]: value }))}
              />
            )}
            <div className="space-y-2"><Label htmlFor="closing-notes">ملاحظات عامة على التسليم — اختياري</Label><Textarea id="closing-notes" value={closingNotes} onChange={e => setClosingNotes(e.target.value)} placeholder="مثلاً: تم مراجعة إيصالات البطاقات وتحويلات المحافظ" /></div>
            <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">عند التأكيد يتم حفظ Snapshot ثابت باسم وقيمة كل وسيلة دفع كما كانت وقت الإغلاق. أي تعديل لاحق في إعدادات الوسائل لن يغيّر تسوية الوردية القديمة.</div>
            <Button className="h-12 w-full" variant="destructive" disabled={submitting || !reconciliationReady} onClick={() => void finishShift()}>
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />} {switchRequested ? "تأكيد التسليم ثم تبديل الموظف" : "تأكيد التسوية وإغلاق الوردية"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

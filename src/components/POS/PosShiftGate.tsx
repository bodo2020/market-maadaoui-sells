import { ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { getLocalPosDevice } from "@/services/supabase/posDeviceService";
import { closePosShift, getMyOpenPosShift, openPosShift, PosShift } from "@/services/supabase/posShiftService";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Banknote, Clock3, LogOut, MonitorSmartphone, Play, RefreshCw, Store, WalletCards } from "lucide-react";

function money(value: number | null | undefined) {
  return `${Number(value || 0).toFixed(2)} ج.م`;
}

export default function PosShiftGate({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const navigate = useNavigate();
  const [shift, setShift] = useState<PosShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingCash, setOpeningCash] = useState("0");
  const [closingCash, setClosingCash] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const [closingOpen, setClosingOpen] = useState(false);
  const [closingSummary, setClosingSummary] = useState<PosShift | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const device = useMemo(
    () => currentBranchId ? getLocalPosDevice(currentBranchId) : null,
    [currentBranchId],
  );

  const loadShift = async () => {
    if (!device) {
      setShift(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setShift(await getMyOpenPosShift(device));
    } catch (e: any) {
      setError(e.message || "تعذر قراءة الوردية الحالية");
      setShift(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadShift();
  }, [device?.device_id, user?.id]);

  const startShift = async () => {
    if (!device) return;
    const amount = Number(openingCash);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("اكتب الرصيد الموجود فعليًا في درج الكاشير قبل بداية الشغل.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const opened = await openPosShift(device, amount);
      setShift(opened);
      setOpeningCash(String(opened.opening_cash ?? 0));
    } catch (e: any) {
      setError(e.message || "تعذر بدء الوردية");
    } finally {
      setSubmitting(false);
    }
  };

  const finishShift = async () => {
    if (!device || !shift) return;
    const amount = Number(closingCash);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("اكتب النقد الفعلي الموجود في درج الكاشير عند الإغلاق.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await closePosShift(device, shift.id, amount, closingNotes);
      setClosingSummary(result);
      setShift(null);
    } catch (e: any) {
      setError(e.message || "تعذر إنهاء الوردية");
    } finally {
      setSubmitting(false);
    }
  };

  const switchEmployee = async () => {
    setClosingOpen(false);
    await logout();
  };

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex items-center gap-2 text-slate-500"><RefreshCw className="h-5 w-5 animate-spin" /> جاري تجهيز وردية الكاشير</div>
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
            <Button className="w-full" onClick={() => navigate("/settings")}>الذهاب لإعدادات أجهزة POS</Button>
            <Button variant="ghost" className="w-full" onClick={() => navigate("/dashboard")}>الذهاب للوحة التحكم</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!shift && !closingSummary) {
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="opening-cash">الرصيد الافتتاحي في درج الكاشير</Label>
              <div className="relative">
                <Input id="opening-cash" inputMode="decimal" value={openingCash} onChange={e => setOpeningCash(e.target.value)} className="h-12 pl-16 text-lg" />
                <span className="absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">ج.م</span>
              </div>
              <p className="text-xs leading-5 text-slate-500">اكتب النقد الموجود فعلًا في الدرج قبل أول فاتورة. لو الدرج فاضي اكتب 0.</p>
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
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md border-0 shadow-xl">
          <CardHeader><CardTitle>تم إنهاء الوردية</CardTitle><CardDescription>{closingSummary.employee_name || user?.name} · {closingSummary.device_name || device.device_name}</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">الرصيد الافتتاحي</div><strong>{money(closingSummary.opening_cash)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">مبيعات الوردية</div><strong>{money(closingSummary.sales_total)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">النقد المتوقع</div><strong>{money(closingSummary.expected_cash)}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-500">النقد الفعلي</div><strong>{money(closingSummary.closing_cash)}</strong></div>
            </div>
            <div className={`rounded-2xl p-4 text-center ${diff === 0 ? "bg-green-50 text-green-800" : diff > 0 ? "bg-blue-50 text-blue-800" : "bg-red-50 text-red-800"}`}>
              <div className="text-xs">فرق الصندوق</div><div className="mt-1 text-2xl font-bold">{money(diff)}</div>
            </div>
            <Button className="h-12 w-full" onClick={() => void switchEmployee()}><LogOut className="h-4 w-4" /> إنهاء وتبديل الموظف</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      {children}
      <div dir="rtl" className="fixed bottom-4 left-4 z-50">
        <Button variant="outline" className="shadow-lg bg-white" onClick={() => { setClosingCash(""); setClosingNotes(""); setError(null); setClosingOpen(true); }}>
          <Clock3 className="h-4 w-4" /> الوردية مفتوحة
        </Button>
      </div>
      <Dialog open={closingOpen} onOpenChange={setClosingOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إنهاء الوردية</DialogTitle>
            <DialogDescription>بدأت {shift ? new Date(shift.opened_at).toLocaleString("ar-EG") : ""} · رصيد افتتاحي {money(shift?.opening_cash)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="space-y-2">
              <Label htmlFor="closing-cash">النقد الفعلي الموجود في الدرج الآن</Label>
              <div className="relative">
                <Input id="closing-cash" inputMode="decimal" value={closingCash} onChange={e => setClosingCash(e.target.value)} className="h-12 pl-16" placeholder="0.00" />
                <span className="absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">ج.م</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="closing-notes">ملاحظات الإغلاق — اختياري</Label>
              <Textarea id="closing-notes" value={closingNotes} onChange={e => setClosingNotes(e.target.value)} placeholder="مثلاً: تم تسليم النقد للمدير" />
            </div>
            <div className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">النظام هيقارن النقد الفعلي بالنقد المتوقع من الرصيد الافتتاحي وكل حركات صندوق المتجر اللي عملها الموظف أثناء الوردية.</div>
            <Button className="h-12 w-full" variant="destructive" disabled={submitting || closingCash.trim()===""} onClick={() => void finishShift()}>
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />} تأكيد وإنهاء الوردية
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

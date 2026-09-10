import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banknote, RefreshCw, ShieldAlert, WifiOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { getLocalPosDevice } from "@/services/supabase/posDeviceService";
import { getPosRuntimeStatus } from "@/services/supabase/posRuntimeService";
import { Button } from "@/components/ui/button";

const DEFAULT_AUTO_LOCK_MINUTES = 10;
const HEALTH_CHECK_MS = 20 * 1000;

export default function PosRuntimeGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { currentBranchId } = useBranchStore();
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [runtimeIssue, setRuntimeIssue] = useState<string | null>(null);
  const [checkingRuntime, setCheckingRuntime] = useState(false);
  const [autoLockMinutes, setAutoLockMinutes] = useState(DEFAULT_AUTO_LOCK_MINUTES);
  const [cashWarningThreshold, setCashWarningThreshold] = useState<number | null>(null);
  const [drawerBalance, setDrawerBalance] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const device = useMemo(() => currentBranchId ? getLocalPosDevice(currentBranchId) : null, [currentBranchId]);

  const armTimer = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const safeMinutes = Math.min(120, Math.max(1, Number(autoLockMinutes || DEFAULT_AUTO_LOCK_MINUTES)));
    timerRef.current = window.setTimeout(() => { window.dispatchEvent(new CustomEvent("app:lock")); }, safeMinutes * 60 * 1000);
  }, [autoLockMinutes]);

  const applyRuntimeSettings = (status: Awaited<ReturnType<typeof getPosRuntimeStatus>>) => {
    if (status.auto_lock_minutes != null) setAutoLockMinutes(Number(status.auto_lock_minutes));
    setCashWarningThreshold(status.cash_warning_threshold == null ? null : Number(status.cash_warning_threshold));
    setDrawerBalance(status.drawer_balance == null ? null : Number(status.drawer_balance));
  };

  const checkRuntime = useCallback(async () => {
    if (!device || !user?.id || !online) return;
    setCheckingRuntime(true);
    try {
      const status = await getPosRuntimeStatus(device);
      applyRuntimeSettings(status);
      if (!status.ready) { setRuntimeIssue(status.code === "SHIFT_NOT_OPEN" ? "الوردية الحالية اتقفلت أو لم تعد متاحة. حدّث الصفحة لبدء وردية جديدة قبل أي بيع." : "نقطة البيع غير جاهزة حاليًا."); return; }
      setRuntimeIssue(null);
    } catch (e: any) { setRuntimeIssue(e?.message || "تعذر التحقق من حالة الجهاز والوردية."); }
    finally { setCheckingRuntime(false); }
  }, [device?.device_id, device?.device_token, user?.id, online]);

  useEffect(() => {
    const goOnline = () => { setOnline(true); setRuntimeIssue(null); };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline); window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, []);

  useEffect(() => {
    const activity = () => armTimer();
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
    events.forEach(event => window.addEventListener(event, activity, { passive: true }));
    armTimer();
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); events.forEach(event => window.removeEventListener(event, activity)); };
  }, [user?.id, currentBranchId, armTimer]);

  useEffect(() => {
    if (!device || !user?.id || !online) return;
    void checkRuntime();
    const timer = window.setInterval(() => void checkRuntime(), HEALTH_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [device?.device_id, user?.id, online, checkRuntime]);

  useEffect(() => { armTimer(); }, [autoLockMinutes, armTimer]);

  const cashWarningActive = online && !runtimeIssue && cashWarningThreshold != null && cashWarningThreshold > 0 && drawerBalance != null && drawerBalance >= cashWarningThreshold;

  return (
    <>
      {!online && <div dir="rtl" className="fixed inset-x-2 top-2 z-[90] mx-auto max-w-xl rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-xl"><div className="flex items-center gap-2 font-semibold"><WifiOff className="h-4 w-4" /> الاتصال بالإنترنت مقطوع</div><div className="mt-1 text-xs leading-5">السلات الموجودة محفوظة على الجهاز. لا تعيد تسجيل البيع يدويًا؛ بعد رجوع الاتصال استخدم نفس السلة والمحاولة عشان حماية منع تكرار الفاتورة تفضل شغالة.</div></div>}
      {cashWarningActive && <div dir="rtl" className="fixed inset-x-2 top-2 z-[85] mx-auto max-w-xl rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg"><div className="flex items-center gap-2 font-semibold"><Banknote className="h-4 w-4" /> رصيد درج الكاشير مرتفع</div><div className="mt-1 text-xs">الرصيد الحالي {Number(drawerBalance).toFixed(2)} ج.م. يفضل توريد جزء للخزنة طبقًا لسياسة الفرع.</div></div>}

      {children}

      {checkingRuntime && !runtimeIssue && <div className="pointer-events-none fixed left-3 top-32 z-[60] rounded-full bg-white/90 p-2 text-slate-400 shadow-sm"><RefreshCw className="h-3.5 w-3.5 animate-spin" /></div>}

      {runtimeIssue && <div dir="rtl" className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md"><div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600"><ShieldAlert className="h-7 w-7" /></div><h2 className="mt-4 text-xl font-black">تم إيقاف البيع مؤقتًا</h2><p className="mt-2 text-sm leading-6 text-slate-600">{runtimeIssue}</p><Button className="mt-5 h-12 w-full bg-[#005931] hover:bg-[#004a29]" onClick={() => window.location.reload()}><RefreshCw className="h-4 w-4" /> تحديث حالة الكاشير</Button></div></div>}


    </>
  );
}

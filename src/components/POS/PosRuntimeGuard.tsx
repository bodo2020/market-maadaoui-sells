import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Backspace, LockKeyhole, RefreshCw, ShieldAlert, WifiOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { createPosQuickSession, getLocalPosDevice } from "@/services/supabase/posDeviceService";
import { getPosRuntimeStatus } from "@/services/supabase/posRuntimeService";
import { Button } from "@/components/ui/button";

const AUTO_LOCK_MS = 10 * 60 * 1000;
const HEALTH_CHECK_MS = 20 * 1000;

function PinKeypad({ onDigit, onClear, onBackspace, disabled }: {
  onDigit: (digit: string) => void;
  onClear: () => void;
  onBackspace: () => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2" dir="ltr">
      {["1","2","3","4","5","6","7","8","9"].map(digit => (
        <Button key={digit} type="button" variant="outline" className="h-14 text-lg" disabled={disabled} onClick={() => onDigit(digit)}>{digit}</Button>
      ))}
      <Button type="button" variant="ghost" className="h-14" disabled={disabled} onClick={onClear}>مسح</Button>
      <Button type="button" variant="outline" className="h-14 text-lg" disabled={disabled} onClick={() => onDigit("0")}>0</Button>
      <Button type="button" variant="ghost" className="h-14" disabled={disabled} onClick={onBackspace}><Backspace className="h-5 w-5" /></Button>
    </div>
  );
}

export default function PosRuntimeGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { currentBranchId } = useBranchStore();
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runtimeIssue, setRuntimeIssue] = useState<string | null>(null);
  const [checkingRuntime, setCheckingRuntime] = useState(false);
  const timerRef = useRef<number | null>(null);

  const device = useMemo(
    () => currentBranchId ? getLocalPosDevice(currentBranchId) : null,
    [currentBranchId],
  );

  const armTimer = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setPin("");
      setError(null);
      setLocked(true);
    }, AUTO_LOCK_MS);
  }, []);

  const checkRuntime = useCallback(async () => {
    if (!device || !user?.id || !online || locked) return;
    setCheckingRuntime(true);
    try {
      const status = await getPosRuntimeStatus(device);
      if (!status.ready) {
        setRuntimeIssue(status.code === "SHIFT_NOT_OPEN"
          ? "الوردية الحالية اتقفلت أو لم تعد متاحة. حدّث الصفحة لبدء وردية جديدة قبل أي بيع."
          : "نقطة البيع غير جاهزة حاليًا.");
        return;
      }
      setRuntimeIssue(null);
    } catch (e: any) {
      setRuntimeIssue(e?.message || "تعذر التحقق من حالة الجهاز والوردية.");
    } finally {
      setCheckingRuntime(false);
    }
  }, [device?.device_id, device?.device_token, user?.id, online, locked]);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      setRuntimeIssue(null);
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    const activity = () => {
      if (!locked) armTimer();
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
    events.forEach(event => window.addEventListener(event, activity, { passive: true }));
    armTimer();
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      events.forEach(event => window.removeEventListener(event, activity));
    };
  }, [locked, user?.id, currentBranchId, armTimer]);

  useEffect(() => {
    if (!device || !user?.id || !online || locked) return;
    void checkRuntime();
    const timer = window.setInterval(() => void checkRuntime(), HEALTH_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [device?.device_id, user?.id, online, locked, checkRuntime]);

  const addDigit = (digit: string) => {
    setError(null);
    setPin(value => value.length >= 6 ? value : value + digit);
  };

  const lockNow = () => {
    setPin("");
    setError(null);
    setLocked(true);
  };

  const unlock = async () => {
    if (!device || !user?.id || pin.length < 4 || !online || unlocking) return;
    setUnlocking(true);
    setError(null);
    try {
      await createPosQuickSession(device, user.id, pin);
      const status = await getPosRuntimeStatus(device);
      if (!status.ready) {
        setRuntimeIssue("الوردية لم تعد مفتوحة. حدّث الصفحة قبل استكمال البيع.");
        return;
      }
      setRuntimeIssue(null);
      setPin("");
      setLocked(false);
      armTimer();
    } catch (e: any) {
      setPin("");
      setError(e?.message || "PIN غير صحيح");
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <>
      {!online && (
        <div dir="rtl" className="fixed inset-x-2 top-2 z-[90] mx-auto max-w-xl rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-xl">
          <div className="flex items-center gap-2 font-semibold"><WifiOff className="h-4 w-4" /> الاتصال بالإنترنت مقطوع</div>
          <div className="mt-1 text-xs leading-5">السلات الموجودة محفوظة على الجهاز. لا تعيد تسجيل البيع يدويًا؛ بعد رجوع الاتصال استخدم نفس السلة والمحاولة عشان حماية منع تكرار الفاتورة تفضل شغالة.</div>
        </div>
      )}

      {children}

      {!locked && !runtimeIssue && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="fixed left-3 top-20 z-[70] bg-white/95 shadow-md backdrop-blur"
          onClick={lockNow}
          title="قفل شاشة الكاشير بدون إنهاء الوردية"
        >
          <LockKeyhole className="h-4 w-4" /> قفل
        </Button>
      )}

      {checkingRuntime && !locked && !runtimeIssue && (
        <div className="pointer-events-none fixed left-3 top-32 z-[60] rounded-full bg-white/90 p-2 text-slate-400 shadow-sm"><RefreshCw className="h-3.5 w-3.5 animate-spin" /></div>
      )}

      {runtimeIssue && (
        <div dir="rtl" className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600"><ShieldAlert className="h-7 w-7" /></div>
            <h2 className="mt-4 text-xl font-black">تم إيقاف البيع مؤقتًا</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{runtimeIssue}</p>
            <Button className="mt-5 h-12 w-full bg-[#005931] hover:bg-[#004a29]" onClick={() => window.location.reload()}><RefreshCw className="h-4 w-4" /> تحديث حالة الكاشير</Button>
          </div>
        </div>
      )}

      {locked && !runtimeIssue && (
        <div dir="rtl" className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-[#005931]"><LockKeyhole className="h-7 w-7" /></div>
              <h2 className="mt-3 text-xl font-black">الكاشير مقفول</h2>
              <p className="mt-1 text-sm text-slate-500">{user?.name || "الموظف الحالي"} · الوردية والسلات ما زالت مفتوحة</p>
            </div>

            {!online && (
              <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> لازم الاتصال يرجع قبل التحقق من PIN.</div>
            )}
            {error && <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            <div className="my-5 flex justify-center gap-2" dir="ltr">
              {Array.from({ length: 6 }).map((_, index) => <span key={index} className={`h-3 w-3 rounded-full ${index < pin.length ? "bg-[#005931]" : "bg-slate-200"}`} />)}
            </div>

            <PinKeypad
              disabled={unlocking}
              onDigit={addDigit}
              onClear={() => { setPin(""); setError(null); }}
              onBackspace={() => setPin(value => value.slice(0,-1))}
            />

            <Button className="mt-4 h-12 w-full bg-[#005931] hover:bg-[#004a29]" disabled={!online || unlocking || pin.length < 4} onClick={() => void unlock()}>
              {unlocking ? <RefreshCw className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />} فتح بالـPIN
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

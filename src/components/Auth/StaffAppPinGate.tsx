import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { KeyRound, Loader2, LockKeyhole, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import {
  getMyStaffAppPinStatus,
  recoverMyStaffAppPin,
  setMyStaffAppPin,
  verifyMyStaffAppPin,
} from "@/services/staffAppPinService";
import { reauthenticateCurrentStaff } from "@/services/supabase/staffAuthService";

const pinPattern = /^\d{4,6}$/;

type SetupStage = "new" | "confirm";
type RecoveryStage = "credentials" | "new" | "confirm";

function PinDots({ length }: { length: number }) {
  return (
    <div className="my-5 flex justify-center gap-2" dir="ltr">
      {Array.from({ length: 6 }).map((_, index) => (
        <span key={index} className={`h-3 w-3 rounded-full transition ${index < length ? "bg-[#005931]" : "bg-slate-200"}`} />
      ))}
    </div>
  );
}

function PinKeypad({
  disabled,
  onDigit,
  onClear,
  onBackspace,
}: {
  disabled: boolean;
  onDigit: (digit: string) => void;
  onClear: () => void;
  onBackspace: () => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2" dir="ltr">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(digit => (
        <Button key={digit} type="button" variant="outline" className="h-14 text-lg font-bold" disabled={disabled} onClick={() => onDigit(digit)}>{digit}</Button>
      ))}
      <Button type="button" variant="ghost" className="h-14" disabled={disabled} onClick={onClear}>مسح</Button>
      <Button type="button" variant="outline" className="h-14 text-lg font-bold" disabled={disabled} onClick={() => onDigit("0")}>0</Button>
      <Button type="button" variant="ghost" className="h-14 text-xl" disabled={disabled} onClick={onBackspace}>⌫</Button>
    </div>
  );
}

export default function StaffAppPinGate({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [setupStage, setSetupStage] = useState<SetupStage>("new");
  const [firstPin, setFirstPin] = useState("");
  const [recoveryStage, setRecoveryStage] = useState<RecoveryStage | null>(null);
  const [recoveryUsername, setRecoveryUsername] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryFirstPin, setRecoveryFirstPin] = useState("");

  const unlockKey = useMemo(() => user?.id ? `staff-app-pin-unlocked:${user.id}` : "", [user?.id]);
  const lockKey = useMemo(() => user?.id ? `staff-app-pin-locked:${user.id}` : "", [user?.id]);
  const [unlocked, setUnlocked] = useState(false);

  const markUnlocked = useCallback(() => {
    if (unlockKey) sessionStorage.setItem(unlockKey, "1");
    if (lockKey) sessionStorage.removeItem(lockKey);
    setUnlocked(true);
    setPin("");
    setMessage(null);
    setRecoveryStage(null);
    setRecoveryPassword("");
    setRecoveryFirstPin("");
  }, [unlockKey, lockKey]);

  const markLocked = useCallback(() => {
    if (!user?.id) return;
    if (unlockKey) sessionStorage.removeItem(unlockKey);
    if (lockKey) sessionStorage.setItem(lockKey, "1");
    setUnlocked(false);
    setPin("");
    setMessage(null);
    setRecoveryStage(null);
    setRecoveryPassword("");
  }, [user?.id, unlockKey, lockKey]);

  useEffect(() => {
    if (!user?.id) {
      setUnlocked(false);
      return;
    }
    const explicitlyLocked = sessionStorage.getItem(lockKey) === "1";
    setUnlocked(!explicitlyLocked && sessionStorage.getItem(unlockKey) === "1");
    setRecoveryUsername(user.username || "");
  }, [user?.id, user?.username, unlockKey, lockKey]);

  useEffect(() => {
    const lock = () => markLocked();
    window.addEventListener("app:lock", lock);
    // Backward compatibility for any old POS button/event still mounted during rollout.
    window.addEventListener("pos:lock", lock);
    return () => {
      window.removeEventListener("app:lock", lock);
      window.removeEventListener("pos:lock", lock);
    };
  }, [markLocked]);

  useEffect(() => {
    const enforceStoredState = () => {
      if (!user?.id) return;
      if (sessionStorage.getItem(lockKey) === "1" || sessionStorage.getItem(unlockKey) !== "1") {
        setUnlocked(false);
      }
    };
    const onVisibility = () => { if (document.visibilityState === "visible") enforceStoredState(); };
    window.addEventListener("popstate", enforceStoredState);
    window.addEventListener("pageshow", enforceStoredState);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("popstate", enforceStoredState);
      window.removeEventListener("pageshow", enforceStoredState);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user?.id, unlockKey, lockKey]);

  const statusQuery = useQuery({
    queryKey: ["staff-app-pin-status-v2", user?.id],
    enabled: Boolean(user?.id),
    queryFn: getMyStaffAppPinStatus,
    staleTime: 15_000,
    retry: false,
  });

  const setupMutation = useMutation({
    mutationFn: (newPin: string) => setMyStaffAppPin(newPin),
    onSuccess: async () => {
      markUnlocked();
      setFirstPin("");
      setSetupStage("new");
      await statusQuery.refetch();
    },
    onError: error => {
      setMessage(error instanceof Error ? error.message : "تعذر إنشاء PIN.");
      setPin("");
      setFirstPin("");
      setSetupStage("new");
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      if (!pinPattern.test(pin)) throw new Error("أدخل PIN من 4 إلى 6 أرقام.");
      const result = await verifyMyStaffAppPin(pin);
      if (!result.ok) {
        if (result.error === "APP_PIN_LOCKED") throw new Error("تم قفل PIN لمدة 10 دقائق بسبب المحاولات الخاطئة.");
        if (result.error === "APP_PIN_NOT_CONFIGURED") throw new Error("PIN غير مُنشأ لهذا الحساب بعد.");
        const remaining = Number(result.remaining_attempts ?? 0);
        throw new Error(remaining > 0 ? `PIN غير صحيح. متبقي ${remaining.toLocaleString("ar-EG")} محاولات.` : "PIN غير صحيح.");
      }
      return result;
    },
    onSuccess: markUnlocked,
    onError: async error => {
      setMessage(error instanceof Error ? error.message : "تعذر فتح التطبيق.");
      setPin("");
      await statusQuery.refetch();
    },
  });

  const credentialsMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !user.username) throw new Error("بيانات الحساب غير مكتملة.");
      if (recoveryUsername.trim() !== user.username.trim()) throw new Error("استخدم اسم المستخدم الخاص بالحساب المفتوح حاليًا.");
      if (!recoveryPassword) throw new Error("اكتب كلمة المرور.");
      return reauthenticateCurrentStaff(recoveryUsername, recoveryPassword, user.id);
    },
    onSuccess: () => {
      setRecoveryPassword("");
      setRecoveryStage("new");
      setPin("");
      setMessage(null);
    },
    onError: error => setMessage(error instanceof Error ? error.message : "تعذر تأكيد الحساب."),
  });

  const recoveryMutation = useMutation({
    mutationFn: (newPin: string) => recoverMyStaffAppPin(newPin),
    onSuccess: async () => {
      markUnlocked();
      await statusQuery.refetch();
    },
    onError: error => {
      setMessage(error instanceof Error ? error.message : "تعذر إنشاء PIN جديد.");
      setPin("");
      setRecoveryFirstPin("");
      setRecoveryStage("credentials");
    },
  });

  const busy = setupMutation.isPending || verifyMutation.isPending || credentialsMutation.isPending || recoveryMutation.isPending;
  const addDigit = (digit: string) => {
    if (busy) return;
    setMessage(null);
    setPin(value => value.length >= 6 ? value : value + digit);
  };

  const submitSetup = () => {
    if (!pinPattern.test(pin) || busy) return;
    if (setupStage === "new") {
      setFirstPin(pin);
      setPin("");
      setSetupStage("confirm");
      return;
    }
    if (pin !== firstPin) {
      setMessage("تأكيد PIN غير مطابق. ابدأ من جديد.");
      setPin("");
      setFirstPin("");
      setSetupStage("new");
      return;
    }
    setupMutation.mutate(firstPin);
  };

  const submitRecoveryPin = () => {
    if (!pinPattern.test(pin) || busy || !recoveryStage || recoveryStage === "credentials") return;
    if (recoveryStage === "new") {
      setRecoveryFirstPin(pin);
      setPin("");
      setRecoveryStage("confirm");
      return;
    }
    if (pin !== recoveryFirstPin) {
      setMessage("تأكيد PIN الجديد غير مطابق. ابدأ إدخال الرمز من جديد.");
      setRecoveryFirstPin("");
      setPin("");
      setRecoveryStage("new");
      return;
    }
    recoveryMutation.mutate(recoveryFirstPin);
  };

  const safeLogout = async () => {
    if (unlockKey) sessionStorage.removeItem(unlockKey);
    if (lockKey) sessionStorage.removeItem(lockKey);
    await logout();
  };

  if (!user) return null;
  if (unlocked) return <>{children}</>;

  if (statusQuery.isLoading) {
    return <div dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-9 w-9 animate-spin text-[#005931]" /></div>;
  }

  if (statusQuery.isError) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md"><CardHeader><CardTitle>تعذر التحقق من أمان الحساب</CardTitle><CardDescription>لن يتم فتح التطبيق بدون التحقق من حالة PIN.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{statusQuery.error instanceof Error ? statusQuery.error.message : "حدث خطأ غير متوقع."}</div><Button className="w-full" onClick={() => statusQuery.refetch()}>إعادة المحاولة</Button><Button variant="outline" className="w-full" onClick={() => void safeLogout()}><LogOut className="ml-2 h-4 w-4" />تسجيل الخروج</Button></CardContent></Card>
      </div>
    );
  }

  const configured = Boolean(statusQuery.data?.configured);
  const locked = Boolean(statusQuery.data?.locked);
  const enteringRecoveryPin = recoveryStage === "new" || recoveryStage === "confirm";
  const title = recoveryStage
    ? recoveryStage === "credentials" ? "استرجاع رمز القفل" : recoveryStage === "new" ? "رمز جديد" : "تأكيد الرمز الجديد"
    : configured ? "التطبيق مقفول" : setupStage === "new" ? "إنشاء رمز القفل" : "تأكيد رمز القفل";
  const subtitle = recoveryStage
    ? recoveryStage === "credentials" ? "أكد حسابك باسم المستخدم وكلمة المرور، وبعدها اختار PIN جديد." : "استخدم نفس لوحة الأرقام لاختيار رمز من 4 إلى 6 أرقام."
    : configured ? `${user.name} · أدخل PIN الخاص بك للمتابعة` : "PIN واحد موحّد للتطبيق ونقطة البيع.";

  return (
    <div dir="rtl" className="fixed inset-0 z-[500] flex min-h-screen items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-md">
      <Card className="w-full max-w-sm overflow-hidden rounded-3xl border-0 shadow-2xl">
        <div className="h-1.5 bg-[#005931]" />
        <CardHeader className="pb-3 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-[#005931]">{recoveryStage === "credentials" ? <UserRound className="h-7 w-7" /> : configured || recoveryStage ? <LockKeyhole className="h-7 w-7" /> : <KeyRound className="h-7 w-7" />}</div>
          <CardTitle className="mt-3 text-xl font-black">{title}</CardTitle>
          <CardDescription className="leading-6">{subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {locked && !recoveryStage && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">تم إيقاف المحاولة بالـPIN مؤقتًا بعد محاولات خاطئة. تقدر تستخدم اسم المستخدم وكلمة المرور لاسترجاع الرمز الآن.</div>}
          {message && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}</div>}

          {recoveryStage === "credentials" ? (
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>اسم المستخدم</Label><Input autoFocus autoComplete="username" value={recoveryUsername} onChange={event => { setRecoveryUsername(event.target.value); setMessage(null); }} /></div>
              <div className="space-y-1.5"><Label>كلمة المرور</Label><Input type="password" autoComplete="current-password" value={recoveryPassword} onChange={event => { setRecoveryPassword(event.target.value); setMessage(null); }} onKeyDown={event => { if (event.key === "Enter" && !busy) credentialsMutation.mutate(); }} /></div>
              <Button className="h-12 w-full bg-[#005931] hover:bg-[#004426]" disabled={busy || !recoveryUsername.trim() || !recoveryPassword} onClick={() => credentialsMutation.mutate()}>{credentialsMutation.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="ml-2 h-4 w-4" />}تأكيد الحساب</Button>
              <Button variant="ghost" className="w-full" disabled={busy} onClick={() => { setRecoveryStage(null); setRecoveryPassword(""); setMessage(null); }}>الرجوع لإدخال PIN</Button>
            </div>
          ) : (
            <>
              <PinDots length={pin.length} />
              <PinKeypad disabled={busy || (locked && !enteringRecoveryPin)} onDigit={addDigit} onClear={() => { setPin(""); setMessage(null); }} onBackspace={() => setPin(value => value.slice(0, -1))} />
              <Button
                className="h-12 w-full bg-[#005931] hover:bg-[#004426]"
                disabled={busy || (locked && !enteringRecoveryPin) || !pinPattern.test(pin)}
                onClick={() => recoveryStage ? submitRecoveryPin() : configured ? verifyMutation.mutate() : submitSetup()}
              >
                {busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <LockKeyhole className="ml-2 h-4 w-4" />}
                {recoveryStage === "new" ? "التالي" : recoveryStage === "confirm" ? "حفظ الرمز وفتح التطبيق" : configured ? "فتح التطبيق" : setupStage === "new" ? "التالي" : "حفظ الرمز وفتح التطبيق"}
              </Button>
              {configured && !recoveryStage && <Button variant="outline" className="w-full" disabled={busy} onClick={() => { setRecoveryStage("credentials"); setRecoveryUsername(user.username || ""); setPin(""); setMessage(null); }}>نسيت PIN؟ استخدم اليوزر والباسورد</Button>}
              {recoveryStage && <Button variant="ghost" className="w-full" disabled={busy} onClick={() => { setRecoveryStage("credentials"); setRecoveryFirstPin(""); setPin(""); setMessage(null); }}>الرجوع لتأكيد الحساب</Button>}
            </>
          )}

          <Button variant="ghost" className="w-full text-slate-500" disabled={busy} onClick={() => void safeLogout()}><LogOut className="ml-2 h-4 w-4" />تسجيل الخروج</Button>
        </CardContent>
      </Card>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { KeyRound, Loader2, LockKeyhole, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import {
  getMyStaffAppPinStatus,
  setMyStaffAppPin,
  verifyMyStaffAppPin,
} from "@/services/staffAppPinService";

const pinPattern = /^\d{4,6}$/;
const onlyDigits = (value: string) => value.replace(/\D/g, "").slice(0, 6);

export default function StaffAppPinGate({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const unlockKey = useMemo(() => user?.id ? `staff-app-pin-unlocked:${user.id}` : "", [user?.id]);
  const [unlocked, setUnlocked] = useState(() => Boolean(user?.id && sessionStorage.getItem(`staff-app-pin-unlocked:${user.id}`) === "1"));

  const statusQuery = useQuery({
    queryKey: ["staff-app-pin-status-v1", user?.id],
    enabled: Boolean(user?.id),
    queryFn: getMyStaffAppPinStatus,
    staleTime: 15_000,
    retry: false,
  });

  const setupMutation = useMutation({
    mutationFn: async () => {
      if (!pinPattern.test(pin)) throw new Error("PIN يجب أن يكون من 4 إلى 6 أرقام.");
      if (pin !== confirmPin) throw new Error("تأكيد PIN غير مطابق.");
      return setMyStaffAppPin(pin);
    },
    onSuccess: async () => {
      if (unlockKey) sessionStorage.setItem(unlockKey, "1");
      setUnlocked(true);
      setPin("");
      setConfirmPin("");
      setMessage(null);
      await statusQuery.refetch();
    },
    onError: error => setMessage(error instanceof Error ? error.message : "تعذر إنشاء PIN."),
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
    onSuccess: () => {
      if (unlockKey) sessionStorage.setItem(unlockKey, "1");
      setUnlocked(true);
      setPin("");
      setMessage(null);
    },
    onError: async error => {
      setMessage(error instanceof Error ? error.message : "تعذر فتح التطبيق.");
      setPin("");
      await statusQuery.refetch();
    },
  });

  if (!user) return null;
  if (unlocked) return <>{children}</>;

  if (statusQuery.isLoading) {
    return <div dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-9 w-9 animate-spin text-[#005931]" /></div>;
  }

  if (statusQuery.isError) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md"><CardHeader><CardTitle>تعذر التحقق من أمان الحساب</CardTitle><CardDescription>لن يتم فتح التطبيق بدون التحقق من حالة PIN.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{statusQuery.error instanceof Error ? statusQuery.error.message : "حدث خطأ غير متوقع."}</div><Button className="w-full" onClick={() => statusQuery.refetch()}>إعادة المحاولة</Button><Button variant="outline" className="w-full" onClick={() => logout()}><LogOut className="ml-2 h-4 w-4" />تسجيل الخروج</Button></CardContent></Card>
      </div>
    );
  }

  const status = statusQuery.data;
  const configured = Boolean(status?.configured);
  const locked = Boolean(status?.locked);
  const busy = setupMutation.isPending || verifyMutation.isPending;

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-gradient-to-b from-emerald-50/70 to-slate-50 p-4">
      <Card className="w-full max-w-md overflow-hidden border-emerald-100 shadow-xl">
        <div className="h-2 bg-[#005931]" />
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-[#005931]">{configured ? <LockKeyhole className="h-7 w-7" /> : <KeyRound className="h-7 w-7" />}</div>
          <CardTitle className="text-2xl font-black">{configured ? "فتح تطبيق الموظف" : "إنشاء PIN للتطبيق"}</CardTitle>
          <CardDescription>{configured ? `مرحبًا ${user.name}. أدخل PIN الخاص بحسابك للمتابعة.` : `مرحبًا ${user.name}. أنشئ PIN شخصيًا لحماية حسابك على التطبيق.`}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {locked && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">تم قفل PIN مؤقتًا بعد محاولات خاطئة. يمكنك المحاولة بعد {status?.locked_until ? new Intl.DateTimeFormat("ar-EG", { hour: "numeric", minute: "2-digit" }).format(new Date(status.locked_until)) : "10 دقائق"}.</div>}
          {message && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}</div>}

          <div className="space-y-2">
            <Label>{configured ? "PIN" : "PIN الجديد"}</Label>
            <Input
              autoFocus
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              disabled={busy || locked}
              onChange={event => { setPin(onlyDigits(event.target.value)); setMessage(null); }}
              onKeyDown={event => { if (event.key === "Enter" && configured && !busy && !locked) verifyMutation.mutate(); }}
              className="h-14 text-center text-2xl tracking-[0.45em]"
              placeholder="••••"
            />
            <p className="text-xs text-muted-foreground">من 4 إلى 6 أرقام. لا تشارك PIN مع أي موظف آخر أو مدير.</p>
          </div>

          {!configured && <div className="space-y-2"><Label>تأكيد PIN</Label><Input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={confirmPin} disabled={busy} onChange={event => { setConfirmPin(onlyDigits(event.target.value)); setMessage(null); }} onKeyDown={event => { if (event.key === "Enter" && !busy) setupMutation.mutate(); }} className="h-14 text-center text-2xl tracking-[0.45em]" placeholder="••••" /></div>}

          <Button className="h-12 w-full bg-[#005931] hover:bg-[#004426]" disabled={busy || locked || !pinPattern.test(pin) || (!configured && pin !== confirmPin)} onClick={() => configured ? verifyMutation.mutate() : setupMutation.mutate()}>
            {busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="ml-2 h-4 w-4" />}
            {configured ? "فتح التطبيق" : "إنشاء PIN وفتح التطبيق"}
          </Button>
          <Button variant="ghost" className="w-full" disabled={busy} onClick={() => logout()}><LogOut className="ml-2 h-4 w-4" />تسجيل الخروج</Button>
        </CardContent>
      </Card>
    </div>
  );
}

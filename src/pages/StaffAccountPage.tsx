import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { KeyRound, Loader2, LogOut, ShieldCheck, Smartphone, Store, UserRound } from "lucide-react";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { changeMyStaffAppPin, getMyStaffAppPinStatus, superAdminSetStaffAppPin } from "@/services/staffAppPinService";
import { getLocalTrustedStaffDevice } from "@/services/staffDeviceService";

export default function StaffAccountPage() {
  const { user, logout, branchOptions } = useAuth();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const device = getLocalTrustedStaffDevice();
  const branchContext = branchOptions.find(branch => branch.branch_id === currentBranchId);
  const isSuperAdmin = user?.role === "super_admin";

  const pinQuery = useQuery({
    queryKey: ["my-staff-app-pin-status"],
    queryFn: getMyStaffAppPinStatus,
    retry: false,
  });

  const pinMutation = useMutation({
    mutationFn: async () => {
      if (!isSuperAdmin && !/^\d{4,6}$/.test(currentPin)) throw new Error("اكتب PIN الحالي من 4 إلى 6 أرقام.");
      if (!/^\d{4,6}$/.test(newPin)) throw new Error("PIN الجديد يجب أن يكون من 4 إلى 6 أرقام.");
      if (newPin !== confirmPin) throw new Error("تأكيد PIN الجديد غير مطابق.");
      if (!isSuperAdmin && newPin === currentPin) throw new Error("اختار PIN جديد مختلف عن الحالي.");
      if (!user?.id) throw new Error("تعذر تحديد الحساب الحالي.");
      return isSuperAdmin ? superAdminSetStaffAppPin(user.id, newPin) : changeMyStaffAppPin(currentPin, newPin);
    },
    onSuccess: async () => {
      setCurrentPin(""); setNewPin(""); setConfirmPin("");
      toast.success(isSuperAdmin ? "تم تغيير PIN بصلاحية مدير النظام." : "تم تغيير PIN الخاص بحسابك.");
      await pinQuery.refetch();
    },
    onError: error => toast.error(error instanceof Error ? error.message : "تعذر تغيير PIN."),
  });

  if (!user) return null;

  const roleLabel = branchContext?.role_name_ar || (user.role === "super_admin" ? "مدير النظام" : user.role || "موظف");
  const deviceReady = Boolean(device && device.employee_id === user.id);

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-6xl space-y-5 py-5">
        <section className="overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="bg-gradient-to-l from-[#005931] via-[#08683e] to-[#0b7a49] p-6 text-white md:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-2xl font-black ring-1 ring-white/20">{user.name?.trim().charAt(0) || "م"}</div>
                <div><div className="text-2xl font-black">{user.name}</div><div className="mt-1 text-sm text-emerald-50">{roleLabel} · {currentBranchName || "بدون فرع محدد"}</div></div>
              </div>
              <Badge className="w-fit border-white/20 bg-white/10 px-3 py-1.5 text-white hover:bg-white/10"><ShieldCheck className="ml-1 h-4 w-4" />حساب موظف مؤمّن</Badge>
            </div>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="rounded-3xl">
            <CardHeader><CardTitle className="flex items-center gap-2"><UserRound className="h-5 w-5 text-[#005931]" />بيانات الحساب</CardTitle><CardDescription>البيانات التشغيلية الحالية للحساب والفرع.</CardDescription></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4"><span className="text-muted-foreground">اسم الموظف</span><strong>{user.name}</strong></div>
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4"><span className="text-muted-foreground">الدور</span><strong>{roleLabel}</strong></div>
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4"><span className="flex items-center gap-2 text-muted-foreground"><Store className="h-4 w-4" />الفرع</span><strong>{currentBranchName || "—"}</strong></div>
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4"><span className="flex items-center gap-2 text-muted-foreground"><Smartphone className="h-4 w-4" />الجهاز الموثوق</span><strong className={deviceReady ? "text-emerald-700" : "text-amber-700"}>{deviceReady ? device?.device_name || "مفعّل" : "غير مفعّل"}</strong></div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-[#005931]" />تغيير PIN التطبيق</CardTitle><CardDescription>نفس PIN الخاص بحساب الموظف. لو عندك صلاحية POS، يتم استخدام نفس الرقم للدخول السريع أيضًا.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {pinQuery.isLoading ? <div className="flex min-h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#005931]" /></div> : pinQuery.data?.locked ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">PIN مقفول مؤقتًا بسبب محاولات خاطئة. حاول بعد انتهاء مدة القفل.</div> : <>
                <div className={`grid gap-3 ${isSuperAdmin ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
                  {!isSuperAdmin && <div className="space-y-2"><Label>PIN الحالي</Label><Input type="password" inputMode="numeric" maxLength={6} value={currentPin} onChange={e => setCurrentPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" /></div>}
                  <div className="space-y-2"><Label>PIN الجديد</Label><Input type="password" inputMode="numeric" maxLength={6} value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" /></div>
                  <div className="space-y-2"><Label>تأكيد الجديد</Label><Input type="password" inputMode="numeric" maxLength={6} value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" /></div>
                </div>
                <div className="rounded-2xl bg-emerald-50 p-4 text-xs leading-6 text-emerald-900">{isSuperAdmin ? "مدير النظام يقدر يضع PIN جديد مباشرة بدون كتابة الرمز القديم. كل تغيير يتم تسجيله في سجل التدقيق." : "لو نسيت PIN، استخدم استرجاع الرمز من شاشة القفل باسم المستخدم وكلمة المرور ثم اختر PIN جديد."}</div>
                <Button className="w-full bg-[#005931] hover:bg-[#004526]" disabled={pinMutation.isPending || (!isSuperAdmin && !currentPin) || !newPin || !confirmPin} onClick={() => pinMutation.mutate()}>{pinMutation.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <KeyRound className="ml-2 h-4 w-4" />}تغيير PIN</Button>
              </>}
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-3xl border-red-100">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="font-black">إنهاء الجلسة</div><div className="mt-1 text-sm text-muted-foreground">تسجيل الخروج ينهي جلسة هذا الحساب على المتصفح الحالي.</div></div>
            <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => void logout()}><LogOut className="ml-2 h-4 w-4" />تسجيل الخروج</Button>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}

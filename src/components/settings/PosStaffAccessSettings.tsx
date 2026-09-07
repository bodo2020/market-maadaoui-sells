import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { KeyRound, RefreshCw, ShieldCheck, UserRound, MonitorSmartphone, AlertTriangle } from "lucide-react";
import { useBranchStore } from "@/stores/branchStore";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types";
import { currentStaffHasPermission } from "@/services/supabase/staffAuthService";
import {
  BranchPosStaffStatus,
  getBranchPosStaffStatus,
  resetStaffPosPin,
  setStaffPosAccess,
  setStaffPosPin,
} from "@/services/supabase/posDeviceService";
import { useToast } from "@/hooks/use-toast";

export default function PosStaffAccessSettings() {
  const { user } = useAuth();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const { toast } = useToast();
  const [staff, setStaff] = useState<BranchPosStaffStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [pinUser, setPinUser] = useState<BranchPosStaffStatus | null>(null);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [savingPin, setSavingPin] = useState(false);

  const canManage = useMemo(
    () => user?.role === UserRole.SUPER_ADMIN || currentStaffHasPermission("branch.manage_staff"),
    [user?.role, currentBranchId],
  );
  const canManagePins = useMemo(
    () => user?.role === UserRole.SUPER_ADMIN || currentStaffHasPermission("pos.manage_pins"),
    [user?.role, currentBranchId],
  );

  const refresh = async () => {
    if (!currentBranchId || !canManage) return;
    setLoading(true);
    try {
      setStaff(await getBranchPosStaffStatus(currentBranchId));
    } catch (error: any) {
      toast({ title: "تعذر تحميل موظفي POS", description: error.message || "حاول مرة تانية", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [currentBranchId, canManage]);

  const togglePos = async (employee: BranchPosStaffStatus, enabled: boolean) => {
    if (!currentBranchId) return;
    setBusyUserId(employee.user_id);
    try {
      await setStaffPosAccess(employee.user_id, currentBranchId, enabled);
      toast({
        title: enabled ? "تم تفعيل نقطة البيع" : "تم إيقاف نقطة البيع",
        description: enabled
          ? `${employee.name} يقدر يتجهز للدخول السريع بعد تعيين PIN.`
          : `تم إيقاف دخول ${employee.name} ومسح PIN الخاص بالفرع.`,
      });
      await refresh();
    } catch (error: any) {
      toast({ title: "تعذر تحديث صلاحية POS", description: error.message || "راجع الدور الوظيفي", variant: "destructive" });
    } finally {
      setBusyUserId(null);
    }
  };

  const openPin = (employee: BranchPosStaffStatus) => {
    setPinUser(employee);
    setPin("");
    setConfirmPin("");
  };

  const savePin = async () => {
    if (!currentBranchId || !pinUser) return;
    if (!/^\d{4,6}$/.test(pin)) {
      toast({ title: "PIN غير صالح", description: "اكتب من 4 إلى 6 أرقام", variant: "destructive" });
      return;
    }
    if (pin !== confirmPin) {
      toast({ title: "PIN غير متطابق", description: "اكتب نفس الرقم في الخانتين", variant: "destructive" });
      return;
    }

    setSavingPin(true);
    try {
      await setStaffPosPin(pinUser.user_id, currentBranchId, pin);
      toast({ title: "تم حفظ PIN", description: `${pinUser.name} هيظهر الآن في شاشة جهاز الكاشير.` });
      setPinUser(null);
      setPin("");
      setConfirmPin("");
      await refresh();
    } catch (error: any) {
      toast({ title: "تعذر حفظ PIN", description: error.message || "حاول مرة تانية", variant: "destructive" });
    } finally {
      setSavingPin(false);
    }
  };

  const resetPin = async (employee: BranchPosStaffStatus) => {
    if (!currentBranchId || !employee.has_pin || !canManagePins) return;
    setBusyUserId(employee.user_id);
    try {
      await resetStaffPosPin(employee.user_id, currentBranchId);
      toast({ title: "تم مسح PIN", description: `${employee.name} مش هيظهر في الدخول السريع لحد ما تعين PIN جديد.` });
      await refresh();
    } catch (error: any) {
      toast({ title: "تعذر مسح PIN", description: error.message || "حاول مرة تانية", variant: "destructive" });
    } finally {
      setBusyUserId(null);
    }
  };

  if (!currentBranchId) {
    return <Alert><AlertDescription>اختار فرع العمل الأول.</AlertDescription></Alert>;
  }

  if (!canManage) {
    return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>ليس لديك صلاحية إدارة موظفي نقطة البيع في الفرع الحالي.</AlertDescription></Alert>;
  }

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">موظفو نقطة البيع</h2>
          <p className="mt-1 text-sm text-muted-foreground">{currentBranchName || "الفرع الحالي"} · فعّل الموظف وحدد PIN عشان يظهر على جهاز الكاشير.</p>
        </div>
        <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> تحديث
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-[#005931]"><MonitorSmartphone className="h-5 w-5" /></div>
          <CardTitle className="text-lg">الدخول السريع للكاشير</CardTitle>
          <CardDescription>الموظف يظهر على شاشة الجهاز فقط لما يكون POS مفعّل وعنده PIN. الرقم نفسه لا يمكن قراءته بعد الحفظ.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" /> جاري تحميل الموظفين</div>
          ) : staff.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">مفيش موظفين مربوطين بالفرع الحالي.</div>
          ) : (
            <div className="space-y-3">
              {staff.map(employee => {
                const busy = busyUserId === employee.user_id;
                return (
                  <div key={employee.user_id} className="rounded-2xl border bg-white p-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-50 font-bold text-[#005931]">
                          {employee.name.trim().charAt(0) || <UserRound className="h-5 w-5" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-slate-900">{employee.name}</span>
                            <Badge variant="outline">{employee.role_name_ar}</Badge>
                            {employee.has_pin && <Badge className="bg-[#005931]">PIN جاهز</Badge>}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{employee.username}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2 rounded-xl border px-3 py-2">
                          <span className="text-xs font-medium">استخدام POS</span>
                          <Switch checked={employee.pos_enabled} onCheckedChange={checked => void togglePos(employee, checked)} disabled={busy} />
                        </div>
                        <Button size="sm" className="bg-[#005931] hover:bg-[#004a29]" disabled={!employee.pos_enabled || !canManagePins || busy} onClick={() => openPin(employee)}>
                          <KeyRound className="h-4 w-4" /> {employee.has_pin ? "تغيير PIN" : "تعيين PIN"}
                        </Button>
                        {employee.has_pin && (
                          <Button size="sm" variant="outline" disabled={!canManagePins || busy} onClick={() => void resetPin(employee)}>مسح PIN</Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(pinUser)} onOpenChange={open => { if (!open) setPinUser(null); }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تعيين PIN لـ {pinUser?.name}</DialogTitle>
            <DialogDescription>اختار من 4 إلى 6 أرقام. الموظف هيستخدم الرقم للدخول السريع من جهاز POS المسجل.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="staff-pin">PIN جديد</Label>
              <Input id="staff-pin" type="password" inputMode="numeric" maxLength={6} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ""))} placeholder="••••" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-pin-confirm">تأكيد PIN</Label>
              <Input id="staff-pin-confirm" type="password" inputMode="numeric" maxLength={6} value={confirmPin} onChange={event => setConfirmPin(event.target.value.replace(/\D/g, ""))} placeholder="••••" />
            </div>
          </div>
          <Alert><ShieldCheck className="h-4 w-4" /><AlertDescription>الـPIN بيتخزن Hash فقط. بعد الحفظ لا المدير ولا أي مستخدم يقدر يشوف الرقم القديم.</AlertDescription></Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPinUser(null)} disabled={savingPin}>إلغاء</Button>
            <Button className="bg-[#005931] hover:bg-[#004a29]" onClick={() => void savePin()} disabled={savingPin || !pin || !confirmPin}>
              {savingPin ? <RefreshCw className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} حفظ PIN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

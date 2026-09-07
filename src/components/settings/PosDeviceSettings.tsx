import { useEffect, useMemo, useState } from "react";
import { Clock3, MonitorSmartphone, ShieldCheck, KeyRound, RefreshCw, Power, CheckCircle2, UserRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { currentStaffHasPermission } from "@/services/supabase/staffAuthService";
import {
  getLocalPosDevice,
  hasMyPosPin,
  listPosDevices,
  PosDevice,
  registerThisPosDevice,
  revokePosDevice,
  setMyPosPin,
  updatePosDeviceRuntimeSettings,
} from "@/services/supabase/posDeviceService";

type DeviceDraft = { autoLock: string; cashThreshold: string };

export default function PosDeviceSettings() {
  const { user } = useAuth();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const { toast } = useToast();

  const [deviceName, setDeviceName] = useState("كاشير 1");
  const [devices, setDevices] = useState<PosDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [savingDeviceId, setSavingDeviceId] = useState<string | null>(null);
  const [deviceDrafts, setDeviceDrafts] = useState<Record<string, DeviceDraft>>({});
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [savingPin, setSavingPin] = useState(false);
  const [pinReady, setPinReady] = useState(false);

  const canManageDevices = useMemo(
    () => user?.role === "super_admin" || currentStaffHasPermission("pos.manage_devices"),
    [user?.role, currentBranchId],
  );
  const canUsePos = useMemo(
    () => user?.role === "super_admin" || currentStaffHasPermission("pos.use"),
    [user?.role, currentBranchId],
  );

  const localDevice = currentBranchId ? getLocalPosDevice(currentBranchId) : null;

  const applyDeviceRows = (deviceRows: PosDevice[]) => {
    setDevices(deviceRows);
    setDeviceDrafts(prev => {
      const next = { ...prev };
      deviceRows.forEach(device => {
        if (!next[device.device_id]) {
          next[device.device_id] = {
            autoLock: String(device.auto_lock_minutes || 10),
            cashThreshold: device.cash_warning_threshold == null ? "" : String(device.cash_warning_threshold),
          };
        }
      });
      return next;
    });
  };

  const refresh = async (quiet = false) => {
    if (!currentBranchId) return;
    if (!quiet) setLoading(true);
    try {
      const [pinStatus, deviceRows] = await Promise.all([
        canUsePos ? hasMyPosPin(currentBranchId) : Promise.resolve(false),
        canManageDevices ? listPosDevices(currentBranchId) : Promise.resolve([]),
      ]);
      setPinReady(pinStatus);
      applyDeviceRows(deviceRows);
    } catch (error: any) {
      if (!quiet) {
        toast({
          title: "تعذر تحميل إعدادات الجهاز",
          description: error.message || "حاول مرة تانية",
          variant: "destructive",
        });
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [currentBranchId, canManageDevices, canUsePos]);

  useEffect(() => {
    if (!currentBranchId || !canManageDevices) return;
    const timer = window.setInterval(() => void refresh(true), 15000);
    return () => window.clearInterval(timer);
  }, [currentBranchId, canManageDevices, canUsePos]);

  const registerCurrentDevice = async () => {
    if (!currentBranchId || !canManageDevices) return;
    try {
      setRegistering(true);
      const registered = await registerThisPosDevice(currentBranchId, deviceName || "كاشير 1");
      toast({
        title: "تم تسجيل هذا الجهاز",
        description: `${registered.device_name} · ${registered.device_code}`,
      });
      await refresh();
    } catch (error: any) {
      toast({
        title: "تعذر تسجيل الجهاز",
        description: error.message || "راجع صلاحيات الفرع",
        variant: "destructive",
      });
    } finally {
      setRegistering(false);
    }
  };

  const savePin = async () => {
    if (!currentBranchId || !canUsePos) return;
    if (!/^\d{4,6}$/.test(pin)) {
      toast({ title: "PIN غير صالح", description: "اكتب من 4 إلى 6 أرقام", variant: "destructive" });
      return;
    }
    if (pin !== confirmPin) {
      toast({ title: "PIN غير متطابق", description: "أعد كتابة نفس الرقم", variant: "destructive" });
      return;
    }

    try {
      setSavingPin(true);
      await setMyPosPin(currentBranchId, pin);
      setPin("");
      setConfirmPin("");
      setPinReady(true);
      toast({ title: "تم حفظ PIN", description: "تقدر تستخدمه للدخول السريع على أجهزة الفرع المسجلة" });
    } catch (error: any) {
      toast({
        title: "تعذر حفظ PIN",
        description: error.message || "راجع صلاحيات نقطة البيع",
        variant: "destructive",
      });
    } finally {
      setSavingPin(false);
    }
  };

  const saveRuntimeSettings = async (device: PosDevice) => {
    const draft = deviceDrafts[device.device_id];
    if (!draft) return;
    const autoLock = Number(draft.autoLock);
    const threshold = draft.cashThreshold.trim() === "" ? null : Number(draft.cashThreshold);
    if (!Number.isInteger(autoLock) || autoLock < 1 || autoLock > 120) {
      toast({ title: "مدة القفل غير صحيحة", description: "اختار من 1 إلى 120 دقيقة.", variant: "destructive" });
      return;
    }
    if (threshold != null && (!Number.isFinite(threshold) || threshold < 0)) {
      toast({ title: "حد النقدية غير صحيح", description: "اكتب مبلغ موجب أو اتركه فارغًا لإلغاء التنبيه.", variant: "destructive" });
      return;
    }
    try {
      setSavingDeviceId(device.device_id);
      await updatePosDeviceRuntimeSettings(device.device_id, autoLock, threshold);
      toast({ title: "تم حفظ إعدادات الجهاز", description: `${device.device_name} · قفل بعد ${autoLock} دقيقة` });
      await refresh();
    } catch (error: any) {
      toast({ title: "تعذر حفظ إعدادات الجهاز", description: error.message || "حاول مرة تانية", variant: "destructive" });
    } finally {
      setSavingDeviceId(null);
    }
  };

  const revokeDevice = async (device: PosDevice) => {
    if (!currentBranchId || !canManageDevices || !device.active) return;
    try {
      setRevokingId(device.device_id);
      await revokePosDevice(device.device_id, currentBranchId);
      toast({ title: "تم إلغاء الجهاز", description: device.device_name });
      await refresh();
    } catch (error: any) {
      toast({
        title: "تعذر إلغاء الجهاز",
        description: error.message || "حاول مرة تانية",
        variant: "destructive",
      });
    } finally {
      setRevokingId(null);
    }
  };

  if (!currentBranchId) {
    return <Alert><AlertDescription>اختار فرع العمل الأول عشان تدير أجهزة نقطة البيع.</AlertDescription></Alert>;
  }

  return (
    <div dir="rtl" className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">أجهزة نقطة البيع</h2>
        <p className="mt-1 text-sm text-muted-foreground">{currentBranchName || "الفرع الحالي"} · تسجيل الأجهزة وPIN الدخول السريع وسياسات التشغيل.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-[#005931]">
              <MonitorSmartphone className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg">هذا الجهاز</CardTitle>
            <CardDescription>التسجيل يتم مرة واحدة، والـDevice Token بيتحفظ على هذا المتصفح فقط ولا يظهر بعد كده.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {localDevice ? (
              <div className="rounded-2xl border border-green-200 bg-green-50/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-bold text-slate-900">
                      <CheckCircle2 className="h-5 w-5 text-[#005931]" />
                      {localDevice.device_name}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{localDevice.device_code}</p>
                  </div>
                  <Badge className="bg-[#005931]">مسجل على هذا الجهاز</Badge>
                </div>
              </div>
            ) : canManageDevices ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="deviceName">اسم الجهاز</Label>
                  <Input id="deviceName" value={deviceName} onChange={event => setDeviceName(event.target.value)} placeholder="مثال: كاشير 1" />
                </div>
                <Button className="w-full bg-[#005931] hover:bg-[#004a29]" onClick={() => void registerCurrentDevice()} disabled={registering || deviceName.trim().length < 2}>
                  {registering ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  تسجيل هذا الجهاز
                </Button>
              </>
            ) : (
              <Alert><AlertDescription>تسجيل الأجهزة متاح لمدير الفرع أو من لديه صلاحية إدارة أجهزة POS.</AlertDescription></Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <KeyRound className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg">PIN الخاص بك</CardTitle>
            <CardDescription>PIN من 4 إلى 6 أرقام للدخول السريع. بيتخزن Hash فقط ومحدش يقدر يشوف الرقم.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canUsePos ? (
              <>
                <div className="flex items-center justify-between rounded-xl border p-3">
                  <span className="text-sm">حالة PIN</span>
                  <Badge variant={pinReady ? "default" : "outline"}>{pinReady ? "مفعل" : "غير مفعل"}</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="pin">PIN جديد</Label>
                    <Input id="pin" inputMode="numeric" type="password" maxLength={6} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ""))} placeholder="••••" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPin">تأكيد PIN</Label>
                    <Input id="confirmPin" inputMode="numeric" type="password" maxLength={6} value={confirmPin} onChange={event => setConfirmPin(event.target.value.replace(/\D/g, ""))} placeholder="••••" />
                  </div>
                </div>
                <Button variant="outline" className="w-full" onClick={() => void savePin()} disabled={savingPin || !pin || !confirmPin}>
                  {savingPin ? <RefreshCw className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  {pinReady ? "تغيير PIN" : "تفعيل PIN"}
                </Button>
              </>
            ) : (
              <Alert><AlertDescription>حسابك غير مفعّل لاستخدام نقطة البيع في الفرع الحالي.</AlertDescription></Alert>
            )}
          </CardContent>
        </Card>
      </div>

      {canManageDevices && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">أجهزة الفرع وسياسة التشغيل</CardTitle>
            <CardDescription>الحالة الحية لكل كاشير، مدة القفل التلقائي، وحد تنبيه النقدية في الدرج.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" /> جاري تحميل الأجهزة</div>
            ) : devices.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">مفيش أجهزة مسجلة على الفرع لسه.</div>
            ) : (
              <div className="space-y-3">
                {devices.map(device => {
                  const isThisDevice = localDevice?.device_id === device.device_id;
                  const draft = deviceDrafts[device.device_id] || { autoLock: String(device.auto_lock_minutes || 10), cashThreshold: device.cash_warning_threshold == null ? "" : String(device.cash_warning_threshold) };
                  const hasOpenShift = Boolean(device.current_shift_id);
                  return (
                    <div key={device.device_id} className="rounded-2xl border p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{device.device_name}</span>
                            <Badge variant={device.active ? "default" : "secondary"}>{device.active ? "نشط" : "ملغي"}</Badge>
                            {isThisDevice && <Badge variant="outline">هذا الجهاز</Badge>}
                            {device.active && <Badge className={hasOpenShift ? "bg-emerald-600" : "bg-slate-500"}>{hasOpenShift ? "وردية مفتوحة" : "متاح"}</Badge>}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{device.device_code}{device.last_seen_at ? ` · آخر اتصال ${new Date(device.last_seen_at).toLocaleString("ar-EG")}` : " · لم يستخدم بعد"}</p>
                          {hasOpenShift && (
                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-emerald-800"><UserRound className="h-3.5 w-3.5" /> {device.current_employee_name || "موظف POS"}</span>
                              {device.shift_opened_at && <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-slate-700"><Clock3 className="h-3.5 w-3.5" /> بدأت {new Date(device.shift_opened_at).toLocaleString("ar-EG")}</span>}
                            </div>
                          )}
                        </div>
                        {device.active && (
                          <Button variant="outline" size="sm" onClick={() => void revokeDevice(device)} disabled={revokingId === device.device_id || hasOpenShift} title={hasOpenShift ? "اقفل الوردية الحالية قبل إلغاء الجهاز" : "إلغاء الجهاز"}>
                            {revokingId === device.device_id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                            إلغاء الجهاز
                          </Button>
                        )}
                      </div>

                      {device.active && (
                        <div className="mt-4 grid gap-3 border-t pt-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
                          <div className="space-y-2">
                            <Label htmlFor={`lock-${device.device_id}`}>القفل التلقائي بعد</Label>
                            <div className="relative">
                              <Input
                                id={`lock-${device.device_id}`}
                                type="number"
                                min={1}
                                max={120}
                                value={draft.autoLock}
                                onChange={event => setDeviceDrafts(prev => ({ ...prev, [device.device_id]: { ...draft, autoLock: event.target.value } }))}
                                className="pl-14"
                              />
                              <span className="absolute inset-y-0 left-3 flex items-center text-xs text-muted-foreground">دقيقة</span>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`cash-${device.device_id}`}>تنبيه النقدية — اختياري</Label>
                            <div className="relative">
                              <Input
                                id={`cash-${device.device_id}`}
                                type="number"
                                min={0}
                                step="0.01"
                                value={draft.cashThreshold}
                                onChange={event => setDeviceDrafts(prev => ({ ...prev, [device.device_id]: { ...draft, cashThreshold: event.target.value } }))}
                                placeholder="مثال: 5000"
                                className="pl-14"
                              />
                              <span className="absolute inset-y-0 left-3 flex items-center text-xs text-muted-foreground">ج.م</span>
                            </div>
                          </div>
                          <Button className="bg-[#005931] hover:bg-[#004a29]" onClick={() => void saveRuntimeSettings(device)} disabled={savingDeviceId === device.device_id}>
                            {savingDeviceId === device.device_id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                            حفظ
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

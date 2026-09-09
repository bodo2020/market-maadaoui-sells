import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Check, Clipboard, Laptop, Link2, Plus, ShieldCheck, ShieldX, Smartphone, TimerReset, Zap } from "lucide-react";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { getHrEmployeeProfile } from "@/services/hrCompanyService";
import {
  createStaffDevicePairing,
  getEmployeeStaffDevices,
  getOrCreateStaffDeviceKey,
  redeemStaffDevicePairing,
  revokeStaffDevice,
  saveTrustedStaffDevice,
  StaffDevicePairing,
  StaffDeviceType,
} from "@/services/staffDeviceService";

const typeLabels: Record<StaffDeviceType, string> = {
  personal: "جهاز شخصي",
  shared: "جهاز مشترك",
  remote: "جهاز عمل عن بُعد",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  try { return new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
  catch { return value; }
}

function currentDeviceName() {
  const platform = navigator.platform || "Web";
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  return mobile ? `موبايل الموظف - ${platform}` : `جهاز الموظف - ${platform}`;
}

export default function EmployeeDevicesPage() {
  const { employeeId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const branchId = localStorage.getItem("currentBranchId");
  const [pairOpen, setPairOpen] = useState(false);
  const [deviceType, setDeviceType] = useState<StaffDeviceType>("personal");
  const [pairing, setPairing] = useState<StaffDevicePairing | null>(null);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  const profileQuery = useQuery({
    queryKey: ["hr-employee-profile", employeeId, branchId],
    queryFn: () => getHrEmployeeProfile(employeeId, branchId),
    enabled: Boolean(employeeId),
  });
  const devicesQuery = useQuery({
    queryKey: ["hr-staff-devices", employeeId, branchId],
    queryFn: () => getEmployeeStaffDevices(employeeId, branchId),
    enabled: Boolean(employeeId),
  });

  const activeCount = useMemo(() => (devicesQuery.data || []).filter((d) => d.active).length, [devicesQuery.data]);
  const isCurrentUser = Boolean(user?.id && user.id === employeeId);

  const pairMutation = useMutation({
    mutationFn: () => createStaffDevicePairing({ employeeId, branchId, deviceType, expiresMinutes: 10 }),
    onSuccess: (data) => {
      setPairing(data);
      toast.success("تم إنشاء جلسة ربط آمنة لمدة 10 دقائق");
    },
    onError: (e: any) => toast.error(e?.message || "تعذر إنشاء ربط الجهاز"),
  });

  const selfTrustMutation = useMutation({
    mutationFn: async () => {
      const created = await createStaffDevicePairing({ employeeId, branchId, deviceType: "personal", expiresMinutes: 10 });
      const result = await redeemStaffDevicePairing({
        pairingToken: created.pairing_token,
        pairingCode: created.pairing_code,
        deviceKey: getOrCreateStaffDeviceKey(),
        deviceName: currentDeviceName(),
        platform: navigator.platform || "web",
        deviceType: "personal",
        metadata: {
          user_agent: navigator.userAgent,
          language: navigator.language,
          screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
          activation_mode: "self_admin_one_click",
        },
      });
      if (!result.ok) throw new Error("تعذر اعتماد الجهاز الحالي");
      saveTrustedStaffDevice(result);
      return result;
    },
    onSuccess: () => {
      toast.success("تم اعتماد هذا الجهاز كجهاز موثوق");
      queryClient.invalidateQueries({ queryKey: ["hr-staff-devices", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["my-attendance"] });
    },
    onError: (e: any) => toast.error(e?.message || "تعذر اعتماد الجهاز الحالي"),
  });

  const revokeMutation = useMutation({
    mutationFn: (deviceId: string) => revokeStaffDevice(deviceId, "إلغاء الثقة من ملف الموظف"),
    onSuccess: () => {
      toast.success("تم إلغاء الثقة بالجهاز");
      queryClient.invalidateQueries({ queryKey: ["hr-staff-devices", employeeId] });
    },
    onError: (e: any) => toast.error(e?.message || "تعذر إلغاء الجهاز"),
  });

  const activationLink = pairing ? `${window.location.origin}/staff-device/activate#token=${encodeURIComponent(pairing.pairing_token)}` : "";
  const copy = async (kind: "link" | "code", value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  };

  const employeeName = profileQuery.data?.user?.name || "الموظف";

  return (
    <MainLayout>
      <div dir="rtl" className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/employees/${employeeId}`)}><ArrowRight className="h-5 w-5" /></Button>
            <div>
              <div className="flex items-center gap-2"><ShieldCheck className="h-7 w-7 text-[#005931]" /><h1 className="text-3xl font-black">الأجهزة الموثوقة</h1></div>
              <p className="mt-1 text-sm text-muted-foreground">{employeeName} • ربط آمن بدون استخدام حساب السوبر أدمن على جهاز الموظف.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isCurrentUser && (
              <Button
                variant="outline"
                className="border-[#005931]/30 text-[#005931] hover:bg-[#005931]/5"
                disabled={selfTrustMutation.isPending}
                onClick={() => selfTrustMutation.mutate()}
              >
                <Zap className="ml-2 h-4 w-4" />
                {selfTrustMutation.isPending ? "جاري اعتماد الجهاز..." : "اعتماد هذا الجهاز الآن"}
              </Button>
            )}
            <Button className="bg-[#005931] hover:bg-[#004426]" onClick={() => { setPairing(null); setPairOpen(true); }}><Plus className="ml-2 h-4 w-4" />ربط جهاز جديد</Button>
          </div>
        </div>

        {isCurrentUser && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm leading-6">
            <div className="font-black text-[#005931]">أنت تدير أجهزة حسابك الحالي</div>
            <div className="mt-1 text-muted-foreground">يمكنك الضغط على «اعتماد هذا الجهاز الآن» لتوثيق المتصفح الحالي مباشرة. لا تحتاج لنسخ رابط أو كود لنفسك.</div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Card><CardContent className="flex items-center gap-3 p-5"><Smartphone className="h-8 w-8 text-[#005931]" /><div><div className="text-2xl font-black">{activeCount}</div><div className="text-xs text-muted-foreground">جهاز موثوق نشط</div></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-5"><ShieldX className="h-8 w-8 text-muted-foreground" /><div><div className="text-2xl font-black">{(devicesQuery.data || []).filter((d) => !d.active).length}</div><div className="text-xs text-muted-foreground">تم إلغاء الثقة</div></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-5"><TimerReset className="h-8 w-8 text-[#005931]" /><div><div className="font-black">10 دقائق</div><div className="text-xs text-muted-foreground">صلاحية جلسة الربط</div></div></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>أجهزة {employeeName}</CardTitle><CardDescription>كل جهاز له Token منفصل، ويمكن إلغاء الثقة فورًا بدون تغيير كلمة مرور الموظف.</CardDescription></CardHeader>
          <CardContent>
            {devicesQuery.isLoading ? <div className="py-12 text-center text-muted-foreground">جاري تحميل الأجهزة...</div> : devicesQuery.error ? <div className="py-12 text-center text-destructive">تعذر تحميل الأجهزة أو ليس لديك صلاحية.</div> : !(devicesQuery.data || []).length ? (
              <div className="rounded-xl border border-dashed p-10 text-center"><Laptop className="mx-auto mb-3 h-10 w-10 text-muted-foreground" /><div className="font-bold">لا يوجد جهاز موثوق حتى الآن</div><p className="mt-1 text-sm text-muted-foreground">أنشئ جلسة ربط وأرسل الرابط والكود للموظف، أو اعتمد الجهاز الحالي مباشرة إذا كان هذا حسابك.</p></div>
            ) : <div className="grid gap-3 lg:grid-cols-2">{devicesQuery.data?.map((device) => (
              <div key={device.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3"><div className="rounded-lg bg-[#005931]/10 p-2"><Smartphone className="h-5 w-5 text-[#005931]" /></div><div><div className="font-black">{device.device_name}</div><div className="mt-1 text-xs text-muted-foreground">{typeLabels[device.device_type]}{device.platform ? ` • ${device.platform}` : ""}</div></div></div>
                  <Badge variant={device.active ? "default" : "secondary"}>{device.active ? "موثوق" : "ملغي"}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><div className="text-muted-foreground">تم الربط</div><div className="font-medium">{formatDate(device.trusted_at)}</div></div><div><div className="text-muted-foreground">آخر نشاط</div><div className="font-medium">{formatDate(device.last_seen_at)}</div></div><div><div className="text-muted-foreground">الفرع</div><div className="font-medium">{device.branch_name || "كل الفروع/غير محدد"}</div></div><div><div className="text-muted-foreground">معرّف الجهاز</div><div dir="ltr" className="truncate font-mono">{device.device_key}</div></div></div>
                {device.active && <Button variant="outline" className="mt-4 w-full text-destructive" disabled={revokeMutation.isPending} onClick={() => revokeMutation.mutate(device.id)}><ShieldX className="ml-2 h-4 w-4" />إلغاء الثقة</Button>}
                {!device.active && device.revoke_reason && <div className="mt-3 rounded-lg bg-muted p-2 text-xs text-muted-foreground">السبب: {device.revoke_reason}</div>}
              </div>
            ))}</div>}
          </CardContent>
        </Card>
      </div>

      <Dialog open={pairOpen} onOpenChange={(open) => { setPairOpen(open); if (!open) setPairing(null); }}>
        <DialogContent dir="rtl" className="max-w-xl">
          <DialogHeader><DialogTitle>ربط جهاز جديد لـ {employeeName}</DialogTitle><DialogDescription>لن يتم إدخال حساب المدير على الجهاز. النظام ينشئ Token قوي + كود 6 أرقام يستخدمان مرة واحدة فقط.</DialogDescription></DialogHeader>
          {!pairing ? <div className="space-y-4">
            <div><Label>نوع الجهاز</Label><Select value={deviceType} onValueChange={(v) => setDeviceType(v as StaffDeviceType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="personal">جهاز شخصي</SelectItem><SelectItem value="remote">جهاز عمل عن بُعد</SelectItem><SelectItem value="shared">جهاز مشترك</SelectItem></SelectContent></Select></div>
            <div className="rounded-lg border bg-muted/40 p-3 text-sm leading-6">الجلسة صالحة 10 دقائق. أي جلسة ربط قديمة معلقة لنفس الموظف يتم إلغاؤها تلقائيًا.</div>
          </div> : <div className="space-y-4">
            <div className="rounded-xl border p-4"><div className="text-xs text-muted-foreground">كود التفعيل</div><div className="mt-2 flex items-center justify-between gap-3"><div dir="ltr" className="text-3xl font-black tracking-[0.35em]">{pairing.pairing_code}</div><Button variant="outline" size="sm" onClick={() => copy("code", pairing.pairing_code)}>{copied === "code" ? <Check className="ml-2 h-4 w-4" /> : <Clipboard className="ml-2 h-4 w-4" />}نسخ</Button></div></div>
            <div className="rounded-xl border p-4"><div className="flex items-center gap-2 font-bold"><Link2 className="h-4 w-4 text-[#005931]" />رابط التفعيل</div><div dir="ltr" className="mt-2 break-all rounded bg-muted p-2 text-xs">{activationLink}</div><Button variant="outline" className="mt-3 w-full" onClick={() => copy("link", activationLink)}>{copied === "link" ? <Check className="ml-2 h-4 w-4" /> : <Clipboard className="ml-2 h-4 w-4" />}{copied === "link" ? "تم النسخ" : "نسخ رابط التفعيل"}</Button></div>
            <div className="text-xs text-muted-foreground">ينتهي: {formatDate(pairing.expires_at)}. الـToken موجود في جزء # من الرابط حتى لا يُرسل للسيرفر كـURL query.</div>
          </div>}
          <DialogFooter>{!pairing && <Button className="bg-[#005931] hover:bg-[#004426]" disabled={pairMutation.isPending} onClick={() => pairMutation.mutate()}>{pairMutation.isPending ? "جاري الإنشاء..." : "إنشاء جلسة الربط"}</Button>}</DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

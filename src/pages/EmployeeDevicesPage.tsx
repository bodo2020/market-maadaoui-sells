import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Check, Clipboard, Clock3, Laptop, Link2, Plus, ShieldCheck, ShieldX, Smartphone, TimerReset, XCircle } from "lucide-react";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getHrEmployeeProfile } from "@/services/hrCompanyService";
import { createStaffDevicePairing, getEmployeeStaffDevices, revokeStaffDevice, StaffDevicePairing, StaffDeviceType } from "@/services/staffDeviceService";

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

export default function EmployeeDevicesPage() {
  const { employeeId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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

  const activeCount = useMemo(() => (devicesQuery.data || []).filter((d) => d.active && d.approval_status === "approved").length, [devicesQuery.data]);
  const pendingCount = useMemo(() => (devicesQuery.data || []).filter((d) => d.approval_status === "pending").length, [devicesQuery.data]);
  const rejectedCount = useMemo(() => (devicesQuery.data || []).filter((d) => d.approval_status === "rejected").length, [devicesQuery.data]);

  const pairMutation = useMutation({
    mutationFn: () => createStaffDevicePairing({ employeeId, branchId, deviceType, expiresMinutes: 10 }),
    onSuccess: (data) => {
      setPairing(data);
      toast.success("تم إنشاء جلسة تسجيل الجهاز لمدة 10 دقائق");
    },
    onError: (e: any) => toast.error(e?.message || "تعذر إنشاء جلسة الجهاز"),
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

  const statusBadge = (device: NonNullable<typeof devicesQuery.data>[number]) => {
    if (device.approval_status === "pending") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">بانتظار اعتماد السوبر أدمن</Badge>;
    if (device.approval_status === "rejected") return <Badge variant="destructive">مرفوض</Badge>;
    if (!device.active || device.revoked_at) return <Badge variant="secondary">تم إلغاء الثقة</Badge>;
    return <Badge className="bg-emerald-600">موثوق</Badge>;
  };

  return (
    <MainLayout>
      <div dir="rtl" className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/employees/${employeeId}`)}><ArrowRight className="h-5 w-5" /></Button>
            <div>
              <div className="flex items-center gap-2"><ShieldCheck className="h-7 w-7 text-[#005931]" /><h1 className="text-3xl font-black">أجهزة الموظف</h1></div>
              <p className="mt-1 text-sm text-muted-foreground">{employeeName} • تسجيل الجهاز لا يمنحه الثقة تلقائيًا؛ الاعتماد النهائي من السوبر أدمن.</p>
            </div>
          </div>
          <Button className="bg-[#005931] hover:bg-[#004426]" onClick={() => { setPairing(null); setPairOpen(true); }}><Plus className="ml-2 h-4 w-4" />تسجيل جهاز جديد</Button>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm leading-6 text-amber-950">
          <div className="font-black">طريقة التفعيل الجديدة</div>
          <div className="mt-1">أنشئ الرابط والكود → الموظف يسجل الجهاز → يظهر الطلب في «اعتماد الأجهزة» عند السوبر أدمن → بعد الموافقة فقط يصبح الجهاز موثوقًا ويعمل الحضور.</div>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Card><CardContent className="flex items-center gap-3 p-5"><Smartphone className="h-8 w-8 text-[#005931]" /><div><div className="text-2xl font-black">{activeCount}</div><div className="text-xs text-muted-foreground">موثوق</div></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-5"><Clock3 className="h-8 w-8 text-amber-600" /><div><div className="text-2xl font-black">{pendingCount}</div><div className="text-xs text-muted-foreground">بانتظار الاعتماد</div></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-5"><XCircle className="h-8 w-8 text-destructive" /><div><div className="text-2xl font-black">{rejectedCount}</div><div className="text-xs text-muted-foreground">مرفوض</div></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-5"><TimerReset className="h-8 w-8 text-[#005931]" /><div><div className="font-black">10 دقائق</div><div className="text-xs text-muted-foreground">صلاحية رابط التسجيل</div></div></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>أجهزة {employeeName}</CardTitle><CardDescription>كل جهاز له Token منفصل، وسجل اعتماد/رفض مستقل ومحفوظ في الـAudit.</CardDescription></CardHeader>
          <CardContent>
            {devicesQuery.isLoading ? <div className="py-12 text-center text-muted-foreground">جاري تحميل الأجهزة...</div> : devicesQuery.error ? <div className="py-12 text-center text-destructive">تعذر تحميل الأجهزة أو ليس لديك صلاحية.</div> : !(devicesQuery.data || []).length ? (
              <div className="rounded-xl border border-dashed p-10 text-center"><Laptop className="mx-auto mb-3 h-10 w-10 text-muted-foreground" /><div className="font-bold">لا توجد أجهزة مسجلة</div><p className="mt-1 text-sm text-muted-foreground">أنشئ جلسة تسجيل وأرسل الرابط والكود للموظف، ثم يعتمد السوبر أدمن الطلب.</p></div>
            ) : <div className="grid gap-3 lg:grid-cols-2">{devicesQuery.data?.map((device) => (
              <div key={device.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3"><div className="rounded-lg bg-[#005931]/10 p-2"><Smartphone className="h-5 w-5 text-[#005931]" /></div><div><div className="font-black">{device.device_name}</div><div className="mt-1 text-xs text-muted-foreground">{typeLabels[device.device_type]}{device.platform ? ` • ${device.platform}` : ""}</div></div></div>
                  {statusBadge(device)}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div><div className="text-muted-foreground">طلب الاعتماد</div><div className="font-medium">{formatDate(device.requested_at)}</div></div>
                  <div><div className="text-muted-foreground">تم الاعتماد</div><div className="font-medium">{formatDate(device.approved_at || device.trusted_at)}</div></div>
                  <div><div className="text-muted-foreground">آخر نشاط</div><div className="font-medium">{formatDate(device.last_seen_at)}</div></div>
                  <div><div className="text-muted-foreground">الفرع</div><div className="font-medium">{device.branch_name || "كل الفروع/غير محدد"}</div></div>
                </div>
                {device.approval_status === "rejected" && device.rejection_reason && <div className="mt-3 rounded-lg bg-destructive/5 p-2 text-xs text-destructive">سبب الرفض: {device.rejection_reason}</div>}
                {device.active && device.approval_status === "approved" && <Button variant="outline" className="mt-4 w-full text-destructive" disabled={revokeMutation.isPending} onClick={() => revokeMutation.mutate(device.id)}><ShieldX className="ml-2 h-4 w-4" />إلغاء الثقة</Button>}
              </div>
            ))}</div>}
          </CardContent>
        </Card>
      </div>

      <Dialog open={pairOpen} onOpenChange={(open) => { setPairOpen(open); if (!open) setPairing(null); }}>
        <DialogContent dir="rtl" className="max-w-xl">
          <DialogHeader><DialogTitle>تسجيل جهاز جديد لـ {employeeName}</DialogTitle><DialogDescription>الرابط والكود يثبتان هوية جلسة التسجيل فقط. الجهاز يظل Pending حتى يعتمد السوبر أدمن.</DialogDescription></DialogHeader>
          {!pairing ? <div className="space-y-4">
            <div><Label>نوع الجهاز</Label><Select value={deviceType} onValueChange={(v) => setDeviceType(v as StaffDeviceType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="personal">جهاز شخصي</SelectItem><SelectItem value="remote">جهاز عمل عن بُعد</SelectItem><SelectItem value="shared">جهاز مشترك</SelectItem></SelectContent></Select></div>
            <div className="rounded-lg border bg-muted/40 p-3 text-sm leading-6">الجلسة صالحة 10 دقائق. بعد استخدام الكود يتحول الجهاز إلى طلب اعتماد معلق عند السوبر أدمن.</div>
          </div> : <div className="space-y-4">
            <div className="rounded-xl border p-4"><div className="text-xs text-muted-foreground">كود التسجيل</div><div className="mt-2 flex items-center justify-between gap-3"><div dir="ltr" className="text-3xl font-black tracking-[0.35em]">{pairing.pairing_code}</div><Button variant="outline" size="sm" onClick={() => copy("code", pairing.pairing_code)}>{copied === "code" ? <Check className="ml-2 h-4 w-4" /> : <Clipboard className="ml-2 h-4 w-4" />}نسخ</Button></div></div>
            <div className="rounded-xl border p-4"><div className="flex items-center gap-2 font-bold"><Link2 className="h-4 w-4 text-[#005931]" />رابط التسجيل</div><div dir="ltr" className="mt-2 break-all rounded bg-muted p-2 text-xs">{activationLink}</div><Button variant="outline" className="mt-3 w-full" onClick={() => copy("link", activationLink)}>{copied === "link" ? <Check className="ml-2 h-4 w-4" /> : <Clipboard className="ml-2 h-4 w-4" />}{copied === "link" ? "تم النسخ" : "نسخ رابط التسجيل"}</Button></div>
            <div className="text-xs text-muted-foreground">ينتهي: {formatDate(pairing.expires_at)}. بعد التسجيل ستحتاج موافقة السوبر أدمن.</div>
          </div>}
          <DialogFooter>{!pairing && <Button className="bg-[#005931] hover:bg-[#004426]" disabled={pairMutation.isPending} onClick={() => pairMutation.mutate()}>{pairMutation.isPending ? "جاري الإنشاء..." : "إنشاء جلسة التسجيل"}</Button>}</DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

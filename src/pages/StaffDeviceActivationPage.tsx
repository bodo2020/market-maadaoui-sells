import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, KeyRound, Laptop, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getOrCreateStaffDeviceKey, redeemStaffDevicePairing, saveTrustedStaffDevice, StaffDeviceType } from "@/services/staffDeviceService";

function tokenFromHash() {
  const hash = window.location.hash.replace(/^#/, "");
  return new URLSearchParams(hash).get("token") || "";
}

function defaultDeviceName() {
  const platform = navigator.platform || "Web";
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  return mobile ? `موبايل الموظف - ${platform}` : `جهاز الموظف - ${platform}`;
}

export default function StaffDeviceActivationPage() {
  const navigate = useNavigate();
  const pairingToken = useMemo(tokenFromHash, []);
  const [code, setCode] = useState("");
  const [deviceName, setDeviceName] = useState(defaultDeviceName);
  const [deviceType, setDeviceType] = useState<StaffDeviceType>("personal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ employeeName?: string; branchName?: string } | null>(null);

  useEffect(() => {
    if (!pairingToken) setError("رابط التفعيل غير مكتمل. اطلب رابطًا جديدًا من المسؤول.");
  }, [pairingToken]);

  const activate = async () => {
    if (!pairingToken || !/^\d{6}$/.test(code) || deviceName.trim().length < 2) return;
    try {
      setLoading(true);
      setError("");
      const result = await redeemStaffDevicePairing({
        pairingToken,
        pairingCode: code,
        deviceKey: getOrCreateStaffDeviceKey(),
        deviceName: deviceName.trim(),
        platform: navigator.platform || "web",
        deviceType,
        metadata: {
          user_agent: navigator.userAgent,
          language: navigator.language,
          screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
        },
      });
      if (!result.ok) {
        const messages: Record<string, string> = {
          PAIRING_INVALID: "الكود أو رابط التفعيل غير صحيح.",
          PAIRING_EXPIRED: "انتهت صلاحية رابط التفعيل. اطلب رابطًا جديدًا.",
          PAIRING_LOCKED: "تم إيقاف جلسة الربط بعد محاولات غير صحيحة. اطلب رابطًا جديدًا.",
          PAIRING_UNAVAILABLE: "جلسة الربط مستخدمة أو ملغاة بالفعل.",
          DEVICE_INVALID: "راجع اسم الجهاز وحاول مرة أخرى.",
          DEVICE_TYPE_INVALID: "نوع الجهاز غير صالح.",
        };
        setError(messages[result.code || ""] || "تعذر تفعيل الجهاز.");
        return;
      }
      saveTrustedStaffDevice(result);
      window.history.replaceState({}, document.title, "/staff-device/activate");
      setSuccess({ employeeName: result.employee_name, branchName: result.branch_name || undefined });
    } catch (e: any) {
      setError(e?.message || "تعذر تفعيل الجهاز.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10 flex items-center justify-center">
        <Card className="w-full max-w-lg shadow-lg">
          <CardContent className="py-10 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100"><CheckCircle2 className="h-9 w-9 text-[#005931]" /></div>
            <h1 className="text-2xl font-black">تم ربط الجهاز بنجاح</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">الجهاز أصبح موثوقًا لـ <strong>{success.employeeName || "الموظف"}</strong>{success.branchName ? ` في ${success.branchName}` : ""}. سجل الدخول الآن بحساب الموظف نفسه.</p>
            <Button className="mt-6 w-full bg-[#005931] hover:bg-[#004426]" onClick={() => navigate("/login", { replace: true })}>الانتقال لتسجيل الدخول</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10 flex items-center justify-center">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#005931]/10"><ShieldCheck className="h-8 w-8 text-[#005931]" /></div>
          <CardTitle className="text-2xl">تفعيل جهاز موظف</CardTitle>
          <CardDescription>اربط هذا الجهاز بحسابك بدون تسجيل دخول المسؤول أو مشاركة بياناته.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label>كود التفعيل المكون من 6 أرقام</Label>
            <div className="relative mt-1"><KeyRound className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" /><Input dir="ltr" inputMode="numeric" maxLength={6} className="pr-10 text-center text-xl tracking-[0.35em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0,6))} placeholder="000000" /></div>
          </div>
          <div>
            <Label>اسم الجهاز</Label>
            <Input className="mt-1" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} />
          </div>
          <div>
            <Label>نوع الجهاز</Label>
            <Select value={deviceType} onValueChange={(v) => setDeviceType(v as StaffDeviceType)}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="personal"><span className="flex items-center gap-2"><Smartphone className="h-4 w-4" />جهاز شخصي</span></SelectItem><SelectItem value="remote"><span className="flex items-center gap-2"><Laptop className="h-4 w-4" />جهاز عمل عن بُعد</span></SelectItem><SelectItem value="shared">جهاز مشترك</SelectItem></SelectContent></Select>
          </div>
          {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
          <Button className="w-full bg-[#005931] hover:bg-[#004426]" disabled={loading || !pairingToken || !/^\d{6}$/.test(code) || deviceName.trim().length < 2} onClick={activate}>{loading ? "جاري تفعيل الجهاز..." : "تفعيل الجهاز"}</Button>
          <p className="text-center text-xs leading-5 text-muted-foreground">الرابط والكود يستخدمان مرة واحدة فقط، وينتهيان تلقائيًا بعد مدة قصيرة.</p>
        </CardContent>
      </Card>
    </div>
  );
}

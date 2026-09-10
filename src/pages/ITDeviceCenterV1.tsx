import { useEffect, useMemo, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBranchStore } from "@/stores/branchStore";
import {
  approveStaffDevice,
  rejectStaffDevice,
  revokeStaffDevice,
} from "@/services/staffDeviceService";
import {
  detectBrowser,
  detectPlatform,
  endITSession,
  fetchITDeviceCenter,
  getITCapabilities,
  ITConnectionType,
  ITDeviceCenter,
  ITPeripheral,
  ITPeripheralType,
  recordITPeripheralTest,
  requestSerialPort,
  requestUSBDevice,
  setITPeripheralActive,
  unblockITSession,
  upsertITPeripheral,
} from "@/services/itDeviceService";
import { bluetoothPrinterService } from "@/services/bluetoothPrinterService";
import { fetchPOSProductByBarcode } from "@/services/supabase/posCatalogService";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Barcode,
  Bluetooth,
  CheckCircle2,
  CircleOff,
  Cpu,
  Gauge,
  Laptop,
  MonitorCog,
  Plug,
  Printer,
  RefreshCw,
  Router,
  ScanLine,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Unplug,
  Usb,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";

const EMPTY: ITDeviceCenter = {
  trusted_devices: [],
  pos_devices: [],
  sessions: [],
  peripherals: [],
  generated_at: new Date(0).toISOString(),
  scope_branch_id: null,
  is_super_admin: false,
};

type PeripheralDraft = {
  name: string;
  type: ITPeripheralType;
  connection: ITConnectionType;
  vendorId: string;
  productId: string;
  serialNumber: string;
};

const DEFAULT_PERIPHERAL: PeripheralDraft = {
  name: "",
  type: "printer",
  connection: "bluetooth",
  vendorId: "",
  productId: "",
  serialNumber: "",
};

function ago(value?: string | null) {
  if (!value) return "لم يظهر بعد";
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms)) return "—";
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `منذ ${sec} ث`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `منذ ${min} د`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `منذ ${hours} س`;
  return new Date(value).toLocaleString("ar-EG");
}

function yesNo(value: boolean) {
  return value ? "متاح" : "غير متاح";
}

function StatusPill({ ok, yes = "نشط", no = "غير نشط" }: { ok: boolean; yes?: string; no?: string }) {
  return (
    <Badge className={ok ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50" : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-50"} variant="outline">
      {ok ? <CheckCircle2 className="ml-1 h-3.5 w-3.5" /> : <CircleOff className="ml-1 h-3.5 w-3.5" />}
      {ok ? yes : no}
    </Badge>
  );
}

function StatCard({ icon: Icon, label, value, hint }: { icon: any; label: string; value: number | string; hint: string }) {
  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-slate-500">{label}</div>
            <div className="mt-1 text-2xl font-black text-slate-900">{value}</div>
            <div className="mt-1 text-[11px] text-slate-400">{hint}</div>
          </div>
          <div className="rounded-2xl bg-[#005931]/10 p-3 text-[#005931]"><Icon className="h-6 w-6" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

function CapabilityRow({ label, ok, note }: { label: string; ok: boolean; note?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-white p-3">
      <div>
        <div className="font-bold text-slate-800">{label}</div>
        {note && <div className="mt-0.5 text-xs leading-5 text-slate-500">{note}</div>}
      </div>
      <StatusPill ok={ok} yes="جاهز" no="غير مدعوم" />
    </div>
  );
}

const peripheralTypeLabel: Record<ITPeripheralType, string> = {
  printer: "طابعة",
  barcode_scanner: "قارئ باركود",
  scale: "ميزان",
  cash_drawer: "درج نقدية",
  customer_display: "شاشة عميل",
  other: "جهاز آخر",
};

const connectionLabel: Record<ITConnectionType, string> = {
  bluetooth: "Bluetooth",
  usb: "USB",
  serial: "Serial / COM",
  hid_keyboard: "Keyboard / HID",
  camera: "Camera",
  system_print: "طباعة النظام",
  network: "Network / LAN",
  manual: "يدوي",
  other: "أخرى",
};

export default function ITDeviceCenterV1() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [data, setData] = useState<ITDeviceCenter>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PeripheralDraft>(DEFAULT_PERIPHERAL);
  const [scannerCode, setScannerCode] = useState("");
  const [scannerResult, setScannerResult] = useState<string | null>(null);
  const [scaleCode, setScaleCode] = useState("");
  const [scaleResult, setScaleResult] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState(() => getITCapabilities());

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const next = await fetchITDeviceCenter(currentBranchId || null);
      setData(next);
    } catch (error: any) {
      toast.error(error?.message || "تعذر تحميل مركز IT");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 30_000);
    return () => window.clearInterval(timer);
  }, [currentBranchId]);

  const stats = useMemo(() => ({
    online: data.sessions.filter(x => x.online).length,
    activeSessions: data.sessions.filter(x => !x.blocked).length,
    trusted: data.trusted_devices.filter(x => x.active && x.approval_status === "approved" && !x.revoked_at).length,
    pending: data.trusted_devices.filter(x => x.approval_status === "pending").length,
    pos: data.pos_devices.filter(x => x.active && !x.revoked_at).length,
    peripherals: data.peripherals.filter(x => x.active).length,
    faults: data.peripherals.filter(x => x.active && x.last_test_status === "failed").length,
  }), [data]);

  const runAction = async (id: string, work: () => Promise<void>, success: string) => {
    setActionId(id);
    try {
      await work();
      toast.success(success);
      await load(true);
    } catch (error: any) {
      toast.error(error?.message || "تعذر تنفيذ العملية");
    } finally {
      setActionId(null);
    }
  };

  const handleEndSession = (sessionId: string, branchId: string | null) => {
    const reason = window.prompt("سبب إنهاء الجلسة؟", "إنهاء الجلسة من مركز IT");
    if (reason === null) return;
    void runAction(`session-${sessionId}`, () => endITSession(sessionId, branchId || currentBranchId, reason), "تم طلب إنهاء الجلسة. سيُخرج الجهاز عند أول heartbeat.");
  };

  const handleRevoke = (deviceId: string) => {
    const reason = window.prompt("سبب إلغاء الثقة بالجهاز؟", "إلغاء الثقة من مركز IT");
    if (reason === null) return;
    if (!window.confirm("سيحتاج هذا الجهاز اعتمادًا جديدًا لاستخدام الوظائف التي تتطلب جهازًا موثوقًا. متابعة؟")) return;
    void runAction(`trust-${deviceId}`, () => revokeStaffDevice(deviceId, reason), "تم إلغاء الثقة بالجهاز");
  };

  const savePeripheral = async () => {
    if (!currentBranchId) return toast.error("اختر فرعًا أولًا لإضافة جهاز طرفي");
    if (draft.name.trim().length < 2) return toast.error("اكتب اسم الجهاز");
    await runAction("new-peripheral", async () => {
      await upsertITPeripheral({
        branchId: currentBranchId,
        name: draft.name,
        type: draft.type,
        connectionType: draft.connection,
        vendorId: draft.vendorId ? Number(draft.vendorId) : null,
        productId: draft.productId ? Number(draft.productId) : null,
        serialNumber: draft.serialNumber || null,
        config: { created_from: "it-center-v1" },
      });
      setDraft(DEFAULT_PERIPHERAL);
    }, "تم تسجيل الجهاز الطرفي");
  };

  const detectUSB = async () => {
    try {
      const device = await requestUSBDevice();
      setDraft(prev => ({
        ...prev,
        name: device.name,
        connection: "usb",
        vendorId: device.vendorId?.toString() || "",
        productId: device.productId?.toString() || "",
        serialNumber: device.serialNumber || "",
      }));
      toast.success("تم التعرف على جهاز USB");
    } catch (error: any) {
      toast.error(error?.message === "USB_NOT_SUPPORTED" ? "المتصفح الحالي لا يدعم WebUSB" : (error?.message || "تعذر الوصول إلى USB"));
    }
  };

  const detectSerial = async () => {
    try {
      const port = await requestSerialPort();
      setDraft(prev => ({ ...prev, name: prev.name || port.name, type: "scale", connection: "serial" }));
      toast.success("تم منح إذن الوصول إلى منفذ Serial");
    } catch (error: any) {
      toast.error(error?.message === "SERIAL_NOT_SUPPORTED" ? "Web Serial غير متاح على هذا الجهاز/المتصفح" : (error?.message || "تعذر الوصول إلى Serial"));
    }
  };

  const testPeripheral = async (peripheral: ITPeripheral) => {
    if (!peripheral.branch_id) return;
    setActionId(`peripheral-${peripheral.id}`);
    try {
      if (peripheral.peripheral_type === "printer" && peripheral.connection_type === "bluetooth") {
        const connected = bluetoothPrinterService.isConnected() || await bluetoothPrinterService.connectPrinter();
        if (!connected) throw new Error("تعذر الاتصال بالطابعة");
        const ok = await bluetoothPrinterService.testPrint();
        if (!ok) throw new Error("فشل اختبار الطباعة");
        await recordITPeripheralTest(peripheral.id, peripheral.branch_id, "success");
        toast.success("اختبار الطابعة نجح");
      } else if (peripheral.connection_type === "usb") {
        await requestUSBDevice();
        await recordITPeripheralTest(peripheral.id, peripheral.branch_id, "success");
        toast.success("تم الوصول إلى جهاز USB بنجاح");
      } else if (peripheral.connection_type === "serial") {
        await requestSerialPort();
        await recordITPeripheralTest(peripheral.id, peripheral.branch_id, "warning", "تم اختبار الإذن فقط؛ قراءة الوزن المباشر تحتاج بروتوكول موديل الميزان.");
        toast.success("إذن Serial متاح؛ إعداد بروتوكول الميزان هو الخطوة التالية");
      } else {
        await recordITPeripheralTest(peripheral.id, peripheral.branch_id, "warning", "هذا النوع يحتاج اختبارًا من شاشة التشخيص المخصصة.");
        toast.info("استخدم اختبار القارئ/الميزان الموجود في تبويب الأجهزة الطرفية");
      }
      await load(true);
    } catch (error: any) {
      try { await recordITPeripheralTest(peripheral.id, peripheral.branch_id, "failed", error?.message || "فشل الاختبار"); } catch { /* audit failure should not hide hardware failure */ }
      toast.error(error?.message || "فشل اختبار الجهاز");
      await load(true);
    } finally {
      setActionId(null);
    }
  };

  const testScaleBarcode = async () => {
    const code = scaleCode.trim();
    if (!code) return;
    try {
      const result = await fetchPOSProductByBarcode(code);
      if (!result.product) {
        setScaleResult("لم يتم العثور على منتج مطابق أو الباركود ليس بصيغة ميزان معروفة.");
        return;
      }
      const weight = Number((result.product as any).calculated_weight || 0);
      const price = Number((result.product as any).calculated_price || 0);
      setScaleResult(weight > 0
        ? `تم فك باركود الميزان: ${(result.product as any).name} • الوزن ${weight.toFixed(3)} كجم • السعر ${price.toFixed(2)} ج.م`
        : `الباركود عُرف كمنتج عادي: ${(result.product as any).name}`);
    } catch (error: any) {
      setScaleResult(error?.message || "تعذر اختبار باركود الميزان");
    }
  };

  const deviceScopeLabel = currentBranchName || (data.is_super_admin ? "كل الفروع" : "الفرع الحالي");

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto w-full max-w-[1600px] space-y-5 py-5">
        <section className="overflow-hidden rounded-3xl border border-[#005931]/15 bg-gradient-to-l from-[#005931] to-[#007a45] p-5 text-white shadow-sm md:p-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-white/15 p-3 backdrop-blur"><MonitorCog className="h-7 w-7" /></div>
              <div>
                <div className="text-xs font-bold text-emerald-100">IT & DEVICE CONTROL CENTER</div>
                <h1 className="mt-1 text-2xl font-black md:text-3xl">مركز IT والأجهزة</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-50/90">
                  الأجهزة المتصلة، الثقة والأمان، أجهزة POS، الطابعات، قارئات الباركود والموازين في مكان واحد. النطاق الحالي: <strong>{deviceScopeLabel}</strong>.
                </p>
              </div>
            </div>
            <Button onClick={() => void load()} disabled={loading} className="border border-white/25 bg-white text-[#005931] hover:bg-emerald-50">
              <RefreshCw className={loading ? "animate-spin" : ""} /> تحديث الحالة
            </Button>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <StatCard icon={Activity} label="متصل الآن" value={stats.online} hint="Heartbeat آخر دقيقتين" />
          <StatCard icon={ShieldCheck} label="أجهزة موثوقة" value={stats.trusted} hint={`${stats.pending} بانتظار الاعتماد`} />
          <StatCard icon={Router} label="أجهزة POS" value={stats.pos} hint="المسجلة والنشطة" />
          <StatCard icon={Plug} label="أجهزة طرفية" value={stats.peripherals} hint="المفعلة في السجل" />
          <StatCard icon={AlertTriangle} label="أعطال مسجلة" value={stats.faults} hint="آخر اختبار فشل" />
          <StatCard icon={Laptop} label="جلسات مفتوحة" value={stats.activeSessions} hint="جلسات غير محظورة" />
        </div>

        <Tabs defaultValue="live" className="space-y-4">
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl border bg-white p-1.5 shadow-sm">
            <TabsTrigger value="live" className="rounded-xl">المتصل الآن</TabsTrigger>
            <TabsTrigger value="trusted" className="rounded-xl">الأجهزة الموثوقة</TabsTrigger>
            <TabsTrigger value="pos" className="rounded-xl">أجهزة POS</TabsTrigger>
            <TabsTrigger value="peripherals" className="rounded-xl">الطابعات والأجهزة الطرفية</TabsTrigger>
            <TabsTrigger value="android" className="rounded-xl">تشخيص Android</TabsTrigger>
          </TabsList>

          <TabsContent value="live" className="space-y-3">
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><Activity className="h-5 w-5 text-[#005931]" /> الأجهزة والجلسات التي تعمل على السيستم</CardTitle>
                <CardDescription>“متصل الآن” يعتمد على heartbeat من التطبيق، وليس مجرد وجود Refresh Token قديم.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {loading && data.sessions.length === 0 ? <div className="py-10 text-center text-slate-500">جاري تحميل الجلسات…</div> : null}
                {!loading && data.sessions.length === 0 ? <div className="py-10 text-center text-slate-500">لا توجد جلسات ظاهرة في النطاق الحالي.</div> : null}
                {data.sessions.map(session => (
                  <div key={session.session_id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/50 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-black text-slate-900">{session.employee_name || session.username || "مستخدم"}</div>
                        <StatusPill ok={session.online} yes="متصل الآن" no="غير نشط" />
                        {session.trusted && <Badge className="bg-[#005931]">موثوق</Badge>}
                        {session.blocked && <Badge variant="destructive">تم إنهاء الجلسة</Badge>}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>{session.device_name || `${session.platform || "جهاز"} • ${session.browser || "متصفح"}`}</span>
                        <span>{session.branch_name || "بدون فرع ظاهر"}</span>
                        <span>{session.current_route || "—"}</span>
                        <span>آخر ظهور: {ago(session.last_seen_at || session.refreshed_at)}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {session.blocked ? (
                        <Button size="sm" variant="outline" disabled={actionId === `session-${session.session_id}`} onClick={() => void runAction(`session-${session.session_id}`, () => unblockITSession(session.session_id, session.branch_id || currentBranchId), "تم السماح للجلسة مرة أخرى")}>إلغاء الحظر</Button>
                      ) : (
                        <Button size="sm" variant="destructive" disabled={actionId === `session-${session.session_id}`} onClick={() => handleEndSession(session.session_id, session.branch_id)}>إنهاء الجلسة</Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trusted" className="space-y-3">
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-[#005931]" /> الأجهزة الموثوقة واعتمادات الموظفين</CardTitle>
                <CardDescription>إلغاء الثقة لا يساوي إنهاء الجلسة: الجهاز يفقد امتياز “Trusted Device” بينما إدارة الجلسات تتم من تبويب المتصل الآن.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.trusted_devices.length === 0 && <div className="py-10 text-center text-slate-500">لا توجد أجهزة موظفين في النطاق الحالي.</div>}
                {data.trusted_devices.map(device => (
                  <div key={device.id} className="flex flex-col gap-3 rounded-2xl border p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Smartphone className="h-4 w-4 text-[#005931]" />
                        <div className="font-black">{device.device_name}</div>
                        <span className="text-sm text-slate-500">• {device.employee_name || device.username}</span>
                        {device.approval_status === "approved" && !device.revoked_at ? <Badge className="bg-emerald-600">معتمد</Badge> : null}
                        {device.approval_status === "pending" ? <Badge className="bg-amber-500">بانتظار الاعتماد</Badge> : null}
                        {device.approval_status === "rejected" ? <Badge variant="destructive">مرفوض</Badge> : null}
                        {device.revoked_at ? <Badge variant="outline">ملغي الثقة</Badge> : null}
                        <StatusPill ok={device.online} yes="Online" no="Offline" />
                      </div>
                      <div className="mt-2 text-xs text-slate-500">{device.branch_name || "—"} • {device.platform || "غير معروف"} • آخر ظهور {ago(device.last_seen_at)}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {device.approval_status === "pending" && (
                        <>
                          <Button size="sm" disabled={actionId === `trust-${device.id}`} onClick={() => void runAction(`trust-${device.id}`, () => approveStaffDevice(device.id), "تم اعتماد الجهاز")}>اعتماد</Button>
                          <Button size="sm" variant="outline" disabled={actionId === `trust-${device.id}`} onClick={() => {
                            const reason = window.prompt("سبب الرفض؟", "الجهاز غير معتمد");
                            if (reason) void runAction(`trust-${device.id}`, () => rejectStaffDevice(device.id, reason), "تم رفض الجهاز");
                          }}>رفض</Button>
                        </>
                      )}
                      {device.approval_status === "approved" && !device.revoked_at && (
                        <Button size="sm" variant="destructive" disabled={actionId === `trust-${device.id}`} onClick={() => handleRevoke(device.id)}><ShieldOff /> إلغاء الثقة</Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pos">
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><Cpu className="h-5 w-5 text-[#005931]" /> أجهزة نقاط البيع</CardTitle>
                <CardDescription>الأجهزة المسجلة في POS مع آخر ظهور وسياسة القفل والتنبيه النقدي.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {data.pos_devices.length === 0 && <div className="col-span-full py-10 text-center text-slate-500">لا توجد أجهزة POS مسجلة.</div>}
                {data.pos_devices.map(device => (
                  <div key={device.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-2"><div className="font-black">{device.name}</div><StatusPill ok={device.online} yes="Online" no="Offline" /></div>
                    <div className="mt-1 font-mono text-xs text-slate-400">{device.device_code}</div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl bg-slate-50 p-2"><span className="text-slate-400">الفرع</span><div className="mt-1 font-bold">{device.branch_name || "—"}</div></div>
                      <div className="rounded-xl bg-slate-50 p-2"><span className="text-slate-400">آخر ظهور</span><div className="mt-1 font-bold">{ago(device.last_seen_at)}</div></div>
                      <div className="rounded-xl bg-slate-50 p-2"><span className="text-slate-400">القفل</span><div className="mt-1 font-bold">{device.auto_lock_minutes ?? "—"} دقيقة</div></div>
                      <div className="rounded-xl bg-slate-50 p-2"><span className="text-slate-400">تنبيه النقدية</span><div className="mt-1 font-bold">{Number(device.cash_warning_threshold || 0).toFixed(0)} ج.م</div></div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="peripherals" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[0.9fr_1.5fr]">
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-lg">توصيل / تسجيل جهاز</CardTitle>
                  <CardDescription>سجّل الجهاز في الفرع ثم اختبر الوصول إليه. طلب USB/Bluetooth لا يتم إلا عند الضغط منك.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!currentBranchId && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">اختر فرعًا من الشريط العلوي قبل تسجيل جهاز طرفي.</div>}
                  <Input value={draft.name} onChange={e => setDraft(p => ({ ...p, name: e.target.value }))} placeholder="اسم الجهاز — مثال: طابعة كاشير 1" />
                  <div className="grid grid-cols-2 gap-2">
                    <select className="h-10 rounded-md border bg-white px-3 text-sm" value={draft.type} onChange={e => setDraft(p => ({ ...p, type: e.target.value as ITPeripheralType }))}>
                      {Object.entries(peripheralTypeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <select className="h-10 rounded-md border bg-white px-3 text-sm" value={draft.connection} onChange={e => setDraft(p => ({ ...p, connection: e.target.value as ITConnectionType }))}>
                      {Object.entries(connectionLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2"><Input inputMode="numeric" value={draft.vendorId} onChange={e => setDraft(p => ({ ...p, vendorId: e.target.value }))} placeholder="Vendor ID (اختياري)" /><Input inputMode="numeric" value={draft.productId} onChange={e => setDraft(p => ({ ...p, productId: e.target.value }))} placeholder="Product ID (اختياري)" /></div>
                  <Input value={draft.serialNumber} onChange={e => setDraft(p => ({ ...p, serialNumber: e.target.value }))} placeholder="Serial Number (اختياري)" />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => void detectUSB()}><Usb /> اكتشاف USB</Button>
                    <Button variant="outline" onClick={() => void detectSerial()}><Plug /> إذن Serial</Button>
                    <Button variant="outline" onClick={() => void bluetoothPrinterService.connectPrinter()}><Bluetooth /> ربط طابعة BLE</Button>
                  </div>
                  <Button className="w-full bg-[#005931] hover:bg-[#004827]" disabled={!currentBranchId || actionId === "new-peripheral"} onClick={() => void savePeripheral()}>حفظ في سجل الأجهزة</Button>
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardHeader><CardTitle className="text-lg">الأجهزة الطرفية المسجلة</CardTitle><CardDescription>آخر نتيجة اختبار تُحفظ مركزيًا ليسهل معرفة الجهاز الذي به مشكلة.</CardDescription></CardHeader>
                <CardContent className="space-y-2">
                  {data.peripherals.length === 0 && <div className="py-10 text-center text-slate-500">لم يتم تسجيل أجهزة طرفية لهذا النطاق بعد.</div>}
                  {data.peripherals.map(peripheral => (
                    <div key={peripheral.id} className="flex flex-col gap-3 rounded-2xl border p-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          {peripheral.peripheral_type === "printer" ? <Printer className="h-4 w-4 text-[#005931]" /> : peripheral.peripheral_type === "scale" ? <Gauge className="h-4 w-4 text-[#005931]" /> : <Barcode className="h-4 w-4 text-[#005931]" />}
                          <strong>{peripheral.name}</strong>
                          <Badge variant="outline">{peripheralTypeLabel[peripheral.peripheral_type]}</Badge>
                          <Badge variant="outline">{connectionLabel[peripheral.connection_type]}</Badge>
                          <StatusPill ok={peripheral.active} />
                          {peripheral.last_test_status === "success" && <Badge className="bg-emerald-600">اختبار ناجح</Badge>}
                          {peripheral.last_test_status === "warning" && <Badge className="bg-amber-500">يحتاج إعداد</Badge>}
                          {peripheral.last_test_status === "failed" && <Badge variant="destructive">اختبار فاشل</Badge>}
                        </div>
                        <div className="mt-2 text-xs text-slate-500">{peripheral.branch_name || "—"} • آخر اختبار {ago(peripheral.last_test_at)} {peripheral.last_error ? `• ${peripheral.last_error}` : ""}</div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" disabled={actionId === `peripheral-${peripheral.id}`} onClick={() => void testPeripheral(peripheral)}>اختبار</Button>
                        <Button size="sm" variant={peripheral.active ? "destructive" : "default"} disabled={actionId === `peripheral-${peripheral.id}`} onClick={() => void runAction(`peripheral-${peripheral.id}`, () => setITPeripheralActive(peripheral.id, peripheral.branch_id, !peripheral.active), peripheral.active ? "تم تعطيل الجهاز" : "تم تفعيل الجهاز")}>{peripheral.active ? "تعطيل" : "تفعيل"}</Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="rounded-2xl">
                <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ScanLine className="h-5 w-5" /> اختبار قارئ الباركود</CardTitle><CardDescription>قارئات USB التي تعمل Keyboard/HID لا تحتاج Driver داخل الويب؛ ضع المؤشر هنا وامسح باركود.</CardDescription></CardHeader>
                <CardContent>
                  <Input autoComplete="off" autoFocus={false} value={scannerCode} onChange={e => setScannerCode(e.target.value)} onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const code = scannerCode.trim();
                      setScannerResult(code ? `وصل الباركود بنجاح: ${code}` : "لم يصل كود");
                      setScannerCode("");
                    }
                  }} placeholder="امسح الباركود هنا ثم Enter" />
                  {scannerResult && <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{scannerResult}</div>}
                </CardContent>
              </Card>
              <Card className="rounded-2xl">
                <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Gauge className="h-5 w-5" /> اختبار باركود الميزان</CardTitle><CardDescription>اختبار صيغة الميزان الموجودة بالفعل في POS (PLU + وزن داخل الباركود) قبل محاولة توصيل ميزان مباشر.</CardDescription></CardHeader>
                <CardContent>
                  <div className="flex gap-2"><Input value={scaleCode} onChange={e => setScaleCode(e.target.value)} onKeyDown={e => e.key === "Enter" && void testScaleBarcode()} placeholder="مثال: 020034010005" /><Button onClick={() => void testScaleBarcode()}>اختبار</Button></div>
                  {scaleResult && <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">{scaleResult}</div>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="android" className="space-y-4">
            <Card className="rounded-2xl overflow-hidden">
              <CardHeader className="border-b bg-slate-50/60">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div><CardTitle className="flex items-center gap-2 text-lg"><Smartphone className="h-5 w-5 text-[#005931]" /> تشخيص الجهاز والمتصفح</CardTitle><CardDescription className="mt-1">{detectPlatform()} • {detectBrowser()} • {navigator.userAgent}</CardDescription></div>
                  <Button variant="outline" onClick={() => setCapabilities(getITCapabilities())}><RefreshCw /> إعادة الفحص</Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-2 p-4 md:grid-cols-2 xl:grid-cols-3">
                <CapabilityRow label="اتصال الإنترنت" ok={capabilities.online} note={capabilities.online ? "الجهاز Online" : "التطبيق قد يعمل جزئيًا لكن المزامنة متوقفة"} />
                <CapabilityRow label="HTTPS / Secure Context" ok={capabilities.secureContext} note="مطلوب لميزات Bluetooth/USB/Camera الحساسة" />
                <CapabilityRow label="Bluetooth" ok={capabilities.bluetooth} note="مفيد للطابعات BLE المدعومة" />
                <CapabilityRow label="WebUSB" ok={capabilities.usb} note="على Android سيظهر طلب إذن للنظام عند اختيار الجهاز" />
                <CapabilityRow label="Web Serial" ok={capabilities.serial} note="الدعم أضعف على Android؛ لا نعتمد عليه وحده للموازين" />
                <CapabilityRow label="HID API" ok={capabilities.hid} note="قارئ Keyboard-wedge يظل يعمل حتى بدون WebHID" />
                <CapabilityRow label="الكاميرا" ok={capabilities.camera} note="لفحص الباركود بالكاميرا" />
                <CapabilityRow label="BarcodeDetector" ok={capabilities.barcodeDetector} note="عند عدم توفره يمكن استخدام القارئ الخارجي" />
                <CapabilityRow label="PWA / Standalone" ok={capabilities.standalone} note="اختياري؛ يقلل مشاكل شريط المتصفح على أجهزة Android المخصصة" />
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="rounded-2xl"><CardHeader><CardTitle className="text-base">قارئ الباركود</CardTitle></CardHeader><CardContent className="text-sm leading-7 text-slate-600">الأكثر استقرارًا هو قارئ USB/Bluetooth يعمل كلوحة مفاتيح HID. لا يحتاج بروتوكول خاص، والـPOS يقرأ الكود مباشرة.</CardContent></Card>
              <Card className="rounded-2xl"><CardHeader><CardTitle className="text-base">الميزان</CardTitle></CardHeader><CardContent className="text-sm leading-7 text-slate-600">لو الميزان يطبع باركود وزن فالمسار الحالي مدعوم بالفعل وهو الأنسب للويب وAndroid. القراءة المباشرة USB/Serial تحتاج معرفة موديل الميزان وبروتوكوله قبل تفعيلها كمسار إنتاجي.</CardContent></Card>
              <Card className="rounded-2xl"><CardHeader><CardTitle className="text-base">الطابعة</CardTitle></CardHeader><CardContent className="text-sm leading-7 text-slate-600">طابعة BLE المدعومة يمكن اختبارها من المركز. لو الـBLE characteristic غير متوافق، النظام يظل لديه fallback لنافذة طباعة النظام بدل تعطيل البيع.</CardContent></Card>
            </div>

            {capabilities.android && !capabilities.serial && (
              <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div><strong>Android detected:</strong> عدم وجود Web Serial هنا ليس عطلًا في السيستم. للأجهزة التي تحتاج Serial مباشر سنستخدم WebUSB عند توافق الجهاز، أو لاحقًا Android hardware bridge مخصص إذا الموديل يحتاج Driver/Protocol خاص.</div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-6 text-slate-500">
          {navigator.onLine ? <Wifi className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
          <div>آخر تحديث للمركز: {data.generated_at ? new Date(data.generated_at).toLocaleString("ar-EG") : "—"}. حالة الأجهزة الحية تعتبر Online عند وصول heartbeat حديث؛ الجلسات القديمة لا تُعرض كمتصلة لمجرد وجودها في Auth.</div>
        </div>
      </div>
    </MainLayout>
  );
}

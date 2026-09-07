import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CircleAlert, Clock3, MonitorSmartphone, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useBranchStore } from "@/stores/branchStore";
import { listBranchPosOperationalEvents, type PosOperationalEvent, type PosOperationalSeverity } from "@/services/supabase/posDiagnosticsService";
import { listPosDevices, type PosDevice } from "@/services/supabase/posDeviceService";

const severityMeta: Record<PosOperationalSeverity, { label: string; className: string }> = {
  info: { label: "معلومة", className: "bg-slate-100 text-slate-700" },
  warning: { label: "تحذير", className: "bg-amber-100 text-amber-800" },
  error: { label: "خطأ", className: "bg-red-100 text-red-800" },
  critical: { label: "حرج", className: "bg-red-600 text-white" },
};

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} س`;
  return new Date(value).toLocaleString("ar-EG");
}

function friendlyEventType(value: string) {
  if (value === "checkout_retry") return "إعادة محاولة حفظ البيع";
  if (value === "checkout_error") return "خطأ في إتمام البيع";
  return value.replaceAll("_", " ");
}

function deviceOnline(device: PosDevice) {
  if (!device.active || !device.last_seen_at) return false;
  return Date.now() - new Date(device.last_seen_at).getTime() <= 45_000;
}

export default function PosHealthSettings() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [events, setEvents] = useState<PosOperationalEvent[]>([]);
  const [devices, setDevices] = useState<PosDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | PosOperationalSeverity>("all");
  const [error, setError] = useState<string | null>(null);

  const load = async (quiet = false) => {
    if (!currentBranchId) return;
    if (!quiet) setLoading(true);
    try {
      const [eventRows, deviceRows] = await Promise.all([
        listBranchPosOperationalEvents(currentBranchId, null, 100),
        listPosDevices(currentBranchId),
      ]);
      setEvents(eventRows);
      setDevices(deviceRows);
      setError(null);
    } catch (e: any) {
      if (!quiet) setError(e.message || "تعذر تحميل صحة POS");
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [currentBranchId]);
  useEffect(() => {
    if (!currentBranchId) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [currentBranchId]);

  const last24h = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return events.filter(event => new Date(event.created_at).getTime() >= cutoff);
  }, [events]);
  const filteredEvents = useMemo(
    () => filter === "all" ? events : events.filter(event => event.severity === filter),
    [events, filter],
  );
  const errors24h = last24h.filter(event => event.severity === "error" || event.severity === "critical").length;
  const warnings24h = last24h.filter(event => event.severity === "warning").length;
  const affectedDevices = new Set(last24h.map(event => event.device_id).filter(Boolean)).size;
  const onlineDevices = devices.filter(deviceOnline).length;
  const activeDevices = devices.filter(device => device.active).length;
  const healthy = errors24h === 0 && warnings24h === 0;

  if (!currentBranchId) return <Alert><AlertDescription>اختار فرع العمل الأول.</AlertDescription></Alert>;

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">صحة POS</h2>
          <p className="mt-1 text-sm text-muted-foreground">{currentBranchName || "الفرع الحالي"} · حالة الأجهزة والأحداث التقنية المهمة لنقطة البيع.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> تحديث
        </Button>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card className={healthy ? "border-emerald-200 bg-emerald-50/40" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">{healthy ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : <Activity className="h-4 w-4" />} الحالة آخر 24 ساعة</div>
            <div className={`mt-2 text-xl font-black ${healthy ? "text-emerald-700" : "text-slate-900"}`}>{healthy ? "مستقرة" : "تحتاج متابعة"}</div>
          </CardContent>
        </Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><MonitorSmartphone className="h-4 w-4 text-emerald-600" /> أجهزة Online</div><div className="mt-2 text-2xl font-black">{onlineDevices}<span className="mr-1 text-sm font-normal text-muted-foreground">/ {activeDevices}</span></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><CircleAlert className="h-4 w-4 text-red-600" /> أخطاء</div><div className="mt-2 text-2xl font-black">{errors24h}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><AlertTriangle className="h-4 w-4 text-amber-600" /> تحذيرات</div><div className="mt-2 text-2xl font-black">{warnings24h}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Activity className="h-4 w-4" /> أجهزة بها أحداث</div><div className="mt-2 text-2xl font-black">{affectedDevices}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">حالة أجهزة الفرع</CardTitle>
          <CardDescription>Online يعني إن الجهاز أرسل Heartbeat خلال آخر 45 ثانية.</CardDescription>
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <div className="rounded-2xl border border-dashed py-8 text-center text-sm text-muted-foreground">مفيش أجهزة POS مسجلة على الفرع.</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {devices.map(device => {
                const online = deviceOnline(device);
                return (
                  <div key={device.device_id} className={`rounded-2xl border p-4 ${online ? "border-emerald-200 bg-emerald-50/30" : "bg-white"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold">{device.device_name}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{device.device_code}</div>
                      </div>
                      <Badge className={online ? "bg-emerald-600" : device.active ? "bg-slate-500" : "bg-red-600"}>{online ? "Online" : device.active ? "غير متصل" : "ملغي"}</Badge>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1"><UserRound className="h-3.5 w-3.5" /> {device.current_employee_name || "لا توجد وردية مفتوحة"}</div>
                      <div className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {device.last_seen_at ? `آخر اتصال ${relativeTime(device.last_seen_at)}` : "لم يتصل بعد"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2 overflow-x-auto">
        {([['all','الكل'],['warning','تحذيرات'],['error','أخطاء'],['critical','حرجة']] as const).map(([id,label]) => (
          <Button key={id} size="sm" variant={filter === id ? "default" : "outline"} className={filter === id ? "bg-[#005931] hover:bg-[#004a29]" : ""} onClick={() => setFilter(id)}>{label}</Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">الأحداث الأخيرة</CardTitle>
          <CardDescription>السجل لا يحتوي PIN أو Device Token أو كلمات مرور. الهدف منه تشخيص الأعطال فقط.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" /> جاري تحميل الأحداث</div>
          ) : filteredEvents.length === 0 ? (
            <div className="rounded-2xl border border-dashed py-12 text-center text-sm text-muted-foreground">
              <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-emerald-600" /> مفيش أحداث مطابقة للفِلتر الحالي.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEvents.map(event => {
                const meta = severityMeta[event.severity];
                return (
                  <div key={event.id} className="rounded-2xl border bg-white p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold">{friendlyEventType(event.event_type)}</span>
                          <Badge className={meta.className}>{meta.label}</Badge>
                          {event.message_code && <code className="max-w-full truncate rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">{event.message_code}</code>}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><MonitorSmartphone className="h-3.5 w-3.5" /> {event.device_name || "جهاز غير معروف"}{event.device_code ? ` · ${event.device_code}` : ""}</span>
                          <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" /> {event.employee_name || "موظف غير معروف"}</span>
                          <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {relativeTime(event.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

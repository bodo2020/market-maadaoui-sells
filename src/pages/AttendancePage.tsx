import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Crosshair,
  History,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBranchStore } from "@/stores/branchStore";
import {
  AttendanceActionResult,
  AttendanceMode,
  checkInAttendance,
  checkOutAttendance,
  getBrowserLocation,
  getMyAttendance,
} from "@/services/attendanceService";
import { getLocalTrustedStaffDevice } from "@/services/staffDeviceService";

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
};

const formatTime = (value?: string | null) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-EG", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
};

const formatDuration = (minutes?: number | null) => {
  const total = Math.max(0, Number(minutes || 0));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (!hours) return `${mins.toLocaleString("ar-EG")} دقيقة`;
  return `${hours.toLocaleString("ar-EG")} س ${mins.toLocaleString("ar-EG")} د`;
};

const modeMeta: Record<AttendanceMode, { label: string; description: string }> = {
  onsite: { label: "من الفرع", description: "يتم التحقق من موقع الجهاز داخل نطاق الفرع." },
  remote: { label: "عن بُعد", description: "لا يوجد تتبع موقع مستمر؛ يتم تسجيل بداية ونهاية العمل فقط." },
  field: { label: "ميداني", description: "مخصص للموظفين الذين يعملون خارج الفرع حسب سياسة الشركة." },
};

function allowedModes(workMode?: "onsite" | "remote" | "hybrid" | "field"): AttendanceMode[] {
  if (workMode === "remote") return ["remote"];
  if (workMode === "field") return ["field"];
  if (workMode === "hybrid") return ["onsite", "remote"];
  return ["onsite"];
}

export default function AttendancePage() {
  const navigate = useNavigate();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const trustedDevice = getLocalTrustedStaffDevice();
  const [mode, setMode] = useState<AttendanceMode>("onsite");
  const [outsideResult, setOutsideResult] = useState<AttendanceActionResult | null>(null);
  const [outsideLocation, setOutsideLocation] = useState<{ latitude: number; longitude: number; accuracyM: number } | null>(null);
  const [exceptionReason, setExceptionReason] = useState("");

  const attendanceQuery = useQuery({
    queryKey: ["my-attendance-v1", currentBranchId],
    queryFn: () => getMyAttendance(currentBranchId || null),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const data = attendanceQuery.data;
  const modes = useMemo(() => allowedModes(data?.employee?.work_mode), [data?.employee?.work_mode]);
  const effectiveMode = modes.includes(mode) ? mode : modes[0] || "onsite";
  const activeSession = data?.active_session;

  const getLocationForMode = async (attendanceMode: AttendanceMode) => {
    const needsLocation = attendanceMode === "onsite" || (attendanceMode === "field" && data?.policy?.require_location_for_field);
    if (!needsLocation) return null;
    return getBrowserLocation();
  };

  const checkInMutation = useMutation({
    mutationFn: async ({ reason, knownLocation }: { reason?: string; knownLocation?: typeof outsideLocation }) => {
      if (!data) throw new Error("بيانات الحضور غير جاهزة");
      const location = knownLocation || await getLocationForMode(effectiveMode);
      const result = await checkInAttendance({
        branchId: data.branch_id,
        mode: effectiveMode,
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        accuracyM: location?.accuracyM ?? null,
        exceptionReason: reason || null,
      });
      return { result, location };
    },
    onSuccess: async ({ result, location }) => {
      if (result.ok) {
        toast.success(result.exception_id ? "تم إرسال طلب الاستثناء للمراجعة" : "تم تسجيل الحضور بنجاح");
        setOutsideResult(null);
        setOutsideLocation(null);
        setExceptionReason("");
        await attendanceQuery.refetch();
        return;
      }

      if (result.exception_allowed && location) {
        setOutsideResult(result);
        setOutsideLocation(location);
        return;
      }

      const messages: Record<string, string> = {
        LOCATION_REQUIRED: "يلزم تشغيل GPS لتسجيل الحضور.",
        LOCATION_ACCURACY_TOO_LOW: "دقة الموقع غير كافية. اقترب من مكان مفتوح وحاول مرة أخرى.",
        OUTSIDE_GEOFENCE: "أنت خارج نطاق الحضور المسموح للفرع.",
        TRUSTED_DEVICE_REQUIRED: "يلزم تفعيل هذا الجهاز كجهاز موثوق أولًا.",
        ACTIVE_SESSION_EXISTS: "لديك حضور مفتوح بالفعل.",
      };
      toast.error(messages[result.code] || "تعذر تسجيل الحضور. راجع البيانات وحاول مرة أخرى.");
    },
    onError: error => toast.error(error instanceof Error ? error.message : "تعذر تسجيل الحضور"),
  });

  const checkOutMutation = useMutation({
    mutationFn: async () => {
      if (!activeSession) throw new Error("لا توجد جلسة حضور مفتوحة");
      const location = await getLocationForMode(activeSession.attendance_mode);
      return checkOutAttendance({
        sessionId: activeSession.id,
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        accuracyM: location?.accuracyM ?? null,
      });
    },
    onSuccess: async result => {
      if (!result.ok) {
        toast.error("تعذر تسجيل الانصراف. راجع الموقع والجهاز وحاول مرة أخرى.");
        return;
      }
      toast.success(`تم تسجيل الانصراف · مدة العمل ${formatDuration(result.worked_minutes)}`);
      await attendanceQuery.refetch();
    },
    onError: error => toast.error(error instanceof Error ? error.message : "تعذر تسجيل الانصراف"),
  });

  const submitException = () => {
    if (!outsideLocation || !outsideResult) return;
    if (exceptionReason.trim().length < 5) {
      toast.error("اكتب سببًا واضحًا لطلب الحضور خارج النطاق.");
      return;
    }
    checkInMutation.mutate({ reason: exceptionReason.trim(), knownLocation: outsideLocation });
  };

  if (attendanceQuery.isLoading) {
    return <MainLayout><div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-9 w-9 animate-spin text-[#005931]" /></div></MainLayout>;
  }

  if (attendanceQuery.isError || !data) {
    return <MainLayout><div dir="rtl" className="mx-auto max-w-2xl py-16"><Card className="border-red-200"><CardContent className="p-8 text-center"><AlertTriangle className="mx-auto h-9 w-9 text-red-600" /><h2 className="mt-3 text-lg font-black">تعذر تحميل نظام الحضور</h2><p className="mt-2 text-sm text-muted-foreground">{attendanceQuery.error instanceof Error ? attendanceQuery.error.message : "راجع حساب الموظف والفرع الحالي."}</p><Button className="mt-5" variant="outline" onClick={() => attendanceQuery.refetch()}>إعادة المحاولة</Button></CardContent></Card></div></MainLayout>;
  }

  const deviceMatchesEmployee = Boolean(trustedDevice && trustedDevice.employee_id === data.employee.user_id);
  const requiresTrustedDevice = data.policy.require_trusted_device;
  const deviceReady = !requiresTrustedDevice || deviceMatchesEmployee;

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-6xl space-y-5 py-5">
        <section className="overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="bg-gradient-to-l from-[#005931] to-[#087847] p-6 text-white md:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2"><Clock3 className="h-6 w-6" /><h1 className="text-2xl font-black">الحضور والانصراف</h1></div>
                <p className="mt-2 text-sm text-emerald-50">{currentBranchName || "فرع العمل"} · تسجيل آمن من جهاز الموظف الموثوق.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className="border-white/20 bg-white/10 text-white hover:bg-white/10">{data.employee.work_mode === "onsite" ? "من مقر العمل" : data.employee.work_mode === "remote" ? "عن بُعد" : data.employee.work_mode === "hybrid" ? "هجين" : "ميداني"}</Badge>
                <Button size="sm" variant="secondary" onClick={() => attendanceQuery.refetch()} disabled={attendanceQuery.isFetching}><RefreshCw className={`ml-2 h-4 w-4 ${attendanceQuery.isFetching ? "animate-spin" : ""}`} />تحديث</Button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-5 md:grid-cols-3 md:p-6">
            <div className={`rounded-2xl border p-4 ${deviceReady ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
              <div className="flex items-center gap-2"><Smartphone className={`h-5 w-5 ${deviceReady ? "text-emerald-700" : "text-amber-700"}`} /><span className="font-black">الجهاز</span></div>
              <div className="mt-2 text-sm">{deviceReady ? trustedDevice?.device_name || "لا يشترط جهاز موثوق" : "هذا الجهاز غير مفعّل للموظف الحالي"}</div>
              {!deviceReady && <Button className="mt-3" size="sm" variant="outline" onClick={() => navigate("/staff-device/activate")}>تفعيل الجهاز</Button>}
            </div>
            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="flex items-center gap-2"><Crosshair className="h-5 w-5 text-[#005931]" /><span className="font-black">نطاق الفرع</span></div>
              <div className="mt-2 text-sm">{Number(data.policy.geofence_radius_m).toLocaleString("ar-EG")} متر</div>
              <div className="mt-1 text-xs text-muted-foreground">أقصى خطأ GPS: {Number(data.policy.max_location_accuracy_m).toLocaleString("ar-EG")} متر</div>
            </div>
            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-[#005931]" /><span className="font-black">وردية اليوم</span></div>
              {data.schedule ? <><div className="mt-2 text-sm font-bold">{data.schedule.name_ar}</div><div className="mt-1 text-xs text-muted-foreground">{formatTime(data.schedule.scheduled_start_at)} — {formatTime(data.schedule.scheduled_end_at)}</div></> : <div className="mt-2 text-sm text-muted-foreground">لا توجد وردية مجدولة اليوم</div>}
            </div>
          </div>
        </section>

        {data.pending_exception && (
          <Card className="border-amber-200 bg-amber-50/70">
            <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
              <div><div className="flex items-center gap-2 font-black text-amber-900"><AlertTriangle className="h-5 w-5" />طلب حضور خارج النطاق قيد المراجعة</div><p className="mt-1 text-sm text-amber-800">أُرسل {formatDateTime(data.pending_exception.requested_at)}{data.pending_exception.distance_m != null ? ` · المسافة ${Math.round(data.pending_exception.distance_m).toLocaleString("ar-EG")} م` : ""}</p><p className="mt-1 text-xs text-amber-700">{data.pending_exception.reason}</p></div>
              <Badge variant="outline" className="w-fit border-amber-300 bg-white text-amber-800">بانتظار المدير</Badge>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
          <Card className={activeSession ? "border-emerald-200" : ""}>
            <CardHeader>
              <CardTitle>{activeSession ? "أنت مسجل حضور حاليًا" : "تسجيل بداية العمل"}</CardTitle>
              <CardDescription>{activeSession ? `بدأت ${formatDateTime(activeSession.check_in_at)}` : "اختر نمط العمل المتاح لك ثم سجل الحضور."}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {activeSession ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-emerald-50 p-4"><div className="text-xs text-emerald-700">وقت الحضور</div><div className="mt-1 text-xl font-black text-emerald-950">{formatTime(activeSession.check_in_at)}</div></div>
                    <div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs text-muted-foreground">نمط الحضور</div><div className="mt-1 font-black">{modeMeta[activeSession.attendance_mode]?.label || activeSession.attendance_mode}</div></div>
                    <div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs text-muted-foreground">التأخير</div><div className="mt-1 font-black">{formatDuration(activeSession.late_minutes)}</div></div>
                  </div>
                  <Button size="lg" variant="destructive" className="w-full" disabled={checkOutMutation.isPending || !deviceReady} onClick={() => checkOutMutation.mutate()}>{checkOutMutation.isPending ? <Loader2 className="ml-2 h-5 w-5 animate-spin" /> : <LogOut className="ml-2 h-5 w-5" />}تسجيل الانصراف</Button>
                </>
              ) : (
                <>
                  {modes.length > 1 && <div className="space-y-2"><Label>نمط العمل اليوم</Label><Select value={effectiveMode} onValueChange={value => setMode(value as AttendanceMode)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{modes.map(item => <SelectItem key={item} value={item}>{modeMeta[item].label}</SelectItem>)}</SelectContent></Select></div>}
                  <div className="rounded-2xl border bg-slate-50 p-4 text-sm"><div className="font-bold">{modeMeta[effectiveMode].label}</div><p className="mt-1 text-muted-foreground">{modeMeta[effectiveMode].description}</p></div>
                  {!deviceReady && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><ShieldCheck className="mb-2 h-5 w-5" />الحضور متوقف على هذا الجهاز حتى يتم تفعيله للموظف الحالي.</div>}
                  <Button size="lg" className="w-full bg-[#005931] hover:bg-[#004426]" disabled={checkInMutation.isPending || !deviceReady || Boolean(data.pending_exception)} onClick={() => checkInMutation.mutate({})}>{checkInMutation.isPending ? <Loader2 className="ml-2 h-5 w-5 animate-spin" /> : effectiveMode === "remote" ? <LogIn className="ml-2 h-5 w-5" /> : <MapPin className="ml-2 h-5 w-5" />}تسجيل الحضور</Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-[#005931]" />آخر الحضور</CardTitle><CardDescription>آخر الجلسات المسجلة لهذا الموظف.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {data.recent_sessions.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا يوجد سجل حضور بعد.</div> : data.recent_sessions.slice(0, 6).map(session => (
                <div key={session.id} className="rounded-2xl border p-3">
                  <div className="flex items-start justify-between gap-3"><div><div className="font-bold">{session.branch_name}</div><div className="mt-1 text-xs text-muted-foreground">{formatDateTime(session.check_in_at)}</div></div><Badge variant="outline" className={session.status === "closed" ? "border-slate-200" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>{session.status === "closed" ? "مكتملة" : "مفتوحة"}</Badge></div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground"><span>{modeMeta[session.attendance_mode]?.label || session.attendance_mode}</span>{session.worked_minutes != null && <span>المدة: {formatDuration(session.worked_minutes)}</span>}{session.late_minutes > 0 && <span className="text-amber-700">تأخير: {formatDuration(session.late_minutes)}</span>}{session.early_departure_minutes > 0 && <span className="text-red-700">انصراف مبكر: {formatDuration(session.early_departure_minutes)}</span>}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={Boolean(outsideResult)} onOpenChange={open => { if (!open && !checkInMutation.isPending) { setOutsideResult(null); setOutsideLocation(null); setExceptionReason(""); } }}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle>أنت خارج نطاق الفرع</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><div className="flex items-center gap-2 font-black"><MapPin className="h-5 w-5" />طلب استثناء حضور</div><p className="mt-2 text-sm">المسافة التقريبية من الفرع: <b>{Math.round(Number(outsideResult?.distance_m || 0)).toLocaleString("ar-EG")} متر</b>، والنطاق المسموح {Math.round(Number(outsideResult?.radius_m || data.policy.geofence_radius_m)).toLocaleString("ar-EG")} متر.</p></div>
            <div className="space-y-2"><Label>سبب الحضور من خارج النطاق</Label><Textarea autoFocus rows={4} value={exceptionReason} onChange={event => setExceptionReason(event.target.value)} placeholder="مثال: تكليف ميداني من المدير / استلام طلب خارج الفرع..." /></div>
            <p className="text-xs leading-5 text-muted-foreground">لن يتم اعتبارك حاضرًا تلقائيًا. سيتم إرسال الطلب إلى مركز الموافقات، وإذا اعتمده المسؤول تُحسب بداية الحضور من وقت المحاولة الأصلية.</p>
          </div>
          <DialogFooter className="gap-2 sm:justify-start"><Button variant="outline" disabled={checkInMutation.isPending} onClick={() => { setOutsideResult(null); setOutsideLocation(null); setExceptionReason(""); }}>إلغاء</Button><Button disabled={checkInMutation.isPending} onClick={submitException}>{checkInMutation.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="ml-2 h-4 w-4" />}إرسال للموافقة</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

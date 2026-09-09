import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Clock3,
  History,
  Loader2,
  ShieldCheck,
  Smartphone,
  UserRound,
  WalletCards,
} from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { fetchEmployeeSalaries } from "@/services/supabase/salaryService";
import { getMyAttendance } from "@/services/attendanceService";
import { getLocalTrustedStaffDevice } from "@/services/staffDeviceService";
import { siteConfig } from "@/config/site";

const monthNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

const money = (value?: number | null) => `${Number(value || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${siteConfig.currency}`;

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
};

export default function MyHRPortalPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const trustedDevice = getLocalTrustedStaffDevice();

  const attendanceQuery = useQuery({
    queryKey: ["my-hr-attendance", currentBranchId],
    enabled: Boolean(user?.id),
    queryFn: () => getMyAttendance(currentBranchId || null),
  });

  const salaryQuery = useQuery({
    queryKey: ["my-payroll", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchEmployeeSalaries(user!.id),
  });

  const salarySummary = useMemo(() => {
    const rows = salaryQuery.data || [];
    return {
      total: rows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      paid: rows.filter(row => row.status === "paid").reduce((sum, row) => sum + Number(row.amount || 0), 0),
      pending: rows.filter(row => row.status === "pending").reduce((sum, row) => sum + Number(row.amount || 0), 0),
      latest: rows[0] || null,
    };
  }, [salaryQuery.data]);

  const attendance = attendanceQuery.data;
  const deviceReady = Boolean(trustedDevice && trustedDevice.employee_id === user?.id);

  if (!user) return null;

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-7xl space-y-5 py-5">
        <section className="overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="bg-gradient-to-l from-[#005931] to-[#087847] p-6 text-white md:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2"><UserRound className="h-7 w-7" /><h1 className="text-2xl font-black">بوابة الموظف</h1></div>
                <p className="mt-2 text-sm text-emerald-50">مرحبًا {user.name} · {currentBranchName || "فرع العمل"}</p>
              </div>
              <Badge className="w-fit border-white/20 bg-white/10 px-3 py-1.5 text-white hover:bg-white/10">{user.role}</Badge>
            </div>
          </div>

          <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4 md:p-6">
            <div className="rounded-2xl border bg-slate-50 p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="h-4 w-4 text-[#005931]" />حالة اليوم</div><div className="mt-2 text-lg font-black">{attendanceQuery.isLoading ? "جاري التحميل..." : attendance?.active_session ? "مسجل حضور" : attendance?.pending_exception ? "استثناء قيد المراجعة" : "لم يسجل حضور"}</div></div>
            <div className="rounded-2xl border bg-slate-50 p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Smartphone className="h-4 w-4 text-[#005931]" />الجهاز الموثوق</div><div className="mt-2 text-lg font-black">{deviceReady ? "مفعّل" : "غير مفعّل"}</div></div>
            <div className="rounded-2xl border bg-slate-50 p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><WalletCards className="h-4 w-4 text-[#005931]" />آخر راتب</div><div className="mt-2 text-lg font-black">{salaryQuery.isLoading ? "جاري التحميل..." : salarySummary.latest ? money(salarySummary.latest.amount) : "لا يوجد"}</div></div>
            <div className="rounded-2xl border bg-slate-50 p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><BadgeCheck className="h-4 w-4 text-[#005931]" />حالة آخر راتب</div><div className="mt-2 text-lg font-black">{salarySummary.latest ? salarySummary.latest.status === "paid" ? "مدفوع" : "معلق" : "—"}</div></div>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-[#005931]" />الحضور اليوم</CardTitle><CardDescription>حالة الحضور والوردية الحالية من نظام Attendance الجديد.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {attendanceQuery.isLoading ? <div className="flex min-h-36 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#005931]" /></div> : attendanceQuery.isError ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">تعذر تحميل حالة الحضور.</div> : <>
                {attendance?.active_session ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-center gap-2 font-black text-emerald-900"><CheckCircle2 className="h-5 w-5" />أنت مسجل حضور</div><div className="mt-2 text-sm text-emerald-800">من {formatDateTime(attendance.active_session.check_in_at)} · {attendance.active_session.branch_name}</div></div> : attendance?.pending_exception ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="font-black text-amber-900">طلب الحضور خارج النطاق قيد المراجعة</div><div className="mt-1 text-sm text-amber-800">{formatDateTime(attendance.pending_exception.requested_at)}</div></div> : <div className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">لم يتم تسجيل حضور اليوم حتى الآن.</div>}
                {attendance?.schedule && <div className="rounded-2xl border p-4"><div className="text-xs text-muted-foreground">وردية اليوم</div><div className="mt-1 font-black">{attendance.schedule.name_ar}</div><div className="mt-1 text-xs text-muted-foreground">{formatDateTime(attendance.schedule.scheduled_start_at)} — {formatDateTime(attendance.schedule.scheduled_end_at)}</div></div>}
                <Button className="w-full bg-[#005931] hover:bg-[#004426]" onClick={() => navigate("/attendance")}><Clock3 className="ml-2 h-4 w-4" />فتح الحضور والانصراف</Button>
              </>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#005931]" />الجهاز والأمان</CardTitle><CardDescription>الحضور من الجهاز الشخصي لا يحتاج بيانات مدير أو Super Admin.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {deviceReady ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="font-black text-emerald-900">{trustedDevice?.device_name}</div><div className="mt-1 text-xs text-emerald-800">جهاز {trustedDevice?.device_type === "remote" ? "عن بُعد" : trustedDevice?.device_type === "shared" ? "مشترك" : "شخصي"} · موثوق منذ {formatDate(trustedDevice?.trusted_at)}</div></div> : <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="font-black text-amber-900">هذا الجهاز غير مفعّل</div><div className="mt-1 text-sm text-amber-800">اطلب من المسؤول Pairing ثم فعّل الجهاز مرة واحدة.</div></div>}
              {!deviceReady && <Button variant="outline" className="w-full" onClick={() => navigate("/staff-device/activate")}><Smartphone className="ml-2 h-4 w-4" />تفعيل الجهاز</Button>}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Banknote className="h-5 w-5 text-[#005931]" />رواتبي</CardTitle><CardDescription>بياناتك أنت فقط حسب صلاحيات RLS الحالية.</CardDescription></CardHeader>
          <CardContent>
            {salaryQuery.isLoading ? <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#005931]" /></div> : salaryQuery.isError ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">تعذر تحميل الرواتب.</div> : <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs text-muted-foreground">إجمالي السجلات</div><div className="mt-1 text-xl font-black">{money(salarySummary.total)}</div></div><div className="rounded-2xl bg-emerald-50 p-4"><div className="text-xs text-emerald-700">مدفوع</div><div className="mt-1 text-xl font-black text-emerald-950">{money(salarySummary.paid)}</div></div><div className="rounded-2xl bg-amber-50 p-4"><div className="text-xs text-amber-700">معلق</div><div className="mt-1 text-xl font-black text-amber-950">{money(salarySummary.pending)}</div></div></div>
              {(salaryQuery.data || []).length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد سجلات رواتب لهذا الحساب.</div> : <div className="space-y-2">{(salaryQuery.data || []).slice(0, 12).map(row => <div key={row.id} className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-black">راتب {monthNames[Math.max(0, Number(row.month) - 1)]} {Number(row.year).toLocaleString("ar-EG", { useGrouping: false })}</div><div className="mt-1 text-xs text-muted-foreground">{row.payment_date ? `تاريخ الدفع: ${formatDate(row.payment_date)}` : row.notes || "لم يتم تسجيل دفع بعد"}</div></div><div className="flex items-center gap-3"><div className="text-lg font-black">{money(row.amount)}</div><Badge variant="outline" className={row.status === "paid" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}>{row.status === "paid" ? "مدفوع" : "معلق"}</Badge></div></div>)}</div>}
            </div>}
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2 font-black"><History className="h-5 w-5 text-[#005931]" />طلبات الموارد البشرية</div><p className="mt-1 text-sm text-muted-foreground">الإجازات، السلف، وتصحيح الحضور ستكون هنا بنفس حساب الموظف وبمسار اعتماد موحد. لن يتم إظهار أزرار إرسال قبل تفعيل الـBackend الآمن.</p></div><Badge variant="outline">قيد التجهيز الآمن</Badge></CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock3, HandCoins, Loader2, Send, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useBranchStore } from "@/stores/branchStore";
import {
  cancelMyHrRequest,
  getMyHrRequests,
  isHrRequestBackendUnavailable,
  submitMyHrRequest,
  type HrAttendanceCorrectionType,
  type HrLeaveType,
  type HrRequest,
  type HrRequestType,
} from "@/services/hrRequestService";

const requestLabels: Record<HrRequestType, string> = {
  leave: "إجازة",
  salary_advance: "سلفة راتب",
  attendance_correction: "تصحيح حضور",
};

const statusLabels: Record<string, string> = {
  pending: "قيد الانتظار",
  in_review: "قيد المراجعة",
  approved: "معتمد",
  rejected: "مرفوض",
  cancelled: "ملغي",
  fulfilled: "تم التنفيذ",
};

const formatDateTime = (value?: string | null) => value ? new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "—";

function requestSummary(request: HrRequest) {
  const p = request.payload || {};
  if (request.request_type === "leave") return `${p.start_date || "—"} ← ${p.end_date || "—"}`;
  if (request.request_type === "salary_advance") return `${Number(p.amount || 0).toLocaleString("ar-EG")} ج.م · ${Number(p.repayment_months || 1).toLocaleString("ar-EG")} شهر`;
  return `${p.attendance_date || "—"} · ${p.correction_type || ""}`;
}

export default function HrRequestsSelfService() {
  const { currentBranchId } = useBranchStore();
  const [type, setType] = useState<HrRequestType>("leave");
  const [reason, setReason] = useState("");
  const [leaveType, setLeaveType] = useState<HrLeaveType>("annual");
  const [leaveFrom, setLeaveFrom] = useState("");
  const [leaveTo, setLeaveTo] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [repaymentMonths, setRepaymentMonths] = useState("1");
  const [attendanceDate, setAttendanceDate] = useState("");
  const [correctionType, setCorrectionType] = useState<HrAttendanceCorrectionType>("missed_check_in");
  const [requestedCheckIn, setRequestedCheckIn] = useState("");
  const [requestedCheckOut, setRequestedCheckOut] = useState("");

  const query = useQuery({
    queryKey: ["my-hr-requests-v1", currentBranchId],
    enabled: Boolean(currentBranchId),
    queryFn: () => getMyHrRequests(currentBranchId, 50),
    retry: false,
  });

  const unavailable = isHrRequestBackendUnavailable(query.error);

  const reset = () => {
    setReason(""); setLeaveFrom(""); setLeaveTo(""); setAdvanceAmount(""); setRepaymentMonths("1"); setAttendanceDate(""); setRequestedCheckIn(""); setRequestedCheckOut("");
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!currentBranchId) throw new Error("اختر فرع العمل أولًا.");
      if (reason.trim().length < 5) throw new Error("اكتب سببًا واضحًا للطلب.");
      if (type === "leave") {
        if (!leaveFrom || !leaveTo) throw new Error("حدد بداية ونهاية الإجازة.");
        return submitMyHrRequest(currentBranchId, type, { leave_type: leaveType, start_date: leaveFrom, end_date: leaveTo }, reason);
      }
      if (type === "salary_advance") {
        const amount = Number(advanceAmount);
        const months = Number(repaymentMonths);
        if (!Number.isFinite(amount) || amount <= 0) throw new Error("أدخل قيمة سلفة صحيحة.");
        return submitMyHrRequest(currentBranchId, type, { amount, repayment_months: months }, reason);
      }
      if (!attendanceDate) throw new Error("حدد يوم الحضور المطلوب تصحيحه.");
      return submitMyHrRequest(currentBranchId, type, {
        attendance_date: attendanceDate,
        correction_type: correctionType,
        requested_check_in: requestedCheckIn || null,
        requested_check_out: requestedCheckOut || null,
      }, reason);
    },
    onSuccess: async () => { toast.success("تم إرسال الطلب للمراجعة."); reset(); await query.refetch(); },
    onError: error => toast.error(error instanceof Error ? error.message : "تعذر إرسال الطلب"),
  });

  const cancelMutation = useMutation({
    mutationFn: cancelMyHrRequest,
    onSuccess: async () => { toast.success("تم إلغاء الطلب."); await query.refetch(); },
    onError: error => toast.error(error instanceof Error ? error.message : "تعذر إلغاء الطلب"),
  });

  if (query.isLoading) return <Card><CardContent className="flex min-h-44 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#005931]" /></CardContent></Card>;

  if (unavailable) {
    return <Card className="border-dashed"><CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2 font-black"><ShieldCheck className="h-5 w-5 text-[#005931]" />طلبات الموارد البشرية جاهزة في الواجهة</div><p className="mt-1 text-sm text-muted-foreground">الإجازات والسلف وتصحيح الحضور لن تُرسل قبل تفعيل الـBackend الآمن. لا توجد أي كتابة مباشرة على الجداول.</p></div><Badge variant="outline">Backend غير مفعّل</Badge></CardContent></Card>;
  }

  if (query.isError) return <Card className="border-red-200"><CardContent className="p-5 text-sm text-red-800">{query.error instanceof Error ? query.error.message : "تعذر تحميل طلبات الموارد البشرية."}</CardContent></Card>;

  const requests = query.data || [];

  return <Card>
    <CardHeader><CardTitle>طلبات الموارد البشرية</CardTitle><CardDescription>إجازة، سلفة، أو تصحيح حضور. كل طلب يمر بمراجعة ولا ينفذ ماليًا تلقائيًا.</CardDescription></CardHeader>
    <CardContent>
      <Tabs defaultValue="new" dir="rtl">
        <TabsList className="grid w-full max-w-md grid-cols-2"><TabsTrigger value="new">طلب جديد</TabsTrigger><TabsTrigger value="history">طلباتي ({requests.length.toLocaleString("ar-EG")})</TabsTrigger></TabsList>
        <TabsContent value="new" className="mt-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <button type="button" onClick={() => setType("leave")} className={`rounded-2xl border p-4 text-right ${type === "leave" ? "border-[#005931] bg-emerald-50" : ""}`}><CalendarDays className="h-5 w-5 text-[#005931]" /><div className="mt-2 font-black">طلب إجازة</div></button>
            <button type="button" onClick={() => setType("salary_advance")} className={`rounded-2xl border p-4 text-right ${type === "salary_advance" ? "border-[#005931] bg-emerald-50" : ""}`}><HandCoins className="h-5 w-5 text-[#005931]" /><div className="mt-2 font-black">طلب سلفة</div></button>
            <button type="button" onClick={() => setType("attendance_correction")} className={`rounded-2xl border p-4 text-right ${type === "attendance_correction" ? "border-[#005931] bg-emerald-50" : ""}`}><Clock3 className="h-5 w-5 text-[#005931]" /><div className="mt-2 font-black">تصحيح حضور</div></button>
          </div>

          {type === "leave" && <div className="grid gap-4 sm:grid-cols-3"><div><Label>نوع الإجازة</Label><Select value={leaveType} onValueChange={v => setLeaveType(v as HrLeaveType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="annual">سنوية</SelectItem><SelectItem value="casual">عارضة</SelectItem><SelectItem value="sick">مرضية</SelectItem><SelectItem value="unpaid">بدون أجر</SelectItem><SelectItem value="other">أخرى</SelectItem></SelectContent></Select></div><div><Label>من</Label><Input type="date" value={leaveFrom} onChange={e => setLeaveFrom(e.target.value)} /></div><div><Label>إلى</Label><Input type="date" value={leaveTo} onChange={e => setLeaveTo(e.target.value)} /></div></div>}

          {type === "salary_advance" && <div className="grid gap-4 sm:grid-cols-2"><div><Label>قيمة السلفة</Label><Input type="number" min="1" step="0.01" value={advanceAmount} onChange={e => setAdvanceAmount(e.target.value)} placeholder="0.00" /></div><div><Label>عدد شهور السداد المقترح</Label><Select value={repaymentMonths} onValueChange={setRepaymentMonths}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 12 }, (_, i) => String(i + 1)).map(v => <SelectItem key={v} value={v}>{Number(v).toLocaleString("ar-EG")} شهر</SelectItem>)}</SelectContent></Select></div></div>}

          {type === "attendance_correction" && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div><Label>اليوم</Label><Input type="date" value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)} /></div><div><Label>نوع التصحيح</Label><Select value={correctionType} onValueChange={v => setCorrectionType(v as HrAttendanceCorrectionType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="missed_check_in">نسيان حضور</SelectItem><SelectItem value="missed_check_out">نسيان انصراف</SelectItem><SelectItem value="time_correction">تصحيح وقت</SelectItem><SelectItem value="other">أخرى</SelectItem></SelectContent></Select></div><div><Label>وقت حضور مقترح</Label><Input type="time" value={requestedCheckIn} onChange={e => setRequestedCheckIn(e.target.value)} /></div><div><Label>وقت انصراف مقترح</Label><Input type="time" value={requestedCheckOut} onChange={e => setRequestedCheckOut(e.target.value)} /></div></div>}

          <div><Label>سبب الطلب</Label><Textarea rows={4} value={reason} onChange={e => setReason(e.target.value)} placeholder="اكتب السبب والتفاصيل التي يحتاجها المراجع لاتخاذ القرار..." /></div>
          <Button disabled={submitMutation.isPending} className="bg-[#005931] hover:bg-[#004426]" onClick={() => submitMutation.mutate()}>{submitMutation.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Send className="ml-2 h-4 w-4" />}إرسال للمراجعة</Button>
        </TabsContent>

        <TabsContent value="history" className="mt-5 space-y-3">
          {requests.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد طلبات سابقة.</div> : requests.map(request => <div key={request.id} className="rounded-2xl border p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="font-black">{requestLabels[request.request_type]}</span><Badge variant="outline">{statusLabels[request.status] || request.status}</Badge></div><div className="mt-1 text-xs text-muted-foreground">{formatDateTime(request.requested_at)} · {requestSummary(request)}</div><p className="mt-2 text-sm">{request.reason}</p>{request.decision_note && <div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm"><b>ملاحظة المراجع:</b> {request.decision_note}</div>}</div>{["pending","in_review"].includes(request.status) && <Button size="sm" variant="outline" disabled={cancelMutation.isPending} onClick={() => cancelMutation.mutate(request.id)}><XCircle className="ml-2 h-4 w-4" />إلغاء الطلب</Button>}</div></div>)}
        </TabsContent>
      </Tabs>
    </CardContent>
  </Card>;
}

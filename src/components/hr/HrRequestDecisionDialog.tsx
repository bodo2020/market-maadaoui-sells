import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, Clock3, HandCoins, Loader2, UserRound, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ApprovalItem } from "@/services/supabase/approvalCenterV1Service";
import { decideHrRequest, getHrRequestForReview, type HrRequestReviewDetail } from "@/services/hrRequestService";

const requestLabels = {
  leave: "طلب إجازة",
  salary_advance: "طلب سلفة راتب",
  attendance_correction: "طلب تصحيح حضور",
} as const;

const leaveLabels: Record<string, string> = {
  annual: "سنوية",
  casual: "عارضة",
  sick: "مرضية",
  unpaid: "بدون أجر",
  other: "أخرى",
};

const correctionLabels: Record<string, string> = {
  missed_check_in: "نسيان تسجيل الحضور",
  missed_check_out: "نسيان تسجيل الانصراف",
  time_correction: "تصحيح وقت",
  other: "تصحيح آخر",
};

const formatDateTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value))
  : "—";

function payloadRows(detail: HrRequestReviewDetail) {
  const p = detail.request.payload || {};
  if (detail.request.request_type === "leave") return [
    ["نوع الإجازة", leaveLabels[String(p.leave_type || "")] || String(p.leave_type || "—")],
    ["من", String(p.start_date || "—")],
    ["إلى", String(p.end_date || "—")],
  ];
  if (detail.request.request_type === "salary_advance") return [
    ["قيمة السلفة", `${Number(p.amount || 0).toLocaleString("ar-EG")} ج.م`],
    ["مدة السداد", `${Number(p.repayment_months || 1).toLocaleString("ar-EG")} شهر`],
    ["الخصم الشهري المبدئي", `${(Number(p.amount || 0) / Math.max(1, Number(p.repayment_months || 1))).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`],
  ];
  return [
    ["اليوم", String(p.attendance_date || "—")],
    ["نوع التصحيح", correctionLabels[String(p.correction_type || "")] || String(p.correction_type || "—")],
    ["وقت الحضور المطلوب", String(p.requested_check_in || "—")],
    ["وقت الانصراف المطلوب", String(p.requested_check_out || "—")],
  ];
}

export default function HrRequestDecisionDialog({
  task,
  onClose,
  onDone,
}: {
  task: ApprovalItem | null;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null);

  const query = useQuery({
    queryKey: ["hr-request-review-v1", task?.id],
    enabled: Boolean(task?.id),
    queryFn: () => getHrRequestForReview(task!.id),
    staleTime: 5_000,
  });

  useEffect(() => {
    if (!task) setNote("");
  }, [task]);

  const detail = query.data;
  const rows = useMemo(() => detail ? payloadRows(detail) : [], [detail]);

  const decide = async (decision: "approved" | "rejected") => {
    if (!task || busy) return;
    if (note.trim().length < 3) return toast.error("اكتب ملاحظة توضح سبب القرار.");
    setBusy(decision);
    try {
      const result = await decideHrRequest(task.id, decision, note, null);
      if (decision === "approved" && detail?.request.request_type === "salary_advance") {
        toast.success("تم اعتماد السلفة وإنشاء مهمة منفصلة للمالية لصرفها.");
      } else if (decision === "approved" && detail?.request.request_type === "attendance_correction") {
        toast.success("تم اعتماد التصحيح وإنشاء مهمة منفصلة لتطبيقه على سجل الحضور.");
      } else if (decision === "approved") {
        toast.success("تم اعتماد طلب الإجازة وتسجيل فترة الإجازة.");
      } else {
        toast.success("تم رفض الطلب وتوثيق سبب الرفض.");
      }
      if (!result.ok) toast.warning("تم تسجيل القرار لكن راجع حالة الطلب.");
      onClose();
      await onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تسجيل قرار طلب الموارد البشرية.");
    } finally {
      setBusy(null);
    }
  };

  const Icon = detail?.request.request_type === "leave" ? CalendarDays : detail?.request.request_type === "salary_advance" ? HandCoins : Clock3;

  return (
    <Dialog open={Boolean(task)} onOpenChange={open => !open && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader><DialogTitle>مراجعة طلب موارد بشرية</DialogTitle></DialogHeader>
        {query.isLoading ? (
          <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#005931]" /></div>
        ) : query.isError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{query.error instanceof Error ? query.error.message : "تعذر تحميل تفاصيل الطلب."}</div>
        ) : detail ? (
          <div className="space-y-4">
            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800"><Icon className="ml-1 h-3.5 w-3.5" />{requestLabels[detail.request.request_type]}</Badge>
                <Badge variant="outline">{detail.request.status === "in_review" ? "قيد المراجعة" : detail.request.status}</Badge>
              </div>
              <div className="mt-3 flex items-start gap-3"><UserRound className="mt-1 h-5 w-5 text-[#005931]" /><div><div className="font-black">{detail.employee.name}</div><div className="text-xs text-muted-foreground">{detail.profile?.employee_code || detail.employee.username || "بدون كود وظيفي"} · {detail.profile?.work_mode || "onsite"}</div></div></div>
              <div className="mt-3 text-xs text-muted-foreground">تاريخ الطلب: {formatDateTime(detail.request.requested_at)}</div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {rows.map(([label, value]) => <div key={label} className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-black">{value}</div></div>)}
            </div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
              <b>سبب الموظف:</b> {detail.request.reason}
            </div>

            {detail.request.request_type === "salary_advance" && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">اعتماد السلفة لا يعني صرفها. بعد الاعتماد تُنشأ مهمة مالية مستقلة للصرف وتوثيق المرجع.</div>}
            {detail.request.request_type === "attendance_correction" && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">الاعتماد لا يغيّر سجل الحضور مباشرة. بعده تُنشأ مهمة تطبيق منفصلة للحفاظ على الـAudit Trail.</div>}

            <div className="space-y-2"><Label>ملاحظة القرار</Label><Textarea rows={4} value={note} onChange={event => setNote(event.target.value)} placeholder="اكتب ما راجعته وسبب الاعتماد أو الرفض..." /></div>
          </div>
        ) : null}
        <DialogFooter className="gap-2 sm:justify-start">
          <Button variant="outline" onClick={onClose} disabled={Boolean(busy)}>إغلاق</Button>
          <Button variant="destructive" onClick={() => decide("rejected")} disabled={Boolean(busy) || !detail}>{busy === "rejected" ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <XCircle className="ml-2 h-4 w-4" />}رفض</Button>
          <Button onClick={() => decide("approved")} disabled={Boolean(busy) || !detail}>{busy === "approved" ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="ml-2 h-4 w-4" />}اعتماد</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

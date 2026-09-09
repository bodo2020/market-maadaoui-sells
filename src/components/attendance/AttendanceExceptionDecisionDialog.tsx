import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, MapPin, ShieldX, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getAttendanceException, decideAttendanceException } from "@/services/attendanceService";
import type { ApprovalItem } from "@/services/supabase/approvalCenterV1Service";

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

const attendanceModeLabel = (value?: string | null) => {
  if (value === "remote") return "عن بُعد";
  if (value === "field") return "ميداني";
  return "من الفرع";
};

type Props = {
  task: ApprovalItem | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
};

export default function AttendanceExceptionDecisionDialog({ task, onClose, onDone }: Props) {
  const [note, setNote] = useState("");

  useEffect(() => {
    if (task) setNote("");
  }, [task?.id]);

  const detailQuery = useQuery({
    queryKey: ["attendance-exception-v1", task?.source_id],
    enabled: Boolean(task?.source_id && task?.source_kind === "attendance_exception"),
    queryFn: () => getAttendanceException(task!.source_id),
  });

  const decisionMutation = useMutation({
    mutationFn: async (decision: "approved" | "rejected") => {
      if (!task?.source_id) throw new Error("معرّف طلب الاستثناء غير متاح");
      if (note.trim().length < 3) throw new Error("اكتب ملاحظة قصيرة توضح سبب القرار");
      return decideAttendanceException(task.source_id, decision, note.trim());
    },
    onSuccess: async result => {
      toast.success(result.decision === "approved" ? "تم اعتماد استثناء الحضور وفتح جلسة الموظف." : "تم رفض استثناء الحضور.");
      await onDone();
      onClose();
    },
    onError: error => toast.error(error instanceof Error ? error.message : "تعذر تسجيل قرار الحضور"),
  });

  const detail = detailQuery.data;

  return (
    <Dialog open={Boolean(task)} onOpenChange={open => !open && !decisionMutation.isPending && onClose()}>
      <DialogContent dir="rtl" className="max-w-xl">
        <DialogHeader><DialogTitle>مراجعة استثناء الحضور</DialogTitle></DialogHeader>

        {detailQuery.isLoading ? (
          <div className="flex min-h-52 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#005931]" /></div>
        ) : detailQuery.isError || !detail ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">تعذر تحميل تفاصيل طلب الحضور. لا يتم اتخاذ قرار بدون التفاصيل.</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><div className="text-lg font-black">{detail.employee_name}</div><div className="mt-1 text-sm text-muted-foreground">{detail.branch_name} · {attendanceModeLabel(detail.attendance_mode)}</div></div>
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">خارج النطاق</Badge>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border p-3"><div className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" />المسافة</div><div className="mt-1 text-lg font-black">{detail.distance_m == null ? "—" : `${Math.round(detail.distance_m).toLocaleString("ar-EG")} م`}</div></div>
              <div className="rounded-2xl border p-3"><div className="flex items-center gap-1 text-xs text-muted-foreground"><Smartphone className="h-3.5 w-3.5" />دقة GPS</div><div className="mt-1 text-lg font-black">{detail.accuracy_m == null ? "—" : `${Math.round(detail.accuracy_m).toLocaleString("ar-EG")} م`}</div></div>
              <div className="rounded-2xl border p-3"><div className="text-xs text-muted-foreground">وقت المحاولة</div><div className="mt-1 text-sm font-black">{formatDateTime(detail.requested_at)}</div></div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 font-black text-amber-900"><AlertTriangle className="h-5 w-5" />سبب الموظف</div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-900">{detail.reason}</p>
            </div>

            {detail.latitude != null && detail.longitude != null && (
              <div className="rounded-2xl border bg-slate-50 p-3 text-xs text-muted-foreground">إحداثيات محاولة الحضور: {Number(detail.latitude).toFixed(6)}, {Number(detail.longitude).toFixed(6)}</div>
            )}

            <div className="space-y-2"><Label>ملاحظة المراجع</Label><Textarea rows={4} value={note} onChange={event => setNote(event.target.value)} placeholder="اكتب سبب الاعتماد أو الرفض وما تم التحقق منه..." /></div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900">عند الاعتماد، النظام ينشئ جلسة الحضور من وقت محاولة الموظف الأصلية. عند الرفض لا تُنشأ جلسة حضور.</div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-start">
          <Button variant="outline" disabled={decisionMutation.isPending} onClick={onClose}>إغلاق</Button>
          <Button variant="destructive" disabled={decisionMutation.isPending || !detail} onClick={() => decisionMutation.mutate("rejected")}>
            {decisionMutation.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <ShieldX className="ml-2 h-4 w-4" />}رفض الطلب
          </Button>
          <Button disabled={decisionMutation.isPending || !detail} className="bg-[#005931] hover:bg-[#004426]" onClick={() => decisionMutation.mutate("approved")}>
            {decisionMutation.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="ml-2 h-4 w-4" />}اعتماد الحضور
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

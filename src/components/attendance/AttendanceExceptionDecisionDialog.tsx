import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Camera, CheckCircle2, Loader2, MapPin, RefreshCw, ShieldX, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  decideAttendanceExceptionAndCleanupPhoto,
  getAttendanceException,
  getAttendanceVerificationPhotoUrl,
} from "@/services/attendanceService";
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

type ReviewRequirementFields = {
  requires_live_photo?: boolean;
  requires_phone_verification?: boolean;
};

export default function AttendanceExceptionDecisionDialog({ task, onClose, onDone }: Props) {
  const [note, setNote] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoRetryKey, setPhotoRetryKey] = useState(0);

  useEffect(() => {
    if (task) setNote("");
  }, [task?.id]);

  const detailQuery = useQuery({
    queryKey: ["attendance-exception-v1", task?.source_id],
    enabled: Boolean(task?.source_id && task?.source_kind === "attendance_exception"),
    queryFn: () => getAttendanceException(task!.source_id),
  });

  const detail = detailQuery.data;
  const requirements = detail as (typeof detail & ReviewRequirementFields) | null | undefined;
  const requiresLivePhoto = requirements?.requires_live_photo ?? true;
  const requiresPhoneVerification = requirements?.requires_phone_verification ?? false;
  const noteReady = note.trim().length >= 3;

  useEffect(() => {
    setPhotoUrl(null);
    setPhotoError(null);
    if (!task || !detail?.verification_photo_path) {
      setPhotoLoading(false);
      return;
    }

    let cancelled = false;
    setPhotoLoading(true);
    getAttendanceVerificationPhotoUrl(detail.verification_photo_path, 300)
      .then(url => {
        if (!cancelled) {
          setPhotoUrl(url);
          setPhotoError(null);
        }
      })
      .catch(error => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "تعذر فتح صورة التحقق";
          setPhotoError(message);
          toast.error("تعذر فتح صورة التحقق. اضغط إعادة المحاولة بعد لحظات.");
        }
      })
      .finally(() => {
        if (!cancelled) setPhotoLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [task?.id, detail?.verification_photo_path, photoRetryKey]);

  const approvalBlockReason = !detail
    ? null
    : requiresPhoneVerification && !detail.phone_verified_at
      ? "سياسة هذا الفرع تشترط تحقق الهاتف قبل الاعتماد."
      : requiresLivePhoto && !detail.verification_photo_path
        ? "سياسة هذا الفرع تشترط وجود صورة تحقق مباشرة."
        : requiresLivePhoto && !photoLoading && !photoUrl
          ? "الصورة مرفوعة لكن لم يتمكن التطبيق من فتحها؛ أعد تحميل الصورة قبل اعتماد الحضور."
          : !noteReady
            ? "اكتب ملاحظة مراجعة من 3 أحرف على الأقل لتفعيل قرار الاعتماد."
            : null;

  const decisionMutation = useMutation({
    mutationFn: async (decision: "approved" | "rejected") => {
      if (!task?.source_id) throw new Error("معرّف طلب الاستثناء غير متاح");
      if (!noteReady) throw new Error("اكتب ملاحظة قصيرة توضح سبب القرار");
      if (decision === "approved" && requiresPhoneVerification && !detail?.phone_verified_at) {
        throw new Error("لا يمكن اعتماد الحضور قبل تحقق الهاتف وفق سياسة الفرع");
      }
      if (decision === "approved" && requiresLivePhoto && !detail?.verification_photo_path) {
        throw new Error("لا يمكن اعتماد الحضور بدون صورة التحقق المباشر وفق سياسة الفرع");
      }
      if (decision === "approved" && requiresLivePhoto && !photoUrl) {
        throw new Error("افتح صورة التحقق بنجاح قبل اعتماد الحضور");
      }
      return decideAttendanceExceptionAndCleanupPhoto(task.source_id, decision, note.trim());
    },
    onSuccess: async result => {
      if (!result.ok) {
        const codeMessage: Record<string, string> = {
          PHONE_VERIFICATION_REQUIRED: "تعذر الاعتماد لأن سياسة الفرع تشترط تحقق الهاتف.",
          LIVE_PHOTO_REQUIRED: "تعذر الاعتماد لأن صورة التحقق المباشر مطلوبة.",
          LIVE_PHOTO_NOT_FOUND: "تعذر الاعتماد لأن ملف صورة التحقق غير موجود على التخزين.",
          ATTENDANCE_POLICY_NOT_CONFIGURED: "تعذر الاعتماد لأن سياسة حضور الفرع غير مكتملة.",
          EMPLOYEE_ALREADY_ACTIVE: "الموظف لديه جلسة حضور نشطة بالفعل.",
        };
        toast.error(codeMessage[result.code] || "تعذر إتمام قرار الحضور.");
        return;
      }
      if (result.photo_cleanup_ok === false) {
        toast.warning("تم تسجيل القرار، لكن تعذر حذف صورة التحقق الآن. سيعاد تنظيفها لاحقًا.");
      } else {
        toast.success(result.decision === "approved" ? "تم اعتماد استثناء الحضور وفتح جلسة الموظف." : "تم رفض استثناء الحضور.");
      }
      await onDone();
      onClose();
    },
    onError: error => toast.error(error instanceof Error ? error.message : "تعذر تسجيل قرار الحضور"),
  });

  return (
    <Dialog open={Boolean(task)} onOpenChange={open => !open && !decisionMutation.isPending && onClose()}>
      <DialogContent
        dir="rtl"
        className="max-w-xl overflow-y-auto sm:rounded-2xl"
        style={{ maxHeight: "calc(100dvh - var(--safe-area-top) - var(--safe-area-bottom) - 1rem)" }}
      >
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
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className={!requiresPhoneVerification ? "border-slate-200 bg-white text-slate-600" : detail.phone_verified_at ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}
                >
                  <Smartphone className="ml-1 h-3.5 w-3.5" />
                  {!requiresPhoneVerification ? "تحقق الهاتف غير مطلوب" : detail.phone_verified_at ? "الهاتف متحقق" : "الهاتف غير متحقق"}
                </Badge>
                <Badge
                  variant="outline"
                  className={!requiresLivePhoto ? "border-slate-200 bg-white text-slate-600" : detail.verification_photo_path ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}
                >
                  <Camera className="ml-1 h-3.5 w-3.5" />
                  {!requiresLivePhoto ? "الصورة غير مطلوبة" : detail.verification_photo_path ? "صورة Live مرفقة" : "لا توجد صورة"}
                </Badge>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border p-3"><div className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" />المسافة</div><div className="mt-1 text-lg font-black">{detail.distance_m == null ? "—" : `${Math.round(detail.distance_m).toLocaleString("ar-EG")} م`}</div></div>
              <div className="rounded-2xl border p-3"><div className="flex items-center gap-1 text-xs text-muted-foreground"><Smartphone className="h-3.5 w-3.5" />دقة GPS</div><div className="mt-1 text-lg font-black">{detail.accuracy_m == null ? "—" : `${Math.round(detail.accuracy_m).toLocaleString("ar-EG")} م`}</div></div>
              <div className="rounded-2xl border p-3"><div className="text-xs text-muted-foreground">وقت المحاولة</div><div className="mt-1 text-sm font-black">{formatDateTime(detail.requested_at)}</div></div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 font-black text-amber-900"><AlertTriangle className="h-5 w-5" />سبب الموظف</div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-900">{detail.reason || "لم يكتب الموظف سببًا."}</p>
            </div>

            {(requiresLivePhoto || detail.verification_photo_path) && (
              <div className="overflow-hidden rounded-2xl border bg-slate-950">
                <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-sm font-black text-white"><Camera className="h-4 w-4" />صورة التحقق المباشر</div>
                <div className="aspect-[4/3]">
                  {photoLoading ? (
                    <div className="grid h-full place-items-center text-white"><Loader2 className="h-7 w-7 animate-spin" /></div>
                  ) : photoUrl ? (
                    <img
                      src={photoUrl}
                      alt="صورة تحقق حضور الموظف"
                      className="h-full w-full object-contain"
                      onError={() => {
                        setPhotoUrl(null);
                        setPhotoError("تعذر تحميل ملف الصورة من رابط التخزين");
                      }}
                    />
                  ) : (
                    <div className="grid h-full place-items-center p-6 text-center text-sm text-slate-300">
                      <div>
                        <Camera className="mx-auto mb-2 h-8 w-8" />
                        <div>صورة التحقق غير متاحة</div>
                        {photoError && <div className="mt-2 max-w-sm text-xs text-slate-400">{photoError}</div>}
                        {detail.verification_photo_path && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="mt-4"
                            onClick={() => setPhotoRetryKey(value => value + 1)}
                          >
                            <RefreshCw className="ml-2 h-4 w-4" />إعادة تحميل الصورة
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {detail.latitude != null && detail.longitude != null && (
              <div className="rounded-2xl border bg-slate-50 p-3 text-xs text-muted-foreground">إحداثيات محاولة الحضور: {Number(detail.latitude).toFixed(6)}, {Number(detail.longitude).toFixed(6)}</div>
            )}

            <div className="space-y-2">
              <Label>ملاحظة المراجع</Label>
              <Textarea rows={4} value={note} onChange={event => setNote(event.target.value)} placeholder="اكتب سبب الاعتماد أو الرفض وما تم التحقق منه..." />
              {!noteReady && <p className="text-xs text-muted-foreground">الملاحظة مطلوبة، 3 أحرف على الأقل.</p>}
            </div>

            {approvalBlockReason && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{approvalBlockReason}</div>
            )}

            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900">عند الاعتماد، النظام ينشئ جلسة الحضور من وقت محاولة الموظف الأصلية. عند الرفض لا تُنشأ جلسة حضور.</div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-start">
          <Button variant="outline" disabled={decisionMutation.isPending} onClick={onClose}>إغلاق</Button>
          <Button variant="destructive" disabled={decisionMutation.isPending || !detail || !noteReady} onClick={() => decisionMutation.mutate("rejected")}>
            {decisionMutation.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <ShieldX className="ml-2 h-4 w-4" />}رفض الطلب
          </Button>
          <Button
            disabled={
              decisionMutation.isPending
              || !detail
              || !noteReady
              || (requiresPhoneVerification && !detail.phone_verified_at)
              || (requiresLivePhoto && (!detail.verification_photo_path || !photoUrl))
            }
            className="bg-[#005931] hover:bg-[#004426]"
            onClick={() => decisionMutation.mutate("approved")}
          >
            {decisionMutation.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="ml-2 h-4 w-4" />}اعتماد الحضور
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

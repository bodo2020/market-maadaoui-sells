import { useEffect, useState } from "react";
import { Camera, CheckCircle2, Loader2, MapPin, ShieldCheck, Smartphone, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { HrAttendanceExceptionItem } from "@/services/hrWorkspaceService";
import {
  decideAttendanceExceptionAndCleanupPhoto,
  getAttendanceVerificationPhotoUrl,
} from "@/services/attendanceService";

const fmt = (value?: string | null) => value ? new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "—";

export default function AttendanceExceptionReviewDialog({ item, open, onOpenChange, onDone }: { item: HrAttendanceExceptionItem | null; open: boolean; onOpenChange: (open: boolean) => void; onDone: () => void | Promise<void> }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null);

  useEffect(() => {
    setPhotoUrl(null);
    setNote("");
    if (!open || !item?.verification_photo_path) return;
    let cancelled = false;
    setPhotoLoading(true);
    getAttendanceVerificationPhotoUrl(item.verification_photo_path, 300)
      .then(url => { if (!cancelled) setPhotoUrl(url); })
      .catch(() => { if (!cancelled) toast.error("تعذر فتح صورة التحقق. حاول تحديث الطلب."); })
      .finally(() => { if (!cancelled) setPhotoLoading(false); });
    return () => { cancelled = true; };
  }, [open, item?.id, item?.verification_photo_path]);

  if (!item) return null;

  const decide = async (decision: "approved" | "rejected") => {
    if (busy) return;
    if (decision === "rejected" && note.trim().length < 3) {
      toast.error("اكتب سبب الرفض قبل المتابعة.");
      return;
    }
    setBusy(decision);
    try {
      const result = await decideAttendanceExceptionAndCleanupPhoto(item.id, decision, note.trim() || undefined);
      if (!result.ok) throw new Error("تعذر تسجيل القرار");
      if (result.photo_cleanup_ok === false) {
        toast.warning("تم تسجيل القرار، لكن تعذر حذف الصورة الآن. سيظل مسار الحذف ظاهرًا للمراجعة التقنية.");
      } else {
        toast.success(decision === "approved" ? "تم اعتماد الحضور وحذف صورة التحقق." : "تم رفض الطلب وحذف صورة التحقق.");
      }
      onOpenChange(false);
      await onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تسجيل قرار الحضور");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={value => !busy && onOpenChange(value)}>
      <DialogContent dir="rtl" className="max-h-[calc(100dvh-var(--safe-top)-var(--safe-bottom)-2rem)] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>مراجعة حضور خارج النطاق</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="flex flex-wrap items-center gap-2"><div className="text-lg font-black">{item.employee_name}</div>{item.employee_code && <Badge variant="outline">{item.employee_code}</Badge>}</div>
            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              <div className="flex items-center gap-2 rounded-xl bg-white p-3"><MapPin className="h-4 w-4 text-[#005931]" /><span>المسافة: <b>{Math.round(Number(item.distance_m || 0)).toLocaleString("ar-EG")} م</b></span></div>
              <div className="flex items-center gap-2 rounded-xl bg-white p-3"><ShieldCheck className="h-4 w-4 text-[#005931]" /><span>دقة GPS: <b>{Math.round(Number(item.accuracy_m || 0)).toLocaleString("ar-EG")} م</b></span></div>
              <div className="flex items-center gap-2 rounded-xl bg-white p-3"><Smartphone className="h-4 w-4 text-[#005931]" /><span>{item.phone_verified_at ? `الهاتف متحقق ${fmt(item.phone_verified_at)}` : "لم يتم توثيق تحقق الهاتف"}</span></div>
              <div className="flex items-center gap-2 rounded-xl bg-white p-3"><Camera className="h-4 w-4 text-[#005931]" /><span>{item.verification_photo_path ? "صورة Live مرفقة" : "لا توجد صورة"}</span></div>
            </div>
            <div className="mt-3 rounded-xl bg-white p-3"><div className="text-[11px] text-muted-foreground">سبب الموظف</div><div className="mt-1 text-sm font-bold">{item.reason}</div></div>
          </div>

          <div className="overflow-hidden rounded-2xl border bg-slate-950 aspect-[4/3]">
            {photoLoading ? <div className="grid h-full place-items-center text-white"><Loader2 className="h-7 w-7 animate-spin" /></div> : photoUrl ? <img src={photoUrl} alt="صورة تحقق الحضور" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center p-6 text-center text-sm text-slate-300"><Camera className="mb-2 h-8 w-8" /><span>صورة التحقق غير متاحة</span></div>}
          </div>

          <div className="space-y-2"><div className="text-sm font-black">ملاحظة القرار</div><Textarea rows={3} value={note} onChange={event => setNote(event.target.value)} placeholder="اختياري عند القبول، وإلزامي عند الرفض..." /></div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs leading-6 text-emerald-900">بعد تسجيل القرار سيحاول التطبيق حذف صورة التحقق فورًا من التخزين الخاص، مع الاحتفاظ فقط ببصمة الصورة ووقت التحقق والقرار داخل سجل التدقيق.</div>
        </div>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button variant="destructive" disabled={Boolean(busy)} onClick={() => void decide("rejected")}>{busy === "rejected" ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <XCircle className="ml-2 h-4 w-4" />}رفض</Button>
          <Button disabled={Boolean(busy) || !item.phone_verified_at || !item.verification_photo_path} className="bg-[#005931] hover:bg-[#004526]" onClick={() => void decide("approved")}>{busy === "approved" ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="ml-2 h-4 w-4" />}تأكيد الحضور</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

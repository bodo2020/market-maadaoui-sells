import { Loader2, Trash2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  markAttendanceVerificationPhotoDeleted,
  removeAttendanceVerificationPhoto,
} from "@/services/attendanceService";

type Props = {
  exceptionId: string;
  photoPath: string;
  onDone: () => Promise<void> | void;
};

export default function AttendancePhotoCleanupRetry({ exceptionId, photoPath, onDone }: Props) {
  const cleanupMutation = useMutation({
    mutationFn: async () => {
      await removeAttendanceVerificationPhoto(photoPath);
      await markAttendanceVerificationPhotoDeleted(exceptionId);
    },
    onSuccess: async () => {
      toast.success("تم حذف صورة التحقق نهائيًا وتوثيق الحذف.");
      await onDone();
    },
    onError: error => toast.error(error instanceof Error ? error.message : "تعذر حذف صورة التحقق"),
  });

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">
      <div>القرار تم تسجيله، لكن ملف صورة التحقق ما زال موجودًا على التخزين.</div>
      <Button
        type="button"
        variant="outline"
        className="mt-3 w-full border-red-200 bg-white text-red-800 hover:bg-red-100"
        disabled={cleanupMutation.isPending}
        onClick={() => cleanupMutation.mutate()}
      >
        {cleanupMutation.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Trash2 className="ml-2 h-4 w-4" />}
        إعادة محاولة حذف الصورة
      </Button>
    </div>
  );
}
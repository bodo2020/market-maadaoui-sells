import { useQuery } from "@tanstack/react-query";
import { CalendarCheck2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useBranchStore } from "@/stores/branchStore";
import { getMyAttendance } from "@/services/attendanceService";

const labels: Record<string, string> = {
  annual: "إجازة سنوية",
  casual: "إجازة عارضة",
  sick: "إجازة مرضية",
  unpaid: "إجازة بدون أجر",
  other: "إجازة معتمدة",
};

export default function AttendanceApprovedLeaveBanner() {
  const { currentBranchId } = useBranchStore();
  const query = useQuery({
    queryKey: ["my-attendance-v1", currentBranchId],
    enabled: Boolean(currentBranchId),
    queryFn: () => getMyAttendance(currentBranchId || null),
    refetchInterval: 60_000,
  });
  const leave = query.data?.approved_leave;
  if (!leave) return null;

  return (
    <div dir="rtl" className="fixed bottom-5 right-5 z-30 w-[min(92vw,430px)]">
      <Card className="border-violet-200 bg-violet-50/95 shadow-xl backdrop-blur">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-white p-2 text-violet-700"><CalendarCheck2 className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><div className="font-black text-violet-950">{labels[leave.leave_type] || "إجازة معتمدة"}</div><Badge variant="outline" className="border-violet-200 bg-white text-violet-800">{leave.coverage === "full_day" ? "يوم كامل" : "جزء من اليوم"}</Badge></div>
              <div className="mt-1 text-sm text-violet-900">{leave.start_date === leave.end_date ? leave.start_date : `${leave.start_date} → ${leave.end_date}`}</div>
              <p className="mt-2 text-xs leading-5 text-violet-700">اليوم مغطى بإجازة معتمدة ولن يُعامل كغياب غير مبرر. لو حضرت للعمل فعليًا، يمكنك تسجيل الحضور بشكل طبيعي وسيتم الاحتفاظ بالسجلين للـAudit.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

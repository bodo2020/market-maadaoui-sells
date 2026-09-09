import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { useNotificationStore } from "@/stores/notificationStore";
import {
  fetchOperationsTasks,
  isCashHandoffVarianceTask,
  isRefundTransferTask,
  isShiftReconciliationTask,
  type OperationsTask,
} from "@/services/supabase/operationsTaskService";

function tasksPath(tasks: OperationsTask[]) {
  if (!tasks.length) return "/tasks";
  if (tasks.every(isCashHandoffVarianceTask)) return "/tasks?type=cash_handoff";
  if (tasks.every(isShiftReconciliationTask)) return "/tasks?type=shift";
  if (tasks.every(isRefundTransferTask)) return "/tasks?type=refund";
  return "/tasks";
}

export default function OperationsTaskNotifications() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBranchId } = useBranchStore();
  const setOperationsTaskAlerts = useNotificationStore(state => state.setOperationsTaskAlerts);
  const setOperationsTaskOverdue = useNotificationStore(state => state.setOperationsTaskOverdue);

  const query = useQuery({
    queryKey: ["operations-task-alerts", currentBranchId],
    enabled: Boolean(user?.id && currentBranchId),
    queryFn: () => fetchOperationsTasks(currentBranchId as string, "all", 100),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const available = useMemo(() => (query.data || []).filter(task => task.status === "open"), [query.data]);
  const mine = useMemo(() => (query.data || []).filter(task => task.is_mine && ["claimed", "in_progress", "failed"].includes(task.status)), [query.data]);
  const overdue = useMemo(() => (query.data || []).filter(task => task.is_overdue && !["completed", "cancelled"].includes(task.status)), [query.data]);

  useEffect(() => {
    if (!user?.id || !currentBranchId) {
      setOperationsTaskAlerts(0);
      setOperationsTaskOverdue(0);
      return;
    }
    if (!query.data) return;

    setOperationsTaskAlerts(available.length + mine.length);
    setOperationsTaskOverdue(overdue.length);

    if (available.length > 0) {
      const signature = available.map(task => task.id).sort().join(",");
      const storageKey = `operations-task-open:${user.id}:${currentBranchId}:${signature}`;
      if (!sessionStorage.getItem(storageKey)) {
        sessionStorage.setItem(storageKey, "1");
        const first = available[0];
        const cashReview = isCashHandoffVarianceTask(first);
        const shiftReview = isShiftReconciliationTask(first);
        const title = available.length > 1
          ? "مهام تشغيلية جديدة متاحة للاستلام"
          : cashReview
            ? "مهمة مراجعة فرق استلام نقدية متاحة للاستلام"
            : shiftReview
              ? "مهمة مراجعة فرق وردية متاحة للاستلام"
              : "مهمة رد مبلغ جديدة متاحة للاستلام";
        const description = available.length === 1
          ? cashReview
            ? `${first.cashier_name || "كاشير"} · فرق ${Number(first.variance_amount ?? first.amount ?? 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م${first.reference_number ? ` · ${first.reference_number}` : ""}`
            : shiftReview
              ? `${first.payment_method_name || first.method_code || "وسيلة دفع"} · فرق ${Number(first.variance_amount ?? first.amount ?? 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م${first.reference_number ? ` · ${first.reference_number}` : ""}`
              : `${first.payment_method_name || "دفع إلكتروني"} · ${Number(first.amount || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م${first.reference_number ? ` · ${first.reference_number}` : ""}`
          : `${available.length.toLocaleString("ar-EG")} مهام متاحة للفريق في الفرع الحالي`;

        toast.warning(title, {
          description,
          duration: 10000,
          action: { label: "فتح المهام", onClick: () => navigate(tasksPath(available)) },
        });
      }
    }

    if (overdue.length > 0) {
      const signature = overdue.map(task => task.id).sort().join(",");
      const storageKey = `operations-task-overdue:${user.id}:${currentBranchId}:${signature}`;
      if (!sessionStorage.getItem(storageKey)) {
        sessionStorage.setItem(storageKey, "1");
        toast.error("فيه مهام تشغيلية تجاوزت وقت التنفيذ", {
          description: `${overdue.length.toLocaleString("ar-EG")} مهمة متأخرة تحتاج متابعة`,
          duration: 12000,
          action: { label: "عرض المتأخرة", onClick: () => navigate(tasksPath(overdue)) },
        });
      }
    }
  }, [available, currentBranchId, mine, navigate, overdue, query.data, setOperationsTaskAlerts, setOperationsTaskOverdue, user?.id]);

  useEffect(() => {
    if (query.isError) {
      setOperationsTaskAlerts(0);
      setOperationsTaskOverdue(0);
    }
  }, [query.isError, setOperationsTaskAlerts, setOperationsTaskOverdue]);

  return null;
}

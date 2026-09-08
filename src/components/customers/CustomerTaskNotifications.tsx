import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types";
import { useBranchStore } from "@/stores/branchStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { fetchMyCustomerFollowupInbox } from "@/services/supabase/customerMyTasksService";

export default function CustomerTaskNotifications() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBranchId } = useBranchStore();
  const setCustomerTaskAlerts = useNotificationStore(state => state.setCustomerTaskAlerts);

  const canManageCustomers = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;

  const query = useQuery({
    queryKey: ["my-customer-followup-inbox", currentBranchId],
    enabled: Boolean(user?.id && currentBranchId && canManageCustomers),
    queryFn: () => fetchMyCustomerFollowupInbox(currentBranchId || null, 14),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const dueTasks = useMemo(
    () => [...(query.data?.overdue || []), ...(query.data?.today || [])],
    [query.data?.overdue, query.data?.today],
  );

  useEffect(() => {
    if (!user || !currentBranchId || !canManageCustomers) {
      setCustomerTaskAlerts(0);
      return;
    }
    if (!query.data) return;

    const alertCount = Number(query.data.summary.overdue || 0) + Number(query.data.summary.today || 0);
    setCustomerTaskAlerts(alertCount);
    if (alertCount <= 0) return;

    const signature = dueTasks.map(task => task.interaction_id).sort().join(",");
    const storageKey = `customer-task-alert:${user.id}:${currentBranchId}:${signature}`;
    if (sessionStorage.getItem(storageKey)) return;
    sessionStorage.setItem(storageKey, "1");

    const overdue = Number(query.data.summary.overdue || 0);
    const today = Number(query.data.summary.today || 0);
    const description = [
      overdue > 0 ? `${overdue.toLocaleString("ar-EG")} متأخرة` : "",
      today > 0 ? `${today.toLocaleString("ar-EG")} مستحقة اليوم` : "",
    ].filter(Boolean).join(" · ");

    toast.warning("عندك مهام عملاء تحتاج متابعة", {
      description,
      duration: 9000,
      action: {
        label: "فتح مهامي",
        onClick: () => navigate("/customer-tasks"),
      },
    });
  }, [canManageCustomers, currentBranchId, dueTasks, navigate, query.data, setCustomerTaskAlerts, user]);

  useEffect(() => {
    if (query.isError) setCustomerTaskAlerts(0);
  }, [query.isError, setCustomerTaskAlerts]);

  return null;
}

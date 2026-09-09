import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { fetchApprovalCenterV1 } from "@/services/supabase/approvalCenterV1Service";

export default function ApprovalCenterNotifications() {
  const { user } = useAuth();
  const { currentBranchId } = useBranchStore();
  const queryClient = useQueryClient();
  const setApprovalAlerts = useNotificationStore(state => state.setApprovalAlerts);
  const enabled = Boolean(user?.id && currentBranchId);

  const query = useQuery({
    queryKey: ["approval-center-v1", currentBranchId, "global-badge"],
    enabled,
    queryFn: () => fetchApprovalCenterV1(currentBranchId as string, "pending", 1),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
    retry: false,
  });

  useEffect(() => {
    setApprovalAlerts(query.data?.summary.pending || 0);
  }, [query.data?.summary.pending, setApprovalAlerts]);

  useEffect(() => {
    if (!user?.id || !currentBranchId) {
      setApprovalAlerts(0);
      return;
    }

    const channel = supabase
      .channel(`approval-center-signals:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notification_realtime_signals_v2",
          filter: `recipient_user_id=eq.${user.id}`,
        },
        payload => {
          const signal = payload.new as { branch_id?: string | null };
          if (signal.branch_id && signal.branch_id !== currentBranchId) return;
          void query.refetch();
          void queryClient.invalidateQueries({ queryKey: ["approval-center-v1", currentBranchId] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentBranchId, query, queryClient, setApprovalAlerts, user?.id]);

  return null;
}

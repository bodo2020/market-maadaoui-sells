import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import {
  fetchNotificationCenterV2,
  type NotificationCenterItemV2,
} from "@/services/supabase/notificationCenterV2Service";

function toastCampaign(item: NotificationCenterItemV2, navigate: ReturnType<typeof useNavigate>) {
  toast(item.title || "إشعار جديد", {
    description: item.body || undefined,
    duration: item.severity === "critical" ? 9000 : 6500,
    action: item.action_url
      ? {
          label: item.action_label || "فتح",
          onClick: () => navigate(item.action_url as string),
        }
      : {
          label: "الإشعارات",
          onClick: () => navigate("/notifications"),
        },
  });
}

export default function StaffInAppNotificationHost() {
  const { user } = useAuth();
  const { currentBranchId } = useBranchStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const enabled = Boolean(user?.id && currentBranchId);
  useQuery({
    queryKey: ["notification-center-v2", currentBranchId, "global-host"],
    enabled,
    queryFn: () => fetchNotificationCenterV2(currentBranchId, "all", null, 20),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
    retry: false,
  });

  useEffect(() => {
    if (!user?.id || !currentBranchId) return;

    const channel = supabase
      .channel(`staff-in-app-notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notification_realtime_signals_v2",
          filter: `recipient_user_id=eq.${user.id}`,
        },
        payload => {
          const signal = payload.new as { notification_id?: string; branch_id?: string | null };
          if (signal.branch_id && signal.branch_id !== currentBranchId) return;

          void (async () => {
            try {
              const center = await fetchNotificationCenterV2(currentBranchId, "all", null, 30);
              queryClient.setQueryData(["notification-center-v2", currentBranchId, "global-host"], center);
              void queryClient.invalidateQueries({ queryKey: ["notification-center-v2"] });

              const item = center.items.find(entry => entry.id === signal.notification_id);
              // Keep real-time in-app campaign toasts; navigation now lives in the main navbar only.
              if (item?.source_kind === "notification_campaign") {
                toastCampaign(item, navigate);
              }
            } catch {
              void queryClient.invalidateQueries({ queryKey: ["notification-center-v2"] });
            }
          })();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentBranchId, navigate, queryClient, user?.id]);

  // The notification bell and unread counter already live in NavbarV2.
  // This host stays mounted only for real-time cache refreshes and in-app toasts.
  return null;
}

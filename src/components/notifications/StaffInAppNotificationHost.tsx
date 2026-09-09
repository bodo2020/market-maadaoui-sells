import { useEffect, useMemo } from "react";
import { Bell } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { Button } from "@/components/ui/button";
import {
  fetchNotificationCenterV2,
  markNotificationReadV2,
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
  const location = useLocation();
  const queryClient = useQueryClient();

  const enabled = Boolean(user?.id && currentBranchId);
  const query = useQuery({
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
              // Legacy operational toasts remain active for now. The global host owns manual broadcasts.
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

  const unread = query.data?.summary.unread || 0;
  const isPos = location.pathname === "/" || location.pathname === "/pos";
  const activeItems = useMemo(
    () => (query.data?.items || []).filter(item => item.status === "active"),
    [query.data?.items],
  );

  if (!enabled || !isPos) return null;

  return (
    <div className="fixed left-4 top-4 z-[80]" dir="rtl">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="relative h-11 w-11 rounded-2xl border-emerald-200 bg-white/95 text-[#005931] shadow-lg backdrop-blur hover:bg-emerald-50"
        aria-label={unread ? `الإشعارات، ${unread} غير مقروء` : "الإشعارات"}
        title={activeItems[0]?.title || "مركز الإشعارات"}
        onClick={() => navigate("/notifications")}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>
    </div>
  );
}

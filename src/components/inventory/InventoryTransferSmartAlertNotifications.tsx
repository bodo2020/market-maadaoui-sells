import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { fetchInventoryTransferSmartAlertsV2 } from "@/services/supabase/inventoryTransferSmartAlertsV2Service";

export default function InventoryTransferSmartAlertNotifications() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBranchId } = useBranchStore();

  const query = useQuery({
    queryKey: ["inventory-transfer-smart-alerts", currentBranchId],
    enabled: Boolean(user?.id && currentBranchId),
    queryFn: () => fetchInventoryTransferSmartAlertsV2(currentBranchId as string),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: 30_000,
  });

  const important = useMemo(
    () => (query.data?.alerts || [])
      .filter(alert => alert.severity === "critical" || alert.severity === "warning")
      .sort((a, b) => b.priority - a.priority),
    [query.data],
  );

  useEffect(() => {
    if (!user?.id || !currentBranchId || important.length === 0) return;

    const signature = important
      .map(alert => `${alert.id}:${alert.severity}:${alert.metric_value}`)
      .sort()
      .join("|");
    const storageKey = `inventory-transfer-smart-alerts:${user.id}:${currentBranchId}:${signature}`;
    if (sessionStorage.getItem(storageKey)) return;
    sessionStorage.setItem(storageKey, "1");

    const first = important[0];
    const hasCritical = important.some(alert => alert.severity === "critical");
    const title = important.length === 1
      ? first.title
      : `${important.length.toLocaleString("ar-EG")} تنبيهات مهمة في تحويلات المخزون`;
    const description = important.length === 1
      ? first.message
      : `${first.title} · ${first.message}`;
    const options = {
      description,
      duration: hasCritical ? 15000 : 12000,
      action: {
        label: "فتح تقرير التحويلات",
        onClick: () => navigate("/reports/inventory-transfers"),
      },
    };

    if (hasCritical) toast.error(title, options);
    else toast.warning(title, options);
  }, [currentBranchId, important, navigate, user?.id]);

  return null;
}

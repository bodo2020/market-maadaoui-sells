import { supabase } from "@/integrations/supabase/client";

const n = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const s = (value: unknown, fallback = "") => value == null ? fallback : String(value);

export type InventoryTransferAlertSeverity = "critical" | "warning";

export interface InventoryTransferSmartAlertV2 {
  id: string;
  alert_type: string;
  severity: InventoryTransferAlertSeverity;
  category: "inventory_transfers";
  priority: number;
  title: string;
  message: string;
  metric_label: string;
  metric_value: number;
  metric_unit: string;
  action: string;
  href: string;
  evidence: Record<string, unknown>;
}

export interface InventoryTransferSmartAlertsV2 {
  version: number;
  rule_version: number;
  branch_id: string;
  from: string;
  to: string;
  generated_at: string;
  summary: {
    total: number;
    critical: number;
    warning: number;
    overdue_eta: number;
    stuck_in_transit: number;
    repeated_route_variance: number;
    repeated_product_variance: number;
  };
  alerts: InventoryTransferSmartAlertV2[];
  data_quality: Record<string, unknown>;
}

const severity = (value: unknown): InventoryTransferAlertSeverity =>
  value === "critical" ? "critical" : "warning";

export async function fetchInventoryTransferSmartAlertsV2(
  branchId: string,
  from = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
  to = new Date(),
): Promise<InventoryTransferSmartAlertsV2> {
  const { data, error } = await supabase.rpc(
    "get_inventory_transfer_smart_alerts_v2" as never,
    { p_branch_id: branchId, p_from: from.toISOString(), p_to: to.toISOString() } as never,
  );
  if (error) throw error;
  if (!data) throw new Error("INVENTORY_TRANSFER_SMART_ALERTS_EMPTY");

  const raw = data as unknown as Record<string, any>;
  const summary = raw.summary || {};
  return {
    version: n(raw.version) || 2,
    rule_version: n(raw.rule_version) || 1,
    branch_id: s(raw.branch_id, branchId),
    from: s(raw.from, from.toISOString()),
    to: s(raw.to, to.toISOString()),
    generated_at: s(raw.generated_at, to.toISOString()),
    summary: {
      total: n(summary.total),
      critical: n(summary.critical),
      warning: n(summary.warning),
      overdue_eta: n(summary.overdue_eta),
      stuck_in_transit: n(summary.stuck_in_transit),
      repeated_route_variance: n(summary.repeated_route_variance),
      repeated_product_variance: n(summary.repeated_product_variance),
    },
    alerts: (raw.alerts || []).map((row: Record<string, unknown>) => ({
      id: s(row.id),
      alert_type: s(row.alert_type),
      severity: severity(row.severity),
      category: "inventory_transfers" as const,
      priority: n(row.priority),
      title: s(row.title, "تنبيه تحويل مخزون"),
      message: s(row.message),
      metric_label: s(row.metric_label, "المؤشر"),
      metric_value: n(row.metric_value),
      metric_unit: s(row.metric_unit),
      action: s(row.action),
      href: s(row.href, "/reports/inventory-transfers"),
      evidence: (row.evidence && typeof row.evidence === "object" ? row.evidence : {}) as Record<string, unknown>,
    })),
    data_quality: raw.data_quality || {},
  };
}

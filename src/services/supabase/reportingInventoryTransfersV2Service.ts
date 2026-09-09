import { supabase } from "@/integrations/supabase/client";

const n = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const nullableNumber = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export interface ReportingInventoryTransfersSummaryV2 {
  requested_outgoing: number;
  requested_incoming: number;
  in_transit_outgoing: number;
  in_transit_incoming: number;
  in_transit_outgoing_measure: number;
  in_transit_incoming_measure: number;
  in_transit_outgoing_cost: number | null;
  in_transit_incoming_cost: number | null;
  received_in_period: number;
  received_with_variance_in_period: number;
  received_measure_in_period: number;
  absolute_variance_measure_in_period: number;
  absolute_variance_cost_in_period: number | null;
  variance_rate_percent: number;
  cancelled_in_period: number;
  average_transit_hours: number | null;
  overdue_transfer_tasks: number;
  open_variance_tasks: number;
}

export interface ReportingInventoryTransferRowV2 {
  id: string;
  transfer_number: string;
  direction: "outgoing" | "incoming";
  from_branch_name: string;
  to_branch_name: string;
  status: string;
  items_count: number;
  shipped_measure: number;
  received_measure: number;
  variance_measure: number;
  cost_value: number | null;
  requested_at: string | null;
  dispatched_at: string | null;
  received_at: string | null;
  expected_arrival_date: string | null;
}

export interface ReportingInventoryTransfersV2 {
  version: number;
  branch_id: string;
  from: string;
  to: string;
  permissions: { can_view_profit: boolean };
  summary: ReportingInventoryTransfersSummaryV2;
  recent_transfers: ReportingInventoryTransferRowV2[];
  data_quality: { source?: string; legacy_rows: number };
}

export async function fetchReportingInventoryTransfersV2(branchId: string, from: Date, to: Date): Promise<ReportingInventoryTransfersV2> {
  const { data, error } = await supabase.rpc("get_reporting_inventory_transfers_v2" as never, {
    p_branch_id: branchId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  } as never);
  if (error) throw error;
  if (!data) throw new Error("REPORTING_INVENTORY_TRANSFERS_EMPTY");

  const raw = data as unknown as Record<string, unknown>;
  const summary = (raw.summary || {}) as Record<string, unknown>;
  const permissions = (raw.permissions || {}) as Record<string, unknown>;
  const quality = (raw.data_quality || {}) as Record<string, unknown>;

  return {
    version: n(raw.version) || 2,
    branch_id: String(raw.branch_id || branchId),
    from: String(raw.from || from.toISOString()),
    to: String(raw.to || to.toISOString()),
    permissions: { can_view_profit: Boolean(permissions.can_view_profit) },
    summary: {
      requested_outgoing: n(summary.requested_outgoing),
      requested_incoming: n(summary.requested_incoming),
      in_transit_outgoing: n(summary.in_transit_outgoing),
      in_transit_incoming: n(summary.in_transit_incoming),
      in_transit_outgoing_measure: n(summary.in_transit_outgoing_measure),
      in_transit_incoming_measure: n(summary.in_transit_incoming_measure),
      in_transit_outgoing_cost: nullableNumber(summary.in_transit_outgoing_cost),
      in_transit_incoming_cost: nullableNumber(summary.in_transit_incoming_cost),
      received_in_period: n(summary.received_in_period),
      received_with_variance_in_period: n(summary.received_with_variance_in_period),
      received_measure_in_period: n(summary.received_measure_in_period),
      absolute_variance_measure_in_period: n(summary.absolute_variance_measure_in_period),
      absolute_variance_cost_in_period: nullableNumber(summary.absolute_variance_cost_in_period),
      variance_rate_percent: n(summary.variance_rate_percent),
      cancelled_in_period: n(summary.cancelled_in_period),
      average_transit_hours: nullableNumber(summary.average_transit_hours),
      overdue_transfer_tasks: n(summary.overdue_transfer_tasks),
      open_variance_tasks: n(summary.open_variance_tasks),
    },
    recent_transfers: Array.isArray(raw.recent_transfers) ? (raw.recent_transfers as Record<string, unknown>[]).map((row) => ({
      id: String(row.id || ""),
      transfer_number: String(row.transfer_number || "—"),
      direction: row.direction === "incoming" ? "incoming" : "outgoing",
      from_branch_name: String(row.from_branch_name || "فرع"),
      to_branch_name: String(row.to_branch_name || "فرع"),
      status: String(row.status || ""),
      items_count: n(row.items_count),
      shipped_measure: n(row.shipped_measure),
      received_measure: n(row.received_measure),
      variance_measure: n(row.variance_measure),
      cost_value: nullableNumber(row.cost_value),
      requested_at: row.requested_at == null ? null : String(row.requested_at),
      dispatched_at: row.dispatched_at == null ? null : String(row.dispatched_at),
      received_at: row.received_at == null ? null : String(row.received_at),
      expected_arrival_date: row.expected_arrival_date == null ? null : String(row.expected_arrival_date),
    })) : [],
    data_quality: {
      source: quality.source == null ? undefined : String(quality.source),
      legacy_rows: n(quality.legacy_rows),
    },
  };
}
